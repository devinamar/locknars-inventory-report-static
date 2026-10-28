// The last report, kept in the browser's IndexedDB between visits, as DIM
// keeps its last profile: shown at once on the next visit, then rebuilt only
// when Bungie's profile or the shared data changed. Storage can be blocked
// (some private windows) or cleared: then nothing is kept, and every visit
// builds the report.

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
  html: string
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
