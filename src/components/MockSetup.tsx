import { useState } from 'react'
import type { DraftConfig } from '../types'
import { defaultTeamNames } from '../lib/mock'

interface Props {
  config: DraftConfig
  onChangeConfig: (patch: Partial<DraftConfig>) => void
  onStart: (rounds: number, names: string[]) => void
  onClose: () => void
}

const TEAM_OPTIONS = [6, 8, 10, 12, 14, 16, 18, 20]
const ROUND_OPTIONS = [6, 8, 10, 13, 14, 16]

export function MockSetup({ config, onChangeConfig, onStart, onClose }: Props) {
  const [rounds, setRounds] = useState(13)
  const [names, setNames] = useState<string[]>(() =>
    defaultTeamNames(config.teams, config.pick ?? 1),
  )
  const [editNames, setEditNames] = useState(false)

  // Keep the name list the same length as the league if teams changes here.
  const sized = Array.from(
    { length: config.teams },
    (_, i) => names[i] ?? (i + 1 === config.pick ? 'You' : `Team ${i + 1}`),
  )

  const setName = (i: number, v: string) => {
    const next = [...sized]
    next[i] = v
    setNames(next)
  }

  return (
    <div className="sheet" role="dialog" aria-label="Mock draft" onClick={onClose}>
      <div className="sheet__card" onClick={(e) => e.stopPropagation()}>
        <header className="sheet__head">
          <h2>Mock draft</h2>
          <button type="button" className="sheet__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <p className="sheet__note" style={{ marginTop: 0 }}>
          You make every pick, for all {config.teams} teams. Your rank order is only read — it
          never changes.
        </p>

        <label className="field">
          <span>Teams</span>
          <select
            value={config.teams}
            onChange={(e) => {
              const teams = Number(e.target.value)
              const pick = config.pick && config.pick > teams ? teams : config.pick
              onChangeConfig({ teams, pick })
            }}
          >
            {TEAM_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>My slot</span>
          <select
            value={config.pick ?? 1}
            onChange={(e) => onChangeConfig({ pick: Number(e.target.value) })}
          >
            {Array.from({ length: config.teams }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Rounds</span>
          <select value={rounds} onChange={(e) => setRounds(Number(e.target.value))}>
            {ROUND_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={`toggle${config.thirdRoundReversal ? ' toggle--on' : ''}`}
          aria-pressed={config.thirdRoundReversal}
          onClick={() => onChangeConfig({ thirdRoundReversal: !config.thirdRoundReversal })}
        >
          <span className="toggle__box">{config.thirdRoundReversal ? '✓' : ''}</span>
          <span>Third-round reversal</span>
        </button>

        <button
          type="button"
          className="linkrow"
          onClick={() => setEditNames((v) => !v)}
          aria-expanded={editNames}
        >
          Team names <span>{editNames ? '▾' : '▸'}</span>
        </button>

        {editNames && (
          <div className="names">
            {sized.map((n, i) => (
              <label key={i} className={i + 1 === config.pick ? 'names__row is-me' : 'names__row'}>
                <span>{i + 1}</span>
                <input
                  value={n}
                  onChange={(e) => setName(i, e.target.value)}
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
            ))}
          </div>
        )}

        <p className="sheet__note">
          {config.teams * rounds} picks total — you'll tap every one of them.
        </p>

        <div className="sheet__actions">
          <button type="button" className="btn btn--sm" onClick={() => onStart(rounds, sized)}>
            Start mock
          </button>
        </div>
      </div>
    </div>
  )
}
