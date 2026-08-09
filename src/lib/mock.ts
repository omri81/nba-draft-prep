import type { DraftConfig, MockState, Player, StatKey } from '../types'
import { CATEGORIES } from '../types'
import { roundOf, teamAtPick } from './draft'

/** Counting categories are plain sums of per-game production. */
const COUNTING: StatKey[] = ['pts', 'fgm', 'ftm', 'tpm', 'ast', 'reb', 'stl', 'blk', 'to']

/** Categories where a lower team total is better. */
const LOWER_IS_BETTER = new Set<StatKey>(['to'])

export function defaultTeamNames(teams: number, myTeam: number): string[] {
  return Array.from({ length: teams }, (_, i) => (i + 1 === myTeam ? 'You' : `Team ${i + 1}`))
}

export function createMock(config: DraftConfig, rounds: number, names?: string[]): MockState {
  const teams = config.teams
  const myTeam = config.pick ?? 1
  return {
    teams,
    myTeam,
    thirdRoundReversal: config.thirdRoundReversal,
    rounds,
    teamNames: names ?? defaultTeamNames(teams, myTeam),
    picks: [],
    startedAt: Date.now(),
  }
}

export function totalPicks(mock: MockState): number {
  return mock.teams * mock.rounds
}

export function isComplete(mock: MockState): boolean {
  return mock.picks.length >= totalPicks(mock)
}

export interface OnTheClock {
  pick: number
  round: number
  team: number
  isMe: boolean
}

export function onTheClock(mock: MockState): OnTheClock | null {
  if (isComplete(mock)) return null
  const pick = mock.picks.length + 1
  const team = teamAtPick(pick, mock.teams, mock.thirdRoundReversal)
  return { pick, round: roundOf(pick, mock.teams), team, isMe: team === mock.myTeam }
}

export function draftToClock(mock: MockState, playerId: string): MockState {
  const clock = onTheClock(mock)
  if (!clock) return mock
  if (mock.picks.some((p) => p.playerId === playerId)) return mock
  return {
    ...mock,
    picks: [...mock.picks, { pick: clock.pick, team: clock.team, playerId }],
  }
}

export function undoLast(mock: MockState): MockState {
  if (!mock.picks.length) return mock
  return { ...mock, picks: mock.picks.slice(0, -1) }
}

export function takenIds(mock: MockState): Set<string> {
  return new Set(mock.picks.map((p) => p.playerId))
}

export interface TeamStanding {
  team: number
  name: string
  isMe: boolean
  picks: { pick: number; round: number; player: Player }[]
  /** Per-game team production; fgPct/ftPct are true weighted rates. */
  totals: Partial<Record<StatKey, number>>
  /** 1 = best in the league for that category. */
  ranks: Partial<Record<StatKey, number>>
  rotoPoints: number
}

function sum(players: Player[], key: StatKey): number {
  let t = 0
  for (const p of players) t += p.stats[key] ?? 0
  return t
}

/**
 * League table for the mock. Percentages are aggregated the only correct way —
 * total makes over total attempts — never by averaging player percentages.
 *
 * Roto points: best in a category scores `teams`, worst scores 1, ties split
 * the points they span.
 */
export function standings(mock: MockState, byId: Map<string, Player>): TeamStanding[] {
  const rows: TeamStanding[] = []

  for (let t = 1; t <= mock.teams; t++) {
    const picks = mock.picks
      .filter((p) => p.team === t)
      .map((p) => ({ pick: p.pick, round: roundOf(p.pick, mock.teams), player: byId.get(p.playerId) }))
      .filter((p): p is { pick: number; round: number; player: Player } => Boolean(p.player))

    const players = picks.map((p) => p.player)
    const totals: Partial<Record<StatKey, number>> = {}
    for (const key of COUNTING) totals[key] = sum(players, key)

    const fga = sum(players, 'fga')
    const fta = sum(players, 'fta')
    totals.fga = fga
    totals.fta = fta
    totals.fgPct = fga > 0 ? sum(players, 'fgm') / fga : 0
    totals.ftPct = fta > 0 ? sum(players, 'ftm') / fta : 0

    rows.push({
      team: t,
      name: mock.teamNames[t - 1] ?? `Team ${t}`,
      isMe: t === mock.myTeam,
      picks,
      totals,
      ranks: {},
      rotoPoints: 0,
    })
  }

  for (const { key } of CATEGORIES) {
    const lower = LOWER_IS_BETTER.has(key)
    const ordered = [...rows].sort((a, b) => {
      const av = a.totals[key] ?? 0
      const bv = b.totals[key] ?? 0
      return lower ? av - bv : bv - av
    })

    // Walk ties as a block so they share the average of the points they cover.
    let i = 0
    while (i < ordered.length) {
      let j = i
      const v = ordered[i].totals[key] ?? 0
      while (j + 1 < ordered.length && (ordered[j + 1].totals[key] ?? 0) === v) j++
      const rank = i + 1
      let pts = 0
      for (let k = i; k <= j; k++) pts += rows.length - k
      const shared = pts / (j - i + 1)
      for (let k = i; k <= j; k++) {
        ordered[k].ranks[key] = rank
        ordered[k].rotoPoints += shared
      }
      i = j + 1
    }
  }

  return rows.sort((a, b) => b.rotoPoints - a.rotoPoints || a.team - b.team)
}

/** Formats a team total for the standings table. */
export function formatTotal(key: StatKey, v: number | undefined): string {
  if (v === undefined) return '–'
  if (key === 'fgPct' || key === 'ftPct') return v.toFixed(3).replace(/^0/, '')
  return v.toFixed(1)
}
