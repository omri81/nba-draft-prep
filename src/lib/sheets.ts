/**
 * Google Sheets helpers.
 *
 * A sheet shared with "anyone with the link" exposes a CSV export endpoint
 * that answers cross-origin requests, so the app can pull fresh numbers
 * itself instead of making me shuttle files around on a phone. Verified
 * against the deployed origin before this was built — the `gviz` endpoint
 * drops header cells, so `export?format=csv` is the one to use.
 */

const SHEET_ID = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
const GID = /[#&?]gid=([0-9]+)/

/** Turn any Google Sheets URL into its CSV export URL. */
export function toCsvExportUrl(raw: string): string | null {
  const url = raw.trim()
  if (!url) return null
  const id = SHEET_ID.exec(url)?.[1]
  if (!id) return null
  const gid = GID.exec(url)?.[1]
  const base = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`
  return gid ? `${base}&gid=${gid}` : base
}

export async function fetchSheetCsv(shareUrl: string): Promise<ArrayBuffer> {
  const url = toCsvExportUrl(shareUrl)
  if (!url) throw new Error('That does not look like a Google Sheets link.')
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? 'Sheet not found. Check the link is shared with “anyone with the link”.'
        : `Google Sheets returned ${res.status}.`,
    )
  }
  const buf = await res.arrayBuffer()
  if (buf.byteLength === 0) throw new Error('The sheet came back empty.')
  return buf
}
