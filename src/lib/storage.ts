import type { AppData, MockState, Player, Prefs, ProjectionSource } from '../types'

const V = 'v1'
export const KEYS = {
  sources: `nbadp:${V}:sources`,
  activeSource: `nbadp:${V}:activeSource`,
  /** Pre-multi-source keys, still read once so an existing board migrates. */
  players: `nbadp:${V}:players`,
  order: `nbadp:${V}:order`,
  drafted: `nbadp:${V}:drafted`,
  meta: `nbadp:${V}:meta`,
  prefs: `nbadp:${V}:prefs`,
  mock: `nbadp:${V}:mock`,
} as const

export const EMPTY_DATA: AppData = {
  sources: {},
  activeSourceId: null,
  order: [],
  drafted: [],
}

export const DEFAULT_PREFS: Prefs = {
  hideDrafted: false,
  positions: [],
  // Third-round reversal on by default — that's my league's rule.
  draft: { teams: 10, pick: null, thirdRoundReversal: true },
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    // Quota or private-mode failure. Surfaced loudly because losing the board
    // mid-draft is the one thing this app must not do quietly.
    console.error('Failed to save to localStorage', err)
    throw new Error(
      'Could not save — device storage is full or blocked. Export your data now.',
    )
  }
}

export function loadData(): AppData {
  const order = read<string[]>(KEYS.order, [])
  const drafted = read<string[]>(KEYS.drafted, [])
  const sources = read<Record<string, ProjectionSource>>(KEYS.sources, {})

  if (Object.keys(sources).length > 0) {
    const activeSourceId = read<string | null>(KEYS.activeSource, null)
    return {
      sources,
      activeSourceId: activeSourceId && sources[activeSourceId] ? activeSourceId : Object.keys(sources)[0],
      order,
      drafted,
    }
  }

  // Migration from the single-source layout: fold the old players array into
  // one source so an existing board survives the upgrade untouched.
  const legacy = read<Player[]>(KEYS.players, [])
  if (legacy.length === 0) return { ...EMPTY_DATA, order, drafted }
  const meta = read<{ importedAt: number | null; sourceFile: string | null }>(KEYS.meta, {
    importedAt: null,
    sourceFile: null,
  })
  const id = /monster|bbm/i.test(meta.sourceFile ?? '') ? 'bbm' : 'custom'
  const migrated: AppData = {
    sources: {
      [id]: {
        id,
        label: id === 'bbm' ? 'Basketball Monster' : 'Projections',
        players: legacy,
        importedAt: meta.importedAt ?? Date.now(),
        sourceFile: meta.sourceFile,
      },
    },
    activeSourceId: id,
    order,
    drafted,
  }

  // Write the upgrade through and drop the old keys. Without this the board
  // still loads, but it re-migrates on every launch and the legacy players
  // blob sits there forever next to the new one, doubling what we store.
  try {
    write(KEYS.sources, migrated.sources)
    write(KEYS.activeSource, migrated.activeSourceId)
    localStorage.removeItem(KEYS.players)
    localStorage.removeItem(KEYS.meta)
  } catch {
    /* Loading must succeed even if the upgrade write cannot. */
  }
  return migrated
}

export function saveData(data: AppData): void {
  write(KEYS.sources, data.sources)
  write(KEYS.activeSource, data.activeSourceId)
  write(KEYS.order, data.order)
  write(KEYS.drafted, data.drafted)
}

export function saveActiveSource(id: string | null): void {
  write(KEYS.activeSource, id)
}

export function saveOrder(order: string[]): void {
  write(KEYS.order, order)
}

export function saveDrafted(drafted: string[]): void {
  write(KEYS.drafted, drafted)
}

export function loadPrefs(): Prefs {
  const stored = read<Partial<Prefs>>(KEYS.prefs, {})
  // `draft` is nested, so merge it explicitly — prefs saved before the draft
  // settings existed would otherwise come back undefined.
  return {
    ...DEFAULT_PREFS,
    ...stored,
    draft: { ...DEFAULT_PREFS.draft, ...(stored.draft ?? {}) },
  }
}

export function savePrefs(prefs: Prefs): void {
  write(KEYS.prefs, prefs)
}

