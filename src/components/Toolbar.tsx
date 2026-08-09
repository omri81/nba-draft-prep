import { useEffect, useRef, useState } from 'react'
import { POSITIONS } from '../types'

interface Props {
  remaining: number
  total: number
  query: string
  onQuery: (q: string) => void
  positions: string[]
  onTogglePosition: (pos: string) => void
  hideDrafted: boolean
  onToggleHideDrafted: () => void
  nextPick: { number: number; round: number; onClock: boolean } | null
  onOpenDraftSetup: () => void
  onImportProjections: () => void
  onExportData: () => void
  onImportData: () => void
  onClearNew: () => void
  onResetDrafted: () => void
  onResetAll: () => void
  hasNew: boolean
  sourceFile: string | null
  importedAt: number | null
}

export function Toolbar(props: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [menuOpen])

  const run = (fn: () => void) => () => {
    setMenuOpen(false)
    fn()
  }

  return (
    <header className="toolbar">
      <div className="toolbar__top">
        <div className="toolbar__title">
          <div>
            <strong>{props.remaining}</strong> left
            <span className="toolbar__sub">of {props.total}</span>
          </div>
          {props.nextPick && (
            <div className={`nextpick${props.nextPick.onClock ? ' nextpick--now' : ''}`}>
              {props.nextPick.onClock ? "You're up" : 'Next'} · #{props.nextPick.number} · R
              {props.nextPick.round}
            </div>
          )}
        </div>

        <div className="toolbar__actions" ref={menuRef}>
          <button
            type="button"
            className={`pill${props.hideDrafted ? ' pill--on' : ''}`}
            onClick={props.onToggleHideDrafted}
          >
            {props.hideDrafted ? 'Hiding drafted' : 'Hide drafted'}
          </button>
          <button
            type="button"
            className="pill pill--icon"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <button type="button" onClick={run(props.onOpenDraftSetup)}>
                Draft slot…
              </button>
              <hr />
              <button type="button" onClick={run(props.onImportProjections)}>
                Import projections (.xlsx)
              </button>
              <button type="button" onClick={run(props.onExportData)}>
                Export data (.json)
              </button>
              <button type="button" onClick={run(props.onImportData)}>
                Import data (.json)
              </button>
              <hr />
              {props.hasNew && (
                <button type="button" onClick={run(props.onClearNew)}>
                  Clear “new” badges
                </button>
              )}
              <button type="button" onClick={run(props.onResetDrafted)}>
                Un-draft everyone
              </button>
              <button type="button" className="danger" onClick={run(props.onResetAll)}>
                Erase all data
              </button>
              {props.sourceFile && (
                <p className="menu__note">
                  {props.sourceFile}
                  {props.importedAt && (
                    <> · {new Date(props.importedAt).toLocaleDateString()}</>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="toolbar__row">
        <div className="search">
          <input
            type="search"
            inputMode="search"
            placeholder="Search players"
            value={props.query}
            onChange={(e) => props.onQuery(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {props.query && (
            <button type="button" className="search__clear" onClick={() => props.onQuery('')}>
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="toolbar__row toolbar__positions">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            type="button"
            className={`chip${props.positions.includes(pos) ? ' chip--on' : ''}`}
            onClick={() => props.onTogglePosition(pos)}
          >
            {pos}
          </button>
        ))}
      </div>
    </header>
  )
}
