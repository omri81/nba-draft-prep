import type { AppData, Player, Prefs } from '../types'

const V = 'v1'
export const KEYS = {
  players: `nbadp:${V}:players`,
  order: `nbadp:${V}:order`,
  drafted: `nbadp:${V}:drafted`,
  meta: `nbadp:${V}:meta`,
  prefs: `nbadp:${V}:prefs`,
} as const

export const EMPTY_DATA: AppData = {
  players: [],
  order: [],
  drafted: [],
  importedAt: null,
  sourceFile: null,
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
  const meta = read<{ importedAt: number | null; sourceFile: string | null }>(KEYS.meta, {
    importedAt: null,
    sourceFile: null,
  })
  return {
    players: read<Player[]>(KEYS.players, []),
    order: read<string[]>(KEYS.order, []),
    drafted: read<string[]>(KEYS.drafted, []),
    importedAt: meta.importedAt ?? null,
    sourceFile: meta.sourceFile ?? null,
  }
}

export function saveData(data: AppData): void {
  write(KEYS.players, data.players)
  write(KEYS.order, data.order)
  write(KEYS.drafted, data.drafted)
  write(KEYS.meta, { importedAt: data.importedAt, sourceFile: data.sourceFile })
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

export function clearAll(): void {
  for (const k of Object.values(KEYS)) localStorage.removeItem(k)
}

/**
 * Merge a freshly parsed sheet into existing state.
 *
 * - Players already on the board keep their exact position in my custom order.
 * - Players in the new file I have not seen before are appended at the bottom
 *   and flagged `isNew`.
 * - Players that vanished from the new file drop off the board (their
 *   projections no longer exist), but their drafted flag is harmless if kept.
 */
export function mergeImport(prev: AppData, incoming: Player[], fileName: string): AppData {
  const incomingById = new Map(incoming.map((p) => [p.id, p]))
  const knownIds = new Set(prev.players.map((p) => p.id))
  const isFirstImport = prev.players.length === 0

  // Existing order, minus anyone no longer in the file.
  const keptOrder = prev.order.filter((id) => incomingById.has(id))
  const inOrder = new Set(keptOrder)

  // Anything in the file that is not already placed, in the file's own order
  // (Basketball Monster ships it sorted by value, which is a sane default).
  const appended = incoming.map((p) => p.id).filter((id) => !inOrder.has(id))

  const players = incoming.map((p) => ({
    ...p,
    isNew: isFirstImport ? false : !knownIds.has(p.id),
  }))

  return {
    players,
    order: [...keptOrder, ...appended],
    drafted: prev.drafted.filter((id) => incomingById.has(id)),
    importedAt: Date.now(),
    sourceFile: fileName,
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
  const d = json.data
  if (!Array.isArray(d.players) || !Array.isArray(d.order)) {
    throw new Error('Backup file is missing players or order.')
  }
  return {
    data: {
      players: d.players,
      order: d.order,
      drafted: Array.isArray(d.drafted) ? d.drafted : [],
      importedAt: d.importedAt ?? null,
      sourceFile: d.sourceFile ?? null,
    },
    prefs: {
      ...DEFAULT_PREFS,
      ...(json.prefs ?? {}),
      draft: { ...DEFAULT_PREFS.draft, ...(json.prefs?.draft ?? {}) },
    },
  }
}
