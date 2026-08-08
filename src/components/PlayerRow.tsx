import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Player } from '../types'
import { ROW_STATS } from '../types'
import { Headshot } from './Headshot'

interface Props {
  player: Player
  rank: number
  drafted: boolean
  sortable: boolean
  onOpen: (id: string) => void
  onToggleDrafted: (id: string) => void
}

function fmt(v: number | undefined): string {
  return v === undefined ? '–' : v.toFixed(1)
}

function PlayerRowImpl({ player, rank, drafted, sortable, onOpen, onToggleDrafted }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: player.id, disabled: !sortable })

  return (
    <li
      ref={setNodeRef}
      className={`row${drafted ? ' is-drafted' : ''}${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="row__check"
        aria-pressed={drafted}
        aria-label={drafted ? `Un-draft ${player.name}` : `Mark ${player.name} drafted`}
        onClick={() => onToggleDrafted(player.id)}
      >
        <span className="row__check-box">{drafted ? '✓' : ''}</span>
      </button>

      <button type="button" className="row__main" onClick={() => onOpen(player.id)}>
        <span className="row__rank">{rank}</span>
        <Headshot key={player.name} name={player.name} size="row" />
        <span className="row__text">
          <span className="row__line1">
            <span className="row__name">{player.name}</span>
            {player.isNew && <span className="badge badge--new">NEW</span>}
            <span className="row__meta">
              {player.team}
              {player.pos.length > 0 && ` · ${player.pos.join('/')}`}
            </span>
          </span>
          <span className="row__stats">
            {ROW_STATS.map(({ key, label }) => (
              <span className="stat" key={key}>
                {fmt(player.stats[key])}
                <i>{label}</i>
              </span>
            ))}
          </span>
        </span>
      </button>

      <button
        type="button"
        ref={setActivatorNodeRef}
        className="row__handle"
        aria-label={`Reorder ${player.name}`}
        {...attributes}
        {...listeners}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <circle cx="7" cy="4" r="1.6" /><circle cx="13" cy="4" r="1.6" />
          <circle cx="7" cy="10" r="1.6" /><circle cx="13" cy="10" r="1.6" />
          <circle cx="7" cy="16" r="1.6" /><circle cx="13" cy="16" r="1.6" />
        </svg>
      </button>
    </li>
  )
}

export const PlayerRow = memo(PlayerRowImpl)
