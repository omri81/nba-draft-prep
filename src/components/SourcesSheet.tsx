import { useState } from 'react'
import type { AppData } from '../types'

interface Props {
  data: AppData
  busy: string | null
  onSelect: (id: string) => void
  onRefresh: (id: string) => void
  onLinkSheet: (id: string, url: string) => void
  onImportFile: () => void
  onRemove: (id: string) => void
  onClose: () => void
}

export function SourcesSheet(props: Props) {
  const { data } = props
  const sources = Object.values(data.sources)
  const [linking, setLinking] = useState<string | null>(null)
  const [url, setUrl] = useState('')

  const startLinking = (id: string) => {
    setLinking(id)
    setUrl(data.sources[id]?.sheetUrl ?? '')
  }

  return (
    <div className="sheet" role="dialog" aria-label="Projections" onClick={props.onClose}>
      <div className="sheet__card" onClick={(e) => e.stopPropagation()}>
        <header className="sheet__head">
          <h2>Projections</h2>
          <button type="button" className="sheet__close" onClick={props.onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {sources.length === 0 && (
          <p className="sheet__note" style={{ marginTop: 0 }}>
            No projections loaded yet.
          </p>
        )}

        {sources.map((s) => {
          const active = s.id === data.activeSourceId
          return (
            <div className={`src${active ? ' is-active' : ''}`} key={s.id}>
              <button type="button" className="src__pick" onClick={() => props.onSelect(s.id)}>
                <span className="src__radio">{active ? '●' : ''}</span>
                <span className="src__body">
                  <span className="src__name">{s.label}</span>
                  <span className="src__meta">
                    {s.players.length} players · {new Date(s.importedAt).toLocaleDateString()}
                    {s.sheetUrl && ' · linked'}
                  </span>
                </span>
              </button>

              {linking === s.id ? (
                <div className="src__link">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Paste the Google Sheet share link"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <div className="src__linkactions">
                    <button type="button" className="pill" onClick={() => setLinking(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => {
                        props.onLinkSheet(s.id, url)
                        setLinking(null)
                      }}
                    >
                      Save link
                    </button>
                  </div>
                </div>
              ) : (
                <div className="src__actions">
                  {s.sheetUrl ? (
                    <>
                      <button
                        type="button"
                        className="pill"
                        disabled={!!props.busy}
                        onClick={() => props.onRefresh(s.id)}
                      >
                        ↻ Refresh
                      </button>
                      <button type="button" className="pill" onClick={() => startLinking(s.id)}>
                        Edit link
                      </button>
                    </>
                  ) : (
                    <button type="button" className="pill" onClick={() => startLinking(s.id)}>
                      Link a Google Sheet…
                    </button>
                  )}
                  <button
                    type="button"
                    className="pill pill--danger"
                    onClick={() => props.onRemove(s.id)}
                    aria-label={`Remove ${s.label}`}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )
        })}

        <p className="sheet__note">
          Switching only changes the numbers on the rows. Your rank order and drafted players are
          shared across every set and never move.
        </p>

        <div className="sheet__actions">
          <button type="button" className="btn btn--sm" onClick={props.onImportFile}>
            Import a file…
          </button>
        </div>
      </div>
    </div>
  )
}
