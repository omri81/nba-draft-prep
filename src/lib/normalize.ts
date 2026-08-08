/**
 * Name normalization, shared conceptually with scripts/fetch-player-ids.mjs.
 * Both sides must produce the same key or headshots won't match.
 *
 *   "Karl-Anthony Towns"  -> "karl anthony towns"
 *   "Jaren Jackson Jr."   -> "jaren jackson"
 *   "Luka Dončić"         -> "luka doncic"
 *   "Towns, Karl-Anthony" -> "karl anthony towns"
 */
export function normalizeName(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  let s = String(raw).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  s = s.toLowerCase()
  if (s.includes(',')) {
    const [last, first] = s.split(',', 2)
    if (first && first.trim()) s = `${first.trim()} ${last.trim()}`
  }
  s = s.replace(/[.'`’]/g, '')
  s = s.replace(/[-_]/g, ' ')
  s = s.replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
  s = s.replace(/[^a-z0-9 ]/g, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

/** Header cells: lowercase, drop everything but letters/digits/%. */
export function normalizeHeader(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  return String(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9%]/g, '')
}
