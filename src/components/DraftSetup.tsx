import type { DraftConfig } from '../types'
import { myPickNumbers, roundOf } from '../lib/draft'

interface Props {
  config: DraftConfig
  onChange: (patch: Partial<DraftConfig>) => void
  onClose: () => void
}

const TEAM_OPTIONS = [6, 8, 10, 12, 14, 16, 18, 20]

export function DraftSetup({ config, onChange, onClose }: Props) {
  const picks = myPickNumbers(config, config.teams * 8)

  return (
    <div className="sheet" role="dialog" aria-label="Draft slot" onClick={onClose}>
      <div className="sheet__card" onClick={(e) => e.stopPropagation()}>
        <header className="sheet__head">
          <h2>Draft slot</h2>
          <button type="button" className="sheet__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <label className="field">
          <span>Teams in the league</span>
          <select
            value={config.teams}
            onChange={(e) => {
              const teams = Number(e.target.value)
              // Keep the slot valid if the league just got smaller.
              const pick = config.pick && config.pick > teams ? teams : config.pick
              onChange({ teams, pick })
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
          <span>My pick in round 1</span>
          <select
            value={config.pick ?? ''}
            onChange={(e) => onChange({ pick: e.target.value === '' ? null : Number(e.target.value) })}
          >
            <option value="">Not set</option>
            {Array.from({ length: config.teams }, (_, i) => i + 1).map((n) => (
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
          onClick={() => onChange({ thirdRoundReversal: !config.thirdRoundReversal })}
        >
          <span className="toggle__box">{config.thirdRoundReversal ? '✓' : ''}</span>
          <span>
            Third-round reversal
            <i>Round 3 repeats round 2's order instead of snaking back</i>
          </span>
        </button>

        {picks.length > 0 ? (
          <>
            <div className="sheet__label">Your first 8 picks</div>
            <div className="pickpreview">
              {picks.map((n) => (
                <span key={n} className="pickchip">
                  <i>R{roundOf(n, config.teams)}</i>
                  {n}
                </span>
              ))}
            </div>
            <p className="sheet__note">
              Rows at these spots on your board are highlighted, so you can see who should still
              be there when you're on the clock.
            </p>
          </>
        ) : (
          <p className="sheet__note">Pick a slot to highlight your picks on the board.</p>
        )}

        <div className="sheet__actions">
          {config.pick !== null && (
            <button type="button" className="pill" onClick={() => onChange({ pick: null })}>
              Clear
            </button>
          )}
          <button type="button" className="btn btn--sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
