import type { MockState } from '../types'
import { onTheClock, totalPicks } from '../lib/mock'

interface Props {
  mock: MockState
  onUndo: () => void
  onStandings: () => void
  onDiscard: () => void
}

export function MockBar({ mock, onUndo, onStandings, onDiscard }: Props) {
  const clock = onTheClock(mock)
  const done = mock.picks.length
  const total = totalPicks(mock)

  return (
    <div className={`mockbar${clock?.isMe ? ' mockbar--me' : ''}${!clock ? ' mockbar--done' : ''}`}>
      <div className="mockbar__who">
        {clock ? (
          <>
            <span className="mockbar__pos">
              R{clock.round} · P{clock.pick}
            </span>
            <strong>{clock.isMe ? 'YOU' : mock.teamNames[clock.team - 1]}</strong>
          </>
        ) : (
          <>
            <span className="mockbar__pos">Complete</span>
            <strong>{total} picks</strong>
          </>
        )}
      </div>

      <div className="mockbar__progress" aria-hidden="true">
        <i style={{ width: `${(done / total) * 100}%` }} />
      </div>

      <div className="mockbar__actions">
        <button type="button" onClick={onUndo} disabled={done === 0} aria-label="Undo last pick">
          ↺
        </button>
        <button type="button" onClick={onStandings}>
          Table
        </button>
        <button type="button" className="danger" onClick={onDiscard} aria-label="Discard mock">
          ✕
        </button>
      </div>
    </div>
  )
}
