import { useMemo, useState } from 'react'
import type { MockState, Player } from '../types'
import { CATEGORIES } from '../types'
import { formatTotal, isComplete, standings, totalPicks } from '../lib/mock'

interface Props {
  mock: MockState
  byId: Map<string, Player>
  onBack: () => void
}

export function MockResults({ mock, byId, onBack }: Props) {
  const rows = useMemo(() => standings(mock, byId), [mock, byId])
  const [openTeam, setOpenTeam] = useState<number | null>(mock.myTeam)

  const uneven = new Set(rows.map((r) => r.picks.length)).size > 1

  return (
    <div className="detail" role="dialog" aria-label="Mock standings">
      <header className="detail__bar">
        <button type="button" className="detail__back" onClick={onBack}>
          <span aria-hidden="true">‹</span> Draft
        </button>
        <span className="detail__count">
          {mock.picks.length} / {totalPicks(mock)} picks
        </span>
      </header>

      <div className="detail__scroll">
        <h2 className="detail__h2">
          {isComplete(mock) ? 'Final standings' : 'Standings so far'}
        </h2>

        <div className="tablewrap">
          <table className="standings">
            <thead>
              <tr>
                <th className="sticky">
                  Team
                  <i className="standings__rotohdr">roto</i>
                </th>
                {CATEGORIES.map((c) => (
                  <th key={c.key}>
                    {c.label}
                    {c.key === 'to' && <i title="lower is better">▾</i>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.team} className={r.isMe ? 'is-me' : undefined}>
                  <th className="sticky">
                    <span className="standings__name">{r.name}</span>
                    <span className="standings__n">
                      {r.picks.length} · <b>{Number(r.rotoPoints.toFixed(1))}</b>
                    </span>
                  </th>
                  {CATEGORIES.map((c) => (
                    <td key={c.key} className={r.ranks[c.key] === 1 ? 'is-best' : undefined}>
                      {formatTotal(c.key, r.totals[c.key])}
                      <i>{r.ranks[c.key]}</i>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="sheet__note">
          Per-game team totals. FG% and FT% are total makes over total attempts, not an average of
          player percentages. The small number under each value is that team's rank in the
          category. Under the team name: players drafted · roto points ({mock.teams} for first in a
          category down to 1).
          {uneven && ' Teams have unequal rosters mid-draft, so totals are provisional.'}
        </p>

        <h2 className="detail__h2">Rosters</h2>
        {rows.map((r) => (
          <div className="roster" key={r.team}>
            <button
              type="button"
              className={`roster__head${r.isMe ? ' is-me' : ''}`}
              onClick={() => setOpenTeam(openTeam === r.team ? null : r.team)}
              aria-expanded={openTeam === r.team}
            >
              <span>{r.name}</span>
              <span className="roster__meta">
                {r.picks.length} · {Number(r.rotoPoints.toFixed(1))} pts{' '}
                {openTeam === r.team ? '▾' : '▸'}
              </span>
            </button>
            {openTeam === r.team && (
              <ol className="roster__list">
                {r.picks.map((p) => (
                  <li key={p.pick}>
                    <span className="roster__pick">
                      {p.round}.{String(((p.pick - 1) % mock.teams) + 1).padStart(2, '0')}
                    </span>
                    <span className="roster__player">{p.player.name}</span>
                    <span className="roster__pos">
                      {p.player.team}
                      {p.player.pos.length > 0 && ` · ${p.player.pos.join('/')}`}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
        <div className="detail__pad" />
      </div>
    </div>
  )
}
