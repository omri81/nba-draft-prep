import { useEffect, useMemo } from 'react'
import type { Player, StatKey } from '../types'
import { CATEGORIES } from '../types'
import { normalizeHeader } from '../lib/normalize'
import { LAST_SEASON, lastSeasonFor } from '../lib/lastSeason'
import { Headshot } from './Headshot'

interface Props {
  player: Player
  rank: number
  drafted: boolean
  onBack: () => void
  onToggleDrafted: (id: string) => void
}

/** Sheet columns already shown above the raw table — don't print them twice. */
const COVERED = new Set([
  'pg', 'p', 'pts', 'fgg', 'fgm', 'ftg', 'ftm', '3g', '3pm', 'ag', 'ast', 'rg', 'reb', 'treb',
  'sg', 'stl', 'bg', 'blk', 'tog', 'to', 'tov', 'fg%', 'fgpct', 'ft%', 'ftpct',
  'fgag', 'fga', 'ftag', 'fta', 'name', 'player', 'team', 'tm', 'pos', 'position',
  'rank', 'value', 'g', 'gp', 'mg', 'min',
])

/** Short labelled fields worth pulling out as chips (Basketball Monster). */
const TAGS: { key: string; label: string }[] = [
  { key: 'inj', label: 'Injury' },
  { key: 'injrisk', label: 'Injury risk' },
  { key: 'status', label: 'Status' },
  { key: 'tier', label: 'Tier' },
  { key: 'role', label: 'Role' },
]

const NOTE_KEYS = ['note', 'notes', 'comment', 'comments']

function formatCat(key: StatKey, player: Player): string {
  return formatStat(key, player.stats[key])
}

function formatStat(key: StatKey, v: number | undefined): string {
  if (v === undefined) return '–'
  if (key === 'fgPct' || key === 'ftPct') return `${(v * 100).toFixed(1)}%`
  return v.toFixed(1)
}

/** Signed change from last season to the projection. */
function formatDelta(key: StatKey, proj: number | undefined, was: number | undefined): string {
  if (proj === undefined || was === undefined) return ''
  const d = proj - was
  const isPct = key === 'fgPct' || key === 'ftPct'
  const shown = isPct ? Math.abs(d * 100).toFixed(1) : Math.abs(d).toFixed(1)
  if (Number(shown) === 0) return '–'
  return `${d > 0 ? '+' : '−'}${shown}${isPct ? '' : ''}`
}

/** Turnovers are the one category where the projection dropping is good news. */
const LOWER_IS_BETTER = new Set<StatKey>(['to'])

function deltaTone(key: StatKey, proj: number | undefined, was: number | undefined): string {
  if (proj === undefined || was === undefined) return ''
  const d = proj - was
  if (Math.abs(d) < 0.05) return ''
  const better = LOWER_IS_BETTER.has(key) ? d < 0 : d > 0
  return better ? ' is-up' : ' is-down'
}

function subLabel(key: StatKey, player: Player): string | null {
  if (key === 'fgPct') {
    const { fgm, fga } = player.stats
    if (fgm !== undefined && fga !== undefined) return `${fgm.toFixed(1)} / ${fga.toFixed(1)} FGA`
    if (fga !== undefined) return `on ${fga.toFixed(1)} FGA`
  }
  if (key === 'ftPct') {
    const { ftm, fta } = player.stats
    if (ftm !== undefined && fta !== undefined) return `${ftm.toFixed(1)} / ${fta.toFixed(1)} FTA`
    if (fta !== undefined) return `on ${fta.toFixed(1)} FTA`
  }
  return null
}

