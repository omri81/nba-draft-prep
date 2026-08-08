import type { Player, StatKey } from '../types'
import { POSITIONS } from '../types'
import { normalizeHeader, normalizeName } from './normalize'

/**
 * Column aliases, keyed by our canonical name. Matched against
 * normalizeHeader() output, so "FG%", "fg %" and "Fg%" all collapse to "fg%".
 * Order matters within a list only for readability; first *column* that maps
 * to a canonical key wins, so put nothing ambiguous here.
 */
const ALIASES: Record<string, string[]> = {
  name: ['player', 'name', 'playername', 'players', 'fullname'],
  team: ['team', 'tm', 'teamabbr', 'teamname'],
  pos: ['pos', 'position', 'positions', 'poss', 'elig', 'eligibility', 'posn'],

  // Basketball Monster writes per-game columns as "p/g", "r/g", "fg/g" etc.,
  // which normalizeHeader collapses to "pg", "rg", "fgg".
  gp: ['gp', 'g', 'games', 'gamesplayed'],
  min: ['min', 'mp', 'minutes', 'mpg', 'mg', 'm'],
  pts: ['pts', 'points', 'ppg', 'pg', 'pt', 'p'],
  reb: ['reb', 'rebounds', 'treb', 'trb', 'rpg', 'rg', 'rb', 'rebs', 'tr', 'r'],
  ast: ['ast', 'assists', 'apg', 'ag', 'asts', 'as', 'a'],
  stl: ['stl', 'steals', 'spg', 'sg', 'stls', 'st', 's'],
  blk: ['blk', 'blocks', 'bpg', 'bg', 'blks', 'bl', 'b'],
  // "to/g" must win over BBM's "toV" (the turnover *value* column). It does,
  // because mapping takes the leftmost matching column and to/g comes first.
  to: ['to', 'tog', 'topg', 'tov', 'turnovers', 'tos', 'turnover'],

  fgm: ['fgm', 'fgg', 'fgmg', 'fgmade', 'fieldgoalsmade'],
  fga: ['fga', 'fgag', 'fgatt', 'fgattempts', 'fieldgoalsattempted'],
  fgPct: ['fg%', 'fgpct', 'fgpercent', 'fgpercentage', 'fieldgoal%', 'fg'],
  ftm: ['ftm', 'ftg', 'ftmg', 'ftmade', 'freethrowsmade'],
  fta: ['fta', 'ftag', 'ftatt', 'ftattempts', 'freethrowsattempted'],
  ftPct: ['ft%', 'ftpct', 'ftpercent', 'ftpercentage', 'freethrow%', 'ft'],
  tpm: ['3pm', '3g', '3pg', '3s', '3ptm', '3p', 'tpm', 'threes', '3ptmade', 'three', '3', 'fg3m'],
  tpa: ['3pa', '3pag', '3pta', 'tpa', '3ptatt', 'fg3a'],

  adp: ['adp', 'ftadp', 'yadp', 'espnadp', 'avgdraftpos', 'averagedraftposition'],
  value: ['value', 'val', 'totalvalue', 'v', 'zscore', 'z', 'score'],
  rank: ['rank', 'rk', 'overallrank', 'ovr', 'overall', 'no'],
}

const STAT_KEYS: StatKey[] = [
  'gp', 'min', 'pts', 'reb', 'ast', 'stl', 'blk', 'to',
  'fgm', 'fga', 'fgPct', 'ftm', 'fta', 'ftPct', 'tpm', 'tpa',
  'adp', 'value', 'rank',
]

export interface ParseResult {
  players: Player[]
  /** Canonical key -> the sheet's original header text, for debugging. */
  mapping: Record<string, string>
  skipped: number
}

/** Rows above the real header (title/date banners) are common in exports. */
function findHeaderRow(rows: unknown[][]): number {
  const limit = Math.min(rows.length, 20)
  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] ?? []).map(normalizeHeader).filter(Boolean)
    if (cells.length < 3) continue
    const hasName = cells.some((c) => ALIASES.name.includes(c))
    const statHits = cells.filter((c) =>
      STAT_KEYS.some((k) => ALIASES[k]?.includes(c)),
    ).length
    if (hasName && statHits >= 3) return i
  }
  return 0
}

