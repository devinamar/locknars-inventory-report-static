// The last report, kept in the browser's IndexedDB between visits, as DIM
// keeps its last profile: shown at once on the next visit, then rebuilt only
// when Bungie's profile, the shared data, the player's settings (their
// preferences and own wishlists, src/saved.ts) or their DIM tags changed.
// Storage can be blocked (some private windows) or cleared: then nothing is
// kept, and every visit builds the report.
import type { DimSync } from './dim.ts'

// What a report was built from, and its HTML.
export type CachedReport = {
  // The Bungie.net account it was built for: shown only to that login.
  bungieMembershipId: string
  // The Destiny account it reports on.
  membershipId: string
  bungieName: string
  // Bungie's responseMintedTimestamp: when it made the profile response.
  profileMinted: string
  // version.json's built_at: when the data build made the shared database.
  dataBuilt: string
  // The player's settings it was built with, as JSON.
  settings: string
  // What DIM said for it (dimKey).
  dim: string
  html: string
  // The report as Markdown, the copy the CLI also wrote for reading it with an
  // LLM; a report kept before there was one has none.
  markdown?: string
}

// What DIM said, as the report's cache keeps it: the tags and notes with the
// copies in a fixed order, so a changed tag or note rebuilds the report; or
// only 'skipped' or 'failed', so a failing DIM doesn't rebuild it at every
// visit, and DIM answering again does.
export function dimKey(dim: DimSync): string {
  if (dim.status !== 'fresh') return dim.status
  return JSON.stringify(Object.entries(dim.annotations).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

// Whether cached was built from what report is: the same Destiny account,
// Bungie profile, shared data and settings. A report kept before settings
// were kept with it isn't.
export function upToDate(cached: CachedReport | undefined, report: CachedReport): boolean {
  return (
    cached?.membershipId === report.membershipId &&
    cached.profileMinted === report.profileMinted &&
    cached.dataBuilt === report.dataBuilt &&
    cached.settings === report.settings &&
    cached.dim === report.dim
  )
}

const KEY = 'report'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('d2-report', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('cache')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// The last report kept; undefined when there's none or storage is blocked.
export async function loadReportCache(): Promise<CachedReport | undefined> {
  try {
    const db = await open()
    return await new Promise((resolve, reject) => {
      const request = db.transaction('cache').objectStore('cache').get(KEY)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } catch {
    return undefined
  }
}

// Keep report for the next visit; nothing happens when storage is blocked.
export async function saveReportCache(report: CachedReport): Promise<void> {
  try {
    const db = await open()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('cache', 'readwrite')
      transaction.objectStore('cache').put(report, KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } catch {
    // Not kept.
  }
}
