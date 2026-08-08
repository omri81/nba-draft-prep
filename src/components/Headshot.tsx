import { memo, useState } from 'react'
import { PLACEHOLDER, headshotUrl } from '../lib/headshots'

interface Props {
  name: string
  size: 'row' | 'detail'
}

/**
 * Lazy, never-broken headshot. Falls back to the inline silhouette both when
 * we have no NBA id for the name and when the CDN 404s (rookies show up in
 * projections before their photo does).
 *
 * The CDN images are 1040x760 with a lot of empty space around the player, so
 * the img is blown up inside an overflow-hidden box to crop down to the face —
 * at 38px a straight `object-fit: cover` is unreadable.
 */
function HeadshotImpl({ name, size }: Props) {
  const initial = headshotUrl(name)
  const [src, setSrc] = useState(initial ?? PLACEHOLDER)
  const isPlaceholder = src === PLACEHOLDER

  return (
    <span className={`shot shot--${size}`} aria-hidden="true">
      <img
        className={isPlaceholder ? 'is-placeholder' : undefined}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setSrc(PLACEHOLDER)}
      />
    </span>
  )
}

export const Headshot = memo(HeadshotImpl)
