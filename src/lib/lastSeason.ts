import raw from '../data/lastSeason.json?raw'
import type { StatKey } from '../types'
import { nbaIdFor } from './headshots'

interface Payload {
  season: string
  fetchedAt: string
  keys: StatKey[]
  teams: Record<string, string>
  players: Record<string, (number | null)[]>
}

/** Parsed once, same reasoning as playerIds.json — a string beats a literal. */
const DATA: Payload = JSON.parse(raw)

export const LAST_SEASON = DATA.season

export interface LastSeasonLine {
  team: string
  stats: Partial<Record<StatKey, number>>
}

const cache = new Map<string, LastSeasonLine | null>()

/**
 * Last season's actuals for a player, matched through the NBA player id we
 * already resolve for the headshot. Matching on the id rather than the name
 * means no second round of normalization to disagree with the first.
 *
 * Returns null for anyone who did not play — rookies, mostly, which is itself
 * worth showing.
 */
export function lastSeasonFor(name: string): LastSeasonLine | null {
  const id = nbaIdFor(name)
  if (id === null) return null
  const key = String(id)
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  const row = DATA.players[key]
  if (!row) {
    cache.set(key, null)
    return null
  }
  const stats: Partial<Record<StatKey, number>> = {}
  DATA.keys.forEach((k, i) => {
    const v = row[i]
    if (v !== null && v !== undefined) stats[k] = v
  })
  const line: LastSeasonLine = { team: DATA.teams[key] ?? '', stats }
  cache.set(key, line)
  return line
}
