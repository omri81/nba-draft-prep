#!/usr/bin/env node
/**
 * One-time (once per season) script. NOT part of the app bundle build.
 *
 *   npm run fetch-last-season            # most recently completed season
 *   npm run fetch-last-season 2024-25    # or name one
 *
 * Produces src/data/lastSeason.json — last season's per-game actuals for every
 * player, keyed by NBA player id.
 *
 * Keyed by *id*, not name, on purpose: this endpoint returns PLAYER_ID from the
 * same id space as playerIds.json, so the app can go
 * name -> id (already resolved for the headshot) -> last season, with no second
 * round of name normalization to get wrong.
 *
 * Baked at build time rather than fetched live: stats.nba.com wants
 * browser-ish headers it will not honour cross-origin, and the app has to work
 * on draft night with no signal.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/lastSeason.json')

/** Order of the numbers stored per player. Mirrored in src/lib/lastSeason.ts. */
const KEYS = [
  'gp', 'min', 'pts', 'reb', 'ast', 'stl', 'blk', 'to',
  'fgm', 'fga', 'fgPct', 'ftm', 'fta', 'ftPct', 'tpm',
]

/** Our key -> the column name the API uses. */
const API_COLUMN = {
  gp: 'GP', min: 'MIN', pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK',
  to: 'TOV', fgm: 'FGM', fga: 'FGA', fgPct: 'FG_PCT', ftm: 'FTM', fta: 'FTA',
  ftPct: 'FT_PCT', tpm: 'FG3M',
}

const HEADERS = {
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

/** The season that has most recently finished. Seasons end in June. */
function lastCompletedSeason() {
  const now = new Date()
  // Before July, the season that started last calendar year is the finished one.
  const startYear = now.getMonth() >= 6 ? now.getFullYear() - 1 : now.getFullYear() - 2
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

function statsUrl(season) {
  const params = new URLSearchParams({
    College: '', Conference: '', Country: '', DateFrom: '', DateTo: '', Division: '',
    DraftPick: '', DraftYear: '', GameScope: '', GameSegment: '', Height: '',
    LastNGames: '0', LeagueID: '00', Location: '', MeasureType: 'Base', Month: '0',
    OpponentTeamID: '0', Outcome: '', PORound: '0', PaceAdjust: 'N', PerMode: 'PerGame',
    Period: '0', PlayerExperience: '', PlayerPosition: '', PlusMinus: 'N', Rank: 'N',
    Season: season, SeasonSegment: '', SeasonType: 'Regular Season', ShotClockRange: '',
    StarterBench: '', TeamID: '0', TwoWay: '', VsConference: '', VsDivision: '', Weight: '',
  })
  return `https://stats.nba.com/stats/leaguedashplayerstats?${params}`
}

async function main() {
  const season = process.argv[2] || lastCompletedSeason()
  console.log(`Fetching per-game actuals for ${season}...`)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30000)
  let json
  try {
    const res = await fetch(statsUrl(season), { headers: HEADERS, signal: ctrl.signal })
    if (!res.ok) throw new Error(`stats.nba.com returned ${res.status}`)
    json = await res.json()
  } finally {
    clearTimeout(timer)
  }

  const rs = json.resultSets?.[0]
  if (!rs?.rowSet?.length) throw new Error('No rows came back — is that a real season?')

  const idx = (name) => {
    const i = rs.headers.indexOf(name)
    if (i === -1) throw new Error(`Column ${name} missing from the response`)
    return i
  }
  const iId = idx('PLAYER_ID')
  const iTeam = idx('TEAM_ABBREVIATION')
  const cols = KEYS.map((k) => idx(API_COLUMN[k]))

  const players = {}
  const teams = {}
  for (const row of rs.rowSet) {
    const id = Number(row[iId])
    if (!Number.isFinite(id)) continue
    players[id] = cols.map((c) => {
      const v = Number(row[c])
      return Number.isFinite(v) ? v : null
    })
    teams[id] = row[iTeam] ?? ''
  }

  const payload = { season, fetchedAt: new Date().toISOString().slice(0, 10), keys: KEYS, teams, players }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload) + '\n', 'utf8')
  const kb = (JSON.stringify(payload).length / 1024).toFixed(0)
  console.log(`Wrote ${Object.keys(players).length} players (${kb} KB) -> ${OUT}`)
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
