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
  reb: ['reb', 'rebounds', 'treb', 'trb', 'rpg', 'rg', 'rb', 'rebs', 'tr'],
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
  tpm: ['3pm', '3g', '3pg', '3s', '3ptm', '3p', 'tpm', 'threes', '3ptmade', 'three', '3', 'fg3m', '1500'],
  tpa: ['3pa', '3pag', '3pta', 'tpa', '3ptatt', 'fg3a'],

  adp: ['adp', 'ftadp', 'yadp', 'espnadp', 'avgdraftpos', 'averagedraftposition'],
  value: ['value', 'val', 'totalvalue', 'total', 'v', 'zscore', 'z', 'score'],
  // 'r' is Hashtag's "R#" column once the # is stripped.
  rank: ['rank', 'rk', 'overallrank', 'ovr', 'overall', 'no', 'r'],
}

const STAT_KEYS: StatKey[] = [
  'gp', 'min', 'pts', 'reb', 'ast', 'stl', 'blk', 'to',
  'fgm', 'fga', 'fgPct', 'ftm', 'fta', 'ftPct', 'tpm', 'tpa',
  'adp', 'value', 'rank',
]

export type SourceKind = 'bbm' | 'hashtag' | 'custom'

export interface ParseResult {
  players: Player[]
  /** Canonical key -> the sheet's original header text, for debugging. */
  mapping: Record<string, string>
  skipped: number
  kind: SourceKind
  label: string
}

const SOURCE_LABELS: Record<SourceKind, string> = {
  bbm: 'Basketball Monster',
  hashtag: 'Hashtag Basketball',
  custom: 'Projections',
}

/**
 * Which site produced this sheet, guessed from columns only that site emits.
 * Basketball Monster ships per-category value columns (pV, toV, Minus1V);
 * Hashtag ships an R#/TOTAL pair and the compound percentage format.
 */
function detectKind(headers: string[], rows: unknown[][]): SourceKind {
  const h = new Set(headers.map(normalizeHeader).filter(Boolean))
  if (['pv', 'tov', 'minus1v', 'fg%v', 'ft%v'].some((k) => h.has(k))) return 'bbm'
  if (h.has('1500') || (h.has('total') && h.has('adp'))) return 'hashtag'
  const compound = rows.slice(0, 12).some((r) => (r ?? []).some((c) => parseCompoundPct(c)))
  return compound ? 'hashtag' : 'custom'
}

/**
 * A pasted table can lose its first header cell, leaving every label sitting
 * one column left of the data it describes (Hashtag's export does exactly
 * this — the "R#" cell goes missing). Score both alignments by whether the
 * column claimed as the player name actually holds names.
 */
function detectOffset(rows: unknown[][], nameIdx: number): number {
  const looksLikeName = (v: unknown) =>
    typeof v === 'string' && /[a-z]{2,}/i.test(v) && !/^[\d.]+$/.test(v.trim())
  const score = (off: number) => {
    let seen = 0
    let good = 0
    for (const r of rows.slice(0, 25)) {
      const v = (r ?? [])[nameIdx + off]
      if (v === null || v === undefined || v === '') continue
      seen++
      if (looksLikeName(v)) good++
    }
    return seen ? good / seen : 0
  }
  return score(1) > score(0) ? 1 : 0
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

/**
 * Hashtag writes percentages as "0.534(11.1/20.7)" — the rate plus the makes
 * and attempts behind it. Worth unpacking: it hands us attempts for free.
 */
const COMPOUND_PCT = /^\s*([\d.]+)\s*\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)\s*$/

function parseCompoundPct(v: unknown): { pct: number; made: number; att: number } | undefined {
  if (typeof v !== 'string') return undefined
  const m = COMPOUND_PCT.exec(v)
  if (!m) return undefined
  const pct = Number(m[1]), made = Number(m[2]), att = Number(m[3])
  if (![pct, made, att].every(Number.isFinite)) return undefined
  return { pct, made, att }
}

function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  const compound = parseCompoundPct(v)
  if (compound) return compound.pct
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
  const bytes = new Uint8Array(buffer)
  const isXlsx = bytes[0] === 0x50 && bytes[1] === 0x4b // "PK" zip container
  const isXls = bytes[0] === 0xd0 && bytes[1] === 0xcf // legacy OLE compound file
  // cellDates keeps BBM's projection-date column from showing up as 45921.
  // Text formats have to be decoded as UTF-8 by hand — handed raw bytes,
  // SheetJS assumes a single-byte codepage and "Şengün" arrives as "SengÃ¼n".
  const wb =
    isXlsx || isXls
      ? XLSX.read(buffer, { type: 'array', cellDates: true })
      : XLSX.read(new TextDecoder('utf-8').decode(bytes), { type: 'string', cellDates: true })
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
  const dataRows = rows.slice(headerIdx + 1)
  const offset = detectOffset(dataRows, cols.name)
  const at = (row: unknown[], key: string): unknown => {
    const idx = cols[key]
    return idx === undefined ? undefined : row[idx + offset]
  }

  const players: Player[] = []
  const seenIds = new Set<string>()
  let skipped = 0

  for (const raw of dataRows) {
    const row = raw ?? []
    const rawName = at(row, 'name')
    // Hashtag repeats its header every dozen rows; those land here as rows
    // whose name cell is literally the word "PLAYER".
    if (ALIASES.name.includes(normalizeHeader(rawName))) {
      skipped++
      continue
    }
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
      if (cols[key] === undefined) continue
      const n = toNumber(at(row, key))
      if (n === undefined) continue
      stats[key] = key === 'fgPct' || key === 'ftPct' ? normalizePct(n) : n
    }

    // "0.534(11.1/20.7)" also carries makes and attempts.
    const fgC = parseCompoundPct(at(row, 'fgPct'))
    if (fgC) {
      stats.fgm ??= fgC.made
      stats.fga ??= fgC.att
    }
    const ftC = parseCompoundPct(at(row, 'ftPct'))
    if (ftC) {
      stats.ftm ??= ftC.made
      stats.fta ??= ftC.att
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

    const rawCells: Record<string, string | number> = {}
    headerText.forEach((label, idx) => {
      if (!label) return
      const v = row[idx + offset]
      if (v === null || v === undefined || v === '') return
      if (typeof v === 'number') rawCells[label] = v
      else if (v instanceof Date) rawCells[label] = v.toLocaleDateString()
      else rawCells[label] = String(v)
    })

    players.push({
      id,
      name: String(rawName).trim(),
      team: String(at(row, 'team') ?? '').trim(),
      pos: parsePositions(at(row, 'pos')),
      stats,
      raw: rawCells,
    })
    seenIds.add(id)
  }

  if (!players.length) throw new Error('No player rows found under the header.')

  const mapping: Record<string, string> = {}
  for (const [k, idx] of Object.entries(cols)) mapping[k] = headerText[idx] ?? ''

  const kind = detectKind(headerText, dataRows)
  return { players, mapping, skipped, kind, label: SOURCE_LABELS[kind] }
}
