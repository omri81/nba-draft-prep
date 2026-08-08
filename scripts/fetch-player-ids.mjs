#!/usr/bin/env node
/**
 * One-time (occasionally re-run) script. NOT part of the app bundle build.
 *
 *   npm run fetch-ids
 *
 * Produces src/data/playerIds.json: { "<normalized name>": <nba player id>, ... }
 * Headshots are then https://cdn.nba.com/headshots/nba/latest/1040x760/<id>.png
 *
 * Primary source:  stats.nba.com playerindex (needs browser-ish headers).
 * Fallback source: the nbastatR / "NBA player list" dataset mirrored on GitHub.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../src/data/playerIds.json')

/** Keep this byte-identical in behaviour to src/lib/normalize.ts */
function normalizeName(raw) {
  if (!raw) return ''
  let s = String(raw).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  s = s.toLowerCase()
  // "Towns, Karl-Anthony" -> "karl-anthony towns"
  if (s.includes(',')) {
    const [last, first] = s.split(',', 2)
    if (first && first.trim()) s = `${first.trim()} ${last.trim()}`
  }
  s = s.replace(/[.'`’]/g, '')
  s = s.replace(/[-_]/g, ' ')
  s = s.replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
  s = s.replace(/[^a-z0-9 ]/g, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

const NBA_HEADERS = {
  Host: 'stats.nba.com',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  Connection: 'keep-alive',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
}

function currentSeason() {
  const now = new Date()
  // NBA season flips over in October
  const startYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

async function fromStatsNba(season) {
  const url = `https://stats.nba.com/stats/playerindex?College=&Country=&DraftPick=&DraftRound=&DraftYear=&Height=&Historical=1&LeagueID=00&Season=${season}&SeasonType=Regular+Season&TeamID=0&Weight=`
  const res = await fetchWithTimeout(url, { headers: NBA_HEADERS })
  if (!res.ok) throw new Error(`stats.nba.com ${res.status}`)
  const json = await res.json()
  const rs = json.resultSets?.[0]
  if (!rs) throw new Error('unexpected payload')
  const h = rs.headers
  const iId = h.indexOf('PERSON_ID')
  const iFirst = h.indexOf('PLAYER_FIRST_NAME')
  const iLast = h.indexOf('PLAYER_LAST_NAME')
  const iTo = h.indexOf('TO_YEAR')
  const rows = rs.rowSet.map((r) => ({
    id: r[iId],
    name: `${r[iFirst] ?? ''} ${r[iLast] ?? ''}`.trim(),
    toYear: Number(r[iTo]) || 0,
  }))
  return rows
}

async function fromGithubMirror() {
  // Maintained public mirrors of the same player index. First one that works wins.
  const candidates = [
    'https://raw.githubusercontent.com/bttmly/nba/master/data/players.json',
    'https://raw.githubusercontent.com/dcstats/CBBpy/main/nba_players.json',
  ]
  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url)
      if (!res.ok) continue
      const json = await res.json()
      const arr = Array.isArray(json) ? json : json.players || []
      const rows = arr
        .map((p) => ({
          id: p.playerId ?? p.personId ?? p.PERSON_ID ?? p.id,
          name:
            p.fullName ??
            [p.firstName ?? p.temporaryDisplayName, p.lastName].filter(Boolean).join(' '),
          toYear: Number(p.toYear ?? p.TO_YEAR) || 0,
        }))
        .filter((p) => p.id && p.name)
      if (rows.length) {
        console.log(`  (via ${url})`)
        return rows
      }
    } catch {
      /* try next */
    }
  }
  throw new Error('no fallback mirror reachable')
}

async function main() {
  const season = process.argv[2] || currentSeason()
  console.log(`Fetching NBA player index for ${season}...`)

  let rows
  try {
    rows = await fromStatsNba(season)
    console.log(`  stats.nba.com returned ${rows.length} players`)
  } catch (err) {
    console.warn(`  stats.nba.com failed (${err.message}); trying GitHub mirror...`)
    rows = await fromGithubMirror()
    console.log(`  mirror returned ${rows.length} players`)
  }

  // Newest player wins a normalized-name collision (e.g. Gary Payton / Gary Payton II).
  rows.sort((a, b) => a.toYear - b.toYear)

  const map = {}
  let skipped = 0
  for (const p of rows) {
    const key = normalizeName(p.name)
    if (!key) {
      skipped++
      continue
    }
    map[key] = Number(p.id)
  }

  const sorted = Object.fromEntries(Object.keys(map).sort().map((k) => [k, map[k]]))

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(sorted, null, 0) + '\n', 'utf8')
  console.log(`Wrote ${Object.keys(sorted).length} names -> ${OUT}${skipped ? ` (${skipped} skipped)` : ''}`)
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