/**
 * The mock draft lives in its own key and is never merged into the board.
 * It reads my rank order; it must never write to it.
 */
export function loadMock(): MockState | null {
  const m = read<MockState | null>(KEYS.mock, null)
  if (!m || !Array.isArray(m.picks) || !m.teams) return null
  return m
}

export function saveMock(mock: MockState | null): void {
  if (mock === null) localStorage.removeItem(KEYS.mock)
  else write(KEYS.mock, mock)
}

export function clearAll(): void {
  for (const k of Object.values(KEYS)) localStorage.removeItem(k)
}

/**
 * Fold a freshly parsed sheet into one source.
 *
 * - My custom order is never reordered. It is the union across sources, so a
 *   player only in the *other* source keeps his slot.
 * - Players this file introduces to the board are appended at the bottom and
 *   flagged `isNew`.
 * - Drafted flags are left alone entirely.
 */
export function mergeSource(
  prev: AppData,
  incoming: Player[],
  source: { id: string; label: string; sourceFile: string | null; sheetUrl?: string },
): AppData {
  const known = new Set(prev.order)
  const isFirstEver = prev.order.length === 0

  const appended = incoming.map((p) => p.id).filter((id) => !known.has(id))
  const players = incoming.map((p) => ({
    ...p,
    isNew: isFirstEver ? false : !known.has(p.id),
  }))

  const existing = prev.sources[source.id]
  return {
    ...prev,
    sources: {
      ...prev.sources,
      [source.id]: {
        id: source.id,
        label: source.label,
        players,
        importedAt: Date.now(),
        sourceFile: source.sourceFile,
        sheetUrl: source.sheetUrl ?? existing?.sheetUrl,
      },
    },
    activeSourceId: source.id,
    order: [...prev.order, ...appended],
  }
}

export function setSheetUrl(prev: AppData, sourceId: string, sheetUrl: string | undefined): AppData {
  const src = prev.sources[sourceId]
  if (!src) return prev
  return { ...prev, sources: { ...prev.sources, [sourceId]: { ...src, sheetUrl } } }
}

export function removeSource(prev: AppData, sourceId: string): AppData {
  const sources = { ...prev.sources }
  delete sources[sourceId]
  const ids = Object.keys(sources)
  return {
    ...prev,
    sources,
    activeSourceId: prev.activeSourceId === sourceId ? (ids[0] ?? null) : prev.activeSourceId,
  }
}

export interface BackupFile {
  app: 'nba-draft-prep'
  version: 1
  exportedAt: string
  data: AppData
  prefs: Prefs
}

export function makeBackup(data: AppData, prefs: Prefs): BackupFile {
  return {
    app: 'nba-draft-prep',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
    prefs,
  }
}

export function parseBackup(text: string): { data: AppData; prefs: Prefs } {
  const json = JSON.parse(text) as Partial<BackupFile>
  if (json.app !== 'nba-draft-prep' || !json.data) {
    throw new Error('That is not a draft-prep backup file.')
  }
  const d = json.data as Partial<AppData> & { players?: Player[]; sourceFile?: string | null }
  if (!Array.isArray(d.order)) throw new Error('Backup file is missing the player order.')

  // Backups written before multi-source support carry a flat players array.
  let sources = d.sources
  if (!sources || Object.keys(sources).length === 0) {
    if (!Array.isArray(d.players)) throw new Error('Backup file has no projections in it.')
    const id = /monster|bbm/i.test(d.sourceFile ?? '') ? 'bbm' : 'custom'
    sources = {
      [id]: {
        id,
        label: id === 'bbm' ? 'Basketball Monster' : 'Projections',
        players: d.players,
        importedAt: Date.now(),
        sourceFile: d.sourceFile ?? null,
      },
    }
  }
  return {
    data: {
      sources,
      activeSourceId: d.activeSourceId && sources[d.activeSourceId] ? d.activeSourceId : Object.keys(sources)[0],
      order: d.order,
      drafted: Array.isArray(d.drafted) ? d.drafted : [],
    },
    prefs: {
      ...DEFAULT_PREFS,
      ...(json.prefs ?? {}),
      draft: { ...DEFAULT_PREFS.draft, ...(json.prefs?.draft ?? {}) },
    },
  }
}
