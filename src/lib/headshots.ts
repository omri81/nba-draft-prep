import rawIds from '../data/playerIds.json?raw'
import { normalizeName } from './normalize'

/**
 * Parsed once at startup. Kept as a JSON string in the bundle rather than an
 * object literal: JSON.parse of ~110KB is faster than evaluating 5k object
 * properties, and it keeps TypeScript from typing every key individually.
 */
const IDS: Record<string, number> = JSON.parse(rawIds)

/** Secondary indexes, built lazily — only a name that misses exact needs them. */
let fuzzy: { collapsed: Map<string, number>; lastName: Map<string, string[]> } | null = null

function buildFuzzy() {
  const collapsed = new Map<string, number>()
  const lastName = new Map<string, string[]>()
  for (const key of Object.keys(IDS)) {
    collapsed.set(key.replace(/ /g, ''), IDS[key])
    const last = key.slice(key.lastIndexOf(' ') + 1)
    const bucket = lastName.get(last)
    if (bucket) bucket.push(key)
    else lastName.set(last, [key])
  }
  return { collapsed, lastName }
}

const cache = new Map<string, number | null>()

export function nbaIdFor(name: string): number | null {
  const key = normalizeName(name)
  if (!key) return null
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  let id: number | null = IDS[key] ?? null

  if (id === null) {
    if (!fuzzy) fuzzy = buildFuzzy()

    // "C.J. McCollum" vs "CJ McCollum": same letters, different spacing.
    id = fuzzy.collapsed.get(key.replace(/ /g, '')) ?? null

    if (id === null) {
      // Same last name, and a first name that is a shortening of the other:
      // "Cam"/"Cameron" Johnson, "Nic"/"Nicolas" Claxton, "Herb"/"Herbert"
      // Jones. Requires a *unique* winner — a wrong face is worse than the
      // silhouette, so an ambiguous bucket falls through to the placeholder.
      const last = key.slice(key.lastIndexOf(' ') + 1)
      const space = key.indexOf(' ')
      const first = space === -1 ? key : key.slice(0, space)
      const bucket = fuzzy.lastName.get(last)
      if (bucket && first.length >= 3) {
        const matches = bucket.filter((k) => {
          const s = k.indexOf(' ')
          const f = s === -1 ? k : k.slice(0, s)
          return f.length >= 3 && (f.startsWith(first) || first.startsWith(f))
        })
        if (matches.length === 1) id = IDS[matches[0]]
      }
    }
  }

  cache.set(key, id)
  return id
}

export function headshotUrl(name: string): string | null {
  const id = nbaIdFor(name)
  return id === null ? null : `https://cdn.nba.com/headshots/nba/latest/1040x760/${id}.png`
}

/** Neutral silhouette, inlined so it can never 404 or flash. */
export const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">` +
      `<rect width="40" height="40" fill="#1b2028"/>` +
      `<circle cx="20" cy="15" r="6.5" fill="#39424f"/>` +
      `<path d="M6 40c0-8.2 6.3-13 14-13s14 4.8 14 13z" fill="#39424f"/>` +
      `</svg>`,
  )
