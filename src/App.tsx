import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { AppData, DraftConfig, MockState, Player, Prefs } from './types'
import { parseWorkbook } from './lib/parse'
import { myPickNumbers, roundOf } from './lib/draft'
import {
  createMock,
  draftToClock,
  isComplete,
  takenIds,
  undoLast,
} from './lib/mock'
import { normalizeName } from './lib/normalize'
import {
  EMPTY_DATA,
  DEFAULT_PREFS,
  clearAll,
  loadData,
  loadPrefs,
  makeBackup,
  mergeSource,
  removeSource,
  setSheetUrl,
  saveActiveSource,
  parseBackup,
  saveData,
  saveDrafted,
  saveOrder,
  savePrefs,
  loadMock,
  saveMock,
} from './lib/storage'
import { PlayerRow } from './components/PlayerRow'
import { PlayerDetail } from './components/PlayerDetail'
import { Toolbar } from './components/Toolbar'
import { DraftSetup } from './components/DraftSetup'
import { MockSetup } from './components/MockSetup'
import { MockBar } from './components/MockBar'
import { MockResults } from './components/MockResults'
import { SourcesSheet } from './components/SourcesSheet'
import { fetchSheetCsv } from './lib/sheets'

interface Ranked {
  player: Player
  rank: number
}

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData())
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs())
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftSetupOpen, setDraftSetupOpen] = useState(false)
  const [mockSetupOpen, setMockSetupOpen] = useState(false)
  const [mock, setMock] = useState<MockState | null>(() => loadMock())
  const [standingsOpen, setStandingsOpen] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null)
  const setError = useCallback((text: string | null) => setNotice(text ? { text, bad: true } : null), [])
  const setInfo = useCallback((text: string) => setNotice({ text, bad: false }), [])

  const xlsxInput = useRef<HTMLInputElement>(null)
  const jsonInput = useRef<HTMLInputElement>(null)

  const activeSource = data.activeSourceId ? data.sources[data.activeSourceId] : undefined

  /** Players of the source currently on screen. */
  const byId = useMemo(
    () => new Map((activeSource?.players ?? []).map((p) => [p.id, p] as const)),
    [activeSource],
  )

  /**
   * Identity fallback: a player the active source has no projection for still
   * needs a name and position, so borrow them from whichever source knows him.
   * Stats stay empty — one set of numbers on screen at a time.
   */
  const identityById = useMemo(() => {
    const m = new Map<string, Player>()
    for (const src of Object.values(data.sources)) {
      for (const p of src.players) if (!m.has(p.id)) m.set(p.id, p)
    }
    return m
  }, [data.sources])
  const draftedSet = useMemo(() => new Set(data.drafted), [data.drafted])

  /** Master board: my custom order, rank = position in that order. */
  const ranked = useMemo<Ranked[]>(() => {
    const out: Ranked[] = []
    data.order.forEach((id, i) => {
      const player = byId.get(id)
      if (player) {
        out.push({ player, rank: i + 1 })
        return
      }
      const identity = identityById.get(id)
      if (identity) out.push({ player: { ...identity, stats: {} }, rank: i + 1 })
    })
    return out
  }, [data.order, byId, identityById])

  const mockTaken = useMemo(() => (mock ? takenIds(mock) : null), [mock])

  const visible = useMemo<Ranked[]>(() => {
    const q = query.trim().toLowerCase()
    let list = ranked

    // In a mock, the board is the pool of players still available.
    if (mockTaken) list = list.filter((r) => !mockTaken.has(r.player.id))

    if (q) {
      // Match the normalized id too, so typing "doncic" on a phone keyboard
      // still finds "Luka Dončić".
      const nq = normalizeName(q)
      list = list.filter(
        (r) => r.player.name.toLowerCase().includes(q) || (!!nq && r.player.id.includes(nq)),
      )
    }
    if (prefs.positions.length > 0) {
      list = list.filter((r) => r.player.pos.some((p) => prefs.positions.includes(p)))
    }
    if (mockTaken) {
      // Live drafted flags are irrelevant inside a mock.
    } else if (prefs.hideDrafted) {
      list = list.filter((r) => !draftedSet.has(r.player.id))
    } else {
      // Drafted players sink to the bottom instead of vanishing, so I can still
      // see who went and un-draft a mis-tap.
      const undrafted = list.filter((r) => !draftedSet.has(r.player.id))
      const drafted = list.filter((r) => draftedSet.has(r.player.id))
      list = undrafted.length === list.length ? list : [...undrafted, ...drafted]
    }
    return list
  }, [ranked, query, prefs.positions, prefs.hideDrafted, draftedSet, mockTaken])

  const visibleIds = useMemo(() => visible.map((r) => r.player.id), [visible])
  const remaining = ranked.length - data.drafted.length
  const hasNew = useMemo(
    () => Object.values(data.sources).some((s) => s.players.some((p) => p.isNew)),
    [data.sources],
  )

  const selected = selectedId ? ranked.find((r) => r.player.id === selectedId) : undefined

  // ---- my snake-draft slots ------------------------------------------------

  const pickRounds = useMemo(() => {
    const nums = myPickNumbers(prefs.draft, ranked.length)
    // rank -> round, so a row can label itself without re-deriving the schedule
    const m = new Map<number, number>()
    for (const n of nums) m.set(n, roundOf(n, prefs.draft.teams))
    return m
  }, [prefs.draft, ranked.length])

  const nextPick = useMemo(() => {
    if (pickRounds.size === 0) return null
    // Every crossed-off player is one pick that has come off the board.
    const made = data.drafted.length
    const mine = [...pickRounds.keys()].sort((a, b) => a - b)
    const n = mine.find((p) => p > made)
    if (n === undefined) return null
    return { number: n, round: pickRounds.get(n) ?? 1, onClock: n === made + 1 }
  }, [pickRounds, data.drafted.length])

  // ---- mock draft ----------------------------------------------------------

  const persistMock = useCallback((next: MockState | null) => {
    setMock(next)
    try {
      saveMock(next)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  const startMock = useCallback(
    (rounds: number, names: string[]) => {
      setMockSetupOpen(false)
      setQuery('')
      persistMock(createMock(prefs.draft, rounds, names))
    },
    [prefs.draft, persistMock],
  )

  const draftInMock = useCallback(
    (playerId: string) => {
      setMock((prev) => {
        if (!prev || isComplete(prev)) return prev
        const next = draftToClock(prev, playerId)
        try {
          saveMock(next)
        } catch (err) {
          setError((err as Error).message)
        }
        // Auto-open the table the moment the last pick lands.
        if (isComplete(next)) setStandingsOpen(true)
        return next
      })
    },
    [],
  )

  const undoMockPick = useCallback(() => {
    setMock((prev) => {
      if (!prev) return prev
      const next = undoLast(prev)
      try {
        saveMock(next)
      } catch {
        /* undo is not worth blocking on */
      }
      return next
    })
  }, [])

  const discardMock = useCallback(() => {
    if (!confirm('Discard this mock draft? Your board is unaffected.')) return
    setStandingsOpen(false)
    persistMock(null)
  }, [persistMock])

  // ---- persistence helpers -------------------------------------------------

  const persist = useCallback((next: AppData) => {
    setData(next)
    try {
      saveData(next)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  const updatePrefs = useCallback((patch: (prev: Prefs) => Partial<Prefs>) => {
    // Functional form on purpose: two quick chip taps must not read the same
    // stale `prefs` and drop one of the updates.
    setPrefs((prev) => {
      const next = { ...prev, ...patch(prev) }
      try {
        savePrefs(next)
      } catch {
        /* prefs are cosmetic — never block the draft over them */
      }
      return next
    })
  }, [])

  // ---- drafted -------------------------------------------------------------

  const toggleDrafted = useCallback((id: string) => {
    setData((prev) => {
      const has = prev.drafted.includes(id)
      const drafted = has ? prev.drafted.filter((d) => d !== id) : [...prev.drafted, id]
      try {
        saveDrafted(drafted)
      } catch (err) {
        setError((err as Error).message)
      }
      return { ...prev, drafted }
    })
  }, [])

  // ---- reordering ----------------------------------------------------------

  const sensors = useSensors(
    // A dedicated handle (touch-action: none) means we can activate on a short
    // drag without ever stealing a scroll gesture from the list.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const activeId = String(active.id)
      const overId = String(over.id)
      // Dropping onto a drafted row would mean landing at its master-order
      // slot, which is not where it appears on screen. Ignore it.
      if (draftedSet.has(overId)) return

      setData((prev) => {
        const from = prev.order.indexOf(activeId)
        const to = prev.order.indexOf(overId)
        if (from === -1 || to === -1) return prev
        const order = arrayMove(prev.order, from, to)
        try {
          saveOrder(order)
        } catch (err) {
          setError((err as Error).message)
        }
        return { ...prev, order }
      })
    },
    [draftedSet],
  )

  // ---- detail view + back button ------------------------------------------

  const openPlayer = useCallback((id: string) => {
    setSelectedId(id)
    window.history.pushState({ detail: id }, '')
  }, [])

  const closeDetail = useCallback(() => {
    if (window.history.state?.detail) window.history.back()
    else setSelectedId(null)
  }, [])

  useEffect(() => {
    const onPop = () => setSelectedId(null)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // ---- import / export -----------------------------------------------------

  const ingest = useCallback(
    async (buf: ArrayBuffer, fileName: string | null, sheetUrl?: string) => {
      const { players, skipped, kind, label } = await parseWorkbook(buf)
      const before = new Set(data.order)
      const added = players.filter((p) => !before.has(p.id)).length
      persist(mergeSource(data, players, { id: kind, label, sourceFile: fileName, sheetUrl }))
      setInfo(
        `${label}: ${players.length} players` +
          // "new" is only meaningful once there is already a board to be new to
          (before.size > 0 && added ? ` · ${added} new to the board` : '') +
          (skipped ? ` · ${skipped} rows skipped` : '') +
          ' · your order was kept',
      )
    },
    [data, persist, setInfo],
  )

  const onXlsxPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setBusy('Parsing projections…')
    setError(null)
    try {
      await ingest(await file.arrayBuffer(), file.name)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // ---- projection sources --------------------------------------------------

  const selectSource = useCallback((id: string) => {
    setData((prev) => {
      if (!prev.sources[id]) return prev
      try {
        saveActiveSource(id)
      } catch (err) {
        setError((err as Error).message)
      }
      return { ...prev, activeSourceId: id }
    })
  }, [])

  const linkSheet = useCallback(
    (id: string, url: string) => {
      const trimmed = url.trim()
      persist(setSheetUrl(data, id, trimmed || undefined))
      setInfo(trimmed ? 'Sheet linked. Use Refresh to pull the latest numbers.' : 'Sheet link removed.')
    },
    [data, persist, setInfo],
  )

  const refreshSource = useCallback(
    async (id: string) => {
      const src = data.sources[id]
      if (!src?.sheetUrl) return
      setBusy(`Refreshing ${src.label}…`)
      setError(null)
      try {
        await ingest(await fetchSheetCsv(src.sheetUrl), src.sourceFile, src.sheetUrl)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setBusy(null)
      }
    },
    [data.sources, ingest],
  )

  const dropSource = useCallback(
    (id: string) => {
      const src = data.sources[id]
      if (!src) return
      if (!confirm(`Remove ${src.label}? Your rank order and drafted players stay as they are.`)) return
      persist(removeSource(data, id))
    },
    [data, persist],
  )

  const onExportData = () => {
    const blob = new Blob([JSON.stringify(makeBackup(data, prefs), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `draft-prep-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const onJsonPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const restored = parseBackup(await file.text())
      persist(restored.data)
      setPrefs(restored.prefs)
      savePrefs(restored.prefs)
      const n = Object.keys(restored.data.sources).length
      setInfo(
        `Restored ${restored.data.order.length} ranked players from backup` +
          (n > 1 ? ` (${n} projection sets).` : '.'),
      )
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const clearNew = () => {
    const sources = Object.fromEntries(
      Object.entries(data.sources).map(([id, s]) => [
        id,
        { ...s, players: s.players.map((p) => ({ ...p, isNew: false })) },
      ]),
    )
    persist({ ...data, sources })
  }

  const resetDrafted = () => {
    if (!data.drafted.length) return
    if (!confirm('Un-draft everyone?')) return
    persist({ ...data, drafted: [] })
  }

  const resetAll = () => {
    if (!confirm('Erase projections, custom order and drafted flags? This cannot be undone.')) return
    clearAll()
    setData(EMPTY_DATA)
    setPrefs(DEFAULT_PREFS)
    setQuery('')
  }

  // ---- render --------------------------------------------------------------

  return (
    <div className="app">
      <Toolbar
        remaining={remaining}
        total={ranked.length}
        query={query}
        onQuery={setQuery}
        positions={prefs.positions}
        onTogglePosition={(pos) =>
          updatePrefs((p) => ({
            positions: p.positions.includes(pos)
              ? p.positions.filter((x) => x !== pos)
              : [...p.positions, pos],
          }))
        }
        hideDrafted={prefs.hideDrafted}
        onToggleHideDrafted={() => updatePrefs((p) => ({ hideDrafted: !p.hideDrafted }))}
        nextPick={mock ? null : nextPick}
        onOpenDraftSetup={() => setDraftSetupOpen(true)}
        mockActive={mock !== null}
        onOpenMockSetup={() => setMockSetupOpen(true)}
        onImportProjections={() => xlsxInput.current?.click()}
        onExportData={onExportData}
        onImportData={() => jsonInput.current?.click()}
        onClearNew={clearNew}
        onResetDrafted={resetDrafted}
        onResetAll={resetAll}
        hasNew={hasNew}
        sourceLabel={activeSource?.label ?? null}
        sourceCount={activeSource?.players.length ?? 0}
        onOpenSources={() => setSourcesOpen(true)}
      />

      {mock && (
        <MockBar
          mock={mock}
          onUndo={undoMockPick}
          onStandings={() => setStandingsOpen(true)}
          onDiscard={discardMock}
        />
      )}

      {(busy || notice) && (
        <div className={`notice${!busy && notice?.bad ? ' notice--error' : ''}`}>
          <span>{busy ?? notice?.text}</span>
          {!busy && (
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
              ✕
            </button>
          )}
        </div>
      )}

      <main className="board">
        {ranked.length === 0 ? (
          <div className="empty">
            <h1>Draft board</h1>
            <p>Import your Basketball Monster projections to get started.</p>
            <button type="button" className="btn" onClick={() => xlsxInput.current?.click()}>
              Import projections (.xlsx)
            </button>
            <p className="empty__hint">
              Basketball Monster or Hashtag — both work. Already have a backup? Use{' '}
              <strong>⋯ → Import data</strong>.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <p>No players match that filter.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
              <ul className="list">
                {visible.map(({ player, rank }) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    rank={rank}
                    drafted={draftedSet.has(player.id)}
                    sortable={!mock && !draftedSet.has(player.id)}
                    pickRound={mock ? 0 : pickRounds.get(rank) ?? 0}
                    mockMode={mock !== null}
                    onDraftToClock={draftInMock}
                    onOpen={openPlayer}
                    onToggleDrafted={toggleDrafted}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </main>

      {sourcesOpen && (
        <SourcesSheet
          data={data}
          busy={busy}
          onSelect={selectSource}
          onRefresh={refreshSource}
          onLinkSheet={linkSheet}
          onImportFile={() => {
            setSourcesOpen(false)
            xlsxInput.current?.click()
          }}
          onRemove={dropSource}
          onClose={() => setSourcesOpen(false)}
        />
      )}

      {mockSetupOpen && (
        <MockSetup
          config={prefs.draft}
          onChangeConfig={(patch) => updatePrefs((p) => ({ draft: { ...p.draft, ...patch } }))}
          onStart={startMock}
          onClose={() => setMockSetupOpen(false)}
        />
      )}

      {mock && standingsOpen && (
        <MockResults mock={mock} byId={byId} onBack={() => setStandingsOpen(false)} />
      )}

      {draftSetupOpen && (
        <DraftSetup
          config={prefs.draft}
          onChange={(patch: Partial<DraftConfig>) =>
            updatePrefs((p) => ({ draft: { ...p.draft, ...patch } }))
          }
          onClose={() => setDraftSetupOpen(false)}
        />
      )}

      {selected && (
        <PlayerDetail
          player={selected.player}
          rank={selected.rank}
          drafted={draftedSet.has(selected.player.id)}
          onBack={closeDetail}
          onToggleDrafted={toggleDrafted}
        />
      )}

      <input
        ref={xlsxInput}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={onXlsxPicked}
      />
      <input ref={jsonInput} type="file" accept=".json,application/json" hidden onChange={onJsonPicked} />
    </div>
  )
}