export function PlayerDetail({ player, rank, drafted, onBack, onToggleDrafted }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const { notes, tags, rest } = useMemo(() => {
    const byKey = new Map<string, { label: string; value: string | number }>()
    for (const [label, value] of Object.entries(player.raw)) {
      byKey.set(normalizeHeader(label), { label, value })
    }
    const noteText = NOTE_KEYS.map((k) => byKey.get(k)?.value)
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.replace(/^\[|\]$/g, '').trim())

    const chips = TAGS.map((t) => ({ ...t, value: byKey.get(t.key)?.value })).filter(
      (t) => t.value !== undefined && String(t.value).trim() !== '',
    )

    const skip = new Set([...COVERED, ...NOTE_KEYS, ...TAGS.map((t) => t.key)])
    const other = Object.entries(player.raw).filter(([label]) => !skip.has(normalizeHeader(label)))

    return { notes: noteText, tags: chips, rest: other }
  }, [player])

  const { value, rank: bbmRank, adp, gp, min } = player.stats

  return (
    <div className="detail" role="dialog" aria-label={player.name}>
      <header className="detail__bar">
        <button type="button" className="detail__back" onClick={onBack}>
          <span aria-hidden="true">‹</span> Board
        </button>
        <button
          type="button"
          className={`pill${drafted ? ' pill--on' : ''}`}
          onClick={() => onToggleDrafted(player.id)}
        >
          {drafted ? '✓ Drafted' : 'Mark drafted'}
        </button>
      </header>

      <div className="detail__scroll">
        <div className="detail__hero">
          <Headshot key={player.name} name={player.name} size="detail" />
          <div className="detail__id">
            <div className="detail__rank">My rank #{rank}</div>
            <h1 className="detail__name">{player.name}</h1>
            <div className="detail__meta">
              {player.team || '—'}
              {player.pos.length > 0 && ` · ${player.pos.join(' / ')}`}
            </div>
            <div className="detail__bbm">
              {bbmRank !== undefined && <span>BBM #{bbmRank}</span>}
              {adp !== undefined && <span>ADP {adp.toFixed(1)}</span>}
              {value !== undefined && <span>Value {value.toFixed(2)}</span>}
            </div>
            <div className="detail__bbm">
              {gp !== undefined && <span>{gp.toFixed(0)} GP</span>}
              {min !== undefined && <span>{min.toFixed(1)} MPG</span>}
            </div>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="tags">
            {tags.map((t) => (
              <span className="tag" key={t.key}>
                <i>{t.label}</i>
                {String(t.value)}
              </span>
            ))}
          </div>
        )}

        <h2 className="detail__h2">League categories</h2>
        <div className="catgrid">
          {CATEGORIES.map(({ key, label }) => {
            const sub = subLabel(key, player)
            return (
              <div className="cat" key={key}>
                <div className="cat__label">{label}</div>
                <div className="cat__value">{formatCat(key, player)}</div>
                {sub && <div className="cat__sub">{sub}</div>}
              </div>
            )
          })}
        </div>

        {(() => {
          const last = lastSeasonFor(player.name)
          if (!last) {
            return (
              <>
                <h2 className="detail__h2">Last season · {LAST_SEASON}</h2>
                <p className="sheet__note" style={{ marginTop: 0 }}>
                  No regular-season games. Nothing to compare the projection against.
                </p>
              </>
            )
          }
          return (
            <>
              <h2 className="detail__h2">
                Projection vs {LAST_SEASON}
                {last.team && <span className="detail__was"> · was {last.team}</span>}
              </h2>
              <div className="tablewrap">
                <table className="compare">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Proj</th>
                      <th>{LAST_SEASON}</th>
                      <th>Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[{ key: 'gp' as StatKey, label: 'GP' }, { key: 'min' as StatKey, label: 'MPG' }, ...CATEGORIES].map(
                      ({ key, label }) => {
                        const proj = player.stats[key]
                        const was = last.stats[key]
                        return (
                          <tr key={key}>
                            <th scope="row">{label}</th>
                            <td>{formatStat(key, proj)}</td>
                            <td className="compare__was">{formatStat(key, was)}</td>
                            <td className={`compare__d${deltaTone(key, proj, was)}`}>
                              {formatDelta(key, proj, was)}
                            </td>
                          </tr>
                        )
                      },
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )
        })()}

        {notes.length > 0 && (
          <>
            <h2 className="detail__h2">Notes</h2>
            {notes.map((n, i) => (
              <p className="note" key={i}>
                {n}
              </p>
            ))}
          </>
        )}

        {rest.length > 0 && (
          <>
            <h2 className="detail__h2">Everything else in the sheet</h2>
            <table className="rawtable">
              <tbody>
                {rest.map(([label, v]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{typeof v === 'number' ? Number(v.toFixed(3)) : v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="detail__pad" />
      </div>
    </div>
  )
}