function buildMapping(header: unknown[]): Record<string, number> {
  const cols: Record<string, number> = {}
  const seen = new Set<string>()
  header.forEach((cell, idx) => {
    const h = normalizeHeader(cell)
    if (!h) return
    for (const [canonical, aliases] of Object.entries(ALIASES)) {
      if (seen.has(canonical)) continue
      if (aliases.includes(h)) {
        cols[canonical] = idx
        seen.add(canonical)
        return
      }
    }
  })
  return cols
}

function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  const cleaned = String(v).replace(/[%,\s]/g, '').replace(/^\./, '0.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

function parsePositions(v: unknown): string[] {
  if (v === null || v === undefined) return []
  const parts = String(v)
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    // Handle glued forms like "PGSG" as well as "PG/SG".
    let rest = p
    while (rest.length) {
      const match = (POSITIONS as readonly string[]).find((pos) => rest.startsWith(pos))
      if (!match) {
        rest = rest.slice(1)
        continue
      }
      if (!out.includes(match)) out.push(match)
      rest = rest.slice(match.length)
    }
  }
  return out
}

/** Percentages arrive as either 0.482 or 48.2 depending on the export. */
function normalizePct(v: number | undefined): number | undefined {
  if (v === undefined) return undefined
  return v > 1.5 ? v / 100 : v
}

/**
 * Async because SheetJS is ~400KB and is only needed the moment I pick a file —
 * it stays out of the initial bundle so the board opens instantly on draft day.
 */
export async function parseWorkbook(buffer: ArrayBuffer): Promise<ParseResult> {
  const XLSX = await import('xlsx')
  // cellDates keeps BBM's projection-date column from showing up as 45921.
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('That file has no sheets in it.')
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: null,
  })
  if (!rows.length) throw new Error('That sheet is empty.')

  const headerIdx = findHeaderRow(rows)
  const header = rows[headerIdx] ?? []
  const cols = buildMapping(header)

  if (cols.name === undefined) {
    throw new Error(
      `Could not find a player-name column. Headers seen: ${header
        .filter(Boolean)
        .slice(0, 12)
        .join(', ')}`,
    )
  }

  const headerText = header.map((c) => (c === null || c === undefined ? '' : String(c).trim()))
  const players: Player[] = []
  const seenIds = new Set<string>()
  let skipped = 0

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const rawName = row[cols.name]
    const id = normalizeName(rawName)
    if (!id) {
      skipped++
      continue
    }
    if (seenIds.has(id)) {
      skipped++
      continue
    }

    const stats: Player['stats'] = {}
    for (const key of STAT_KEYS) {
      const idx = cols[key]
      if (idx === undefined) continue
      const n = toNumber(row[idx])
      if (n === undefined) continue
      stats[key] = key === 'fgPct' || key === 'ftPct' ? normalizePct(n) : n
    }

    // Basketball Monster ships FG%/FGA but no FGM, and FGM is one of my
    // league's categories — derive whichever side is missing.
    if (stats.fgPct === undefined && stats.fgm !== undefined && stats.fga) {
      stats.fgPct = stats.fgm / stats.fga
    } else if (stats.fgm === undefined && stats.fgPct !== undefined && stats.fga !== undefined) {
      stats.fgm = stats.fgPct * stats.fga
    }
    if (stats.ftPct === undefined && stats.ftm !== undefined && stats.fta) {
      stats.ftPct = stats.ftm / stats.fta
    } else if (stats.ftm === undefined && stats.ftPct !== undefined && stats.fta !== undefined) {
      stats.ftm = stats.ftPct * stats.fta
    }

    const raw: Record<string, string | number> = {}
    headerText.forEach((label, idx) => {
      if (!label) return
      const v = row[idx]
      if (v === null || v === undefined || v === '') return
      if (typeof v === 'number') raw[label] = v
      else if (v instanceof Date) raw[label] = v.toLocaleDateString()
      else raw[label] = String(v)
    })

    players.push({
      id,
      name: String(rawName).trim(),
      team: cols.team !== undefined ? String(row[cols.team] ?? '').trim() : '',
      pos: cols.pos !== undefined ? parsePositions(row[cols.pos]) : [],
      stats,
      raw,
    })
    seenIds.add(id)
  }

  if (!players.length) throw new Error('No player rows found under the header.')

  const mapping: Record<string, string> = {}
  for (const [k, idx] of Object.entries(cols)) mapping[k] = headerText[idx] ?? ''

  return { players, mapping, skipped }
}
