/** Canonical stat keys we resolve Basketball Monster's columns down to. */
export type StatKey =
  | 'gp'
  | 'min'
  | 'pts'
  | 'reb'
  | 'ast'
  | 'stl'
  | 'blk'
  | 'to'
  | 'fgm'
  | 'fga'
  | 'fgPct'
  | 'ftm'
  | 'fta'
  | 'ftPct'
  | 'tpm'
  | 'tpa'
  | 'adp'
  | 'value'
  | 'rank'

export interface Player {
  /** Normalized name — the stable identity across re-imports. */
  id: string
  name: string
  team: string
  /** e.g. ['PG', 'SG'] — a player can be eligible at several spots. */
  pos: string[]
  stats: Partial<Record<StatKey, number>>
  /** Every column from the sheet, verbatim, for the detail page. */
  raw: Record<string, string | number>
  /** True when this player first appeared in the most recent import. */
  isNew?: boolean
}

export interface AppData {
  players: Player[]
  /** Player ids, in my custom draft order. */
  order: string[]
  drafted: string[]
  importedAt: number | null
  sourceFile: string | null
}

export interface DraftConfig {
  /** Teams in the league. */
  teams: number
  /** My slot in round 1, 1-based. null = not configured, no highlighting. */
  pick: number | null
  /** Round 3 repeats round 2's order instead of snaking back. */
  thirdRoundReversal: boolean
}

export interface MockPick {
  /** Overall pick number, 1-based. */
  pick: number
  /** Draft slot that made it, 1-based. */
  team: number
  playerId: string
}

export interface MockState {
  /** Snapshot of the draft config taken when the mock started, so editing
   *  the draft slot mid-mock can't renumber picks already made. */
  teams: number
  myTeam: number
  thirdRoundReversal: boolean
  rounds: number
  teamNames: string[]
  picks: MockPick[]
  startedAt: number
}

export interface Prefs {
  hideDrafted: boolean
  positions: string[]
  draft: DraftConfig
}

export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const

/** The 11 categories in my league, in the order I want to read them. */
export const CATEGORIES: { key: StatKey; label: string }[] = [
  { key: 'pts', label: 'PTS' },
  { key: 'fgm', label: 'FGM' },
  { key: 'ftm', label: 'FTM' },
  { key: 'tpm', label: '3PM' },
  { key: 'ast', label: 'AST' },
  { key: 'reb', label: 'REB' },
  { key: 'stl', label: 'STL' },
  { key: 'blk', label: 'BLK' },
  { key: 'to', label: 'TO' },
  { key: 'fgPct', label: 'FG%' },
  { key: 'ftPct', label: 'FT%' },
]

/** The five shown on each board row. */
export const ROW_STATS: { key: StatKey; label: string }[] = [
  { key: 'pts', label: 'p' },
  { key: 'reb', label: 'r' },
  { key: 'ast', label: 'a' },
  { key: 'stl', label: 's' },
  { key: 'blk', label: 'b' },
]
