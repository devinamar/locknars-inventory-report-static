// The last report, kept in the browser's IndexedDB between visits, as DIM
// keeps its last profile: shown at once on the next visit, then rebuilt only
// when what it was built from changed: the player's inventory as the report
// reads it, the shared data, the site's code, the player's settings (their
// preferences and own wishlists, src/saved.ts) or their DIM tags. Storage can
// be blocked (some private windows) or cleared: then nothing is kept, and
// every visit builds the report.
import type { DimSync } from './dim.ts'

// What a report was built from, and its HTML.
export type CachedReport = {
  // The Bungie.net account it was built for: shown only to that login.
  bungieMembershipId: string
  // The Destiny account it reports on.
  membershipId: string
  bungieName: string
  // The profile as the report reads it (profileKey).
  profile: string
  // version.json's data_version: what went into the shared database.
  data: string
  // The site's code: the commit its deploy was built from, 'dev' locally.
  code: string
  // The player's settings it was built with, as JSON.
  settings: string
  // What DIM said for it (dimKey).
  dim: string
  html: string
  // The report as Markdown, the copy the CLI also wrote for reading it with an
  // LLM; a report kept before there was one has none.
  markdown?: string
}

// SHA-256 of text as UTF-8, in hex.
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// value as JSON with every object's keys sorted, so the same content sent in
// another order reads the same.
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => order(a, b)))
      : v,
  )
}

// object's values passed through f; undefined for no object.
function mapValues(object: Record<string, any> | undefined, f: (value: any) => unknown) {
  return object && Object.fromEntries(Object.entries(object).map(([key, value]) => [key, f(value)]))
}

// The profile (GetProfile's Response) as its report reads it, hashed: what
// src/profile.ts saves of each item with an instance id, in instance id order
// — its hash and state; its instance's equipped flag, power, gear tier and
// damage type; its stats' values; the plug in each socket; the plugs each
// socket can take; and each plug's objectives (a kill tracker's count).
// Bungie's timestamps, where an item lies (vault or character) and the rest
// of what it sends are left out, so a profile Bungie makes again with nothing
// in it changed keys the same. Items the report leaves out (a ghost, a
// bounty) count all the same: telling them apart takes the item definitions,
// which the page doesn't load.
export function profileKey(profile: any): Promise<string> {
  const component = (name: string): Record<string, any> => profile.itemComponents?.[name]?.data ?? {}
  const [instances, stats, sockets, reusablePlugs, plugObjectives] = [
    'instances',
    'stats',
    'sockets',
    'reusablePlugs',
    'plugObjectives',
  ].map(component)
  const carried = (inventories: any): any[] =>
    Object.values<any>(inventories?.data ?? {}).flatMap((inventory) => inventory.items ?? [])
  const items: any[] = [
    ...(profile.profileInventory?.data?.items ?? []),
    ...carried(profile.characterInventories),
    ...carried(profile.characterEquipment),
  ]
  const copies = items
    .filter((item) => item.itemInstanceId)
    .map((item) => {
      const id: string = item.itemInstanceId
      const instance = instances[id]
      return [
        id,
        item.itemHash,
        item.state,
        instance && [instance.isEquipped, instance.primaryStat?.value, instance.gearTier, instance.damageTypeHash],
        stats[id] && mapValues(stats[id].stats ?? {}, (stat) => stat.value),
        sockets[id] && (sockets[id].sockets ?? []).map((socket: any) => socket.plugHash),
        reusablePlugs[id] && mapValues(reusablePlugs[id].plugs ?? {}, (plugs) => plugs.map((p: any) => p.plugItemHash)),
        plugObjectives[id] &&
          mapValues(plugObjectives[id].objectivesPerPlug ?? {}, (objectives) =>
            objectives.map((o: any) => [o.objectiveHash, o.progress]),
          ),
      ] as const
    })
    .sort(([a], [b]) => order(a, b))
  return sha256(canonical(copies))
}

// What DIM said, as the report's cache keeps it: the tags and notes with the
// copies in a fixed order, so a changed tag or note rebuilds the report; or
// only 'skipped' or 'failed', so a failing DIM doesn't rebuild it at every
// visit, and DIM answering again does.
export function dimKey(dim: DimSync): string {
  if (dim.status !== 'fresh') return dim.status
  return JSON.stringify(Object.entries(dim.annotations).sort(([a], [b]) => order(a, b)))
}

// Whether cached was built from what report is: the same Destiny account,
// profile, shared data, code, settings and DIM tags. A report kept before
// these keys were (keyed on Bungie's and the data build's timestamps) isn't,
// and is built once more.
export function upToDate(cached: CachedReport | undefined, report: CachedReport): boolean {
  return (
    cached?.membershipId === report.membershipId &&
    cached.profile === report.profile &&
    cached.data === report.data &&
    cached.code === report.code &&
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

// Keep report for the next visit: true once it's kept, false when storage is
// blocked or full.
export async function saveReportCache(report: CachedReport): Promise<boolean> {
  try {
    const db = await open()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('cache', 'readwrite')
      transaction.objectStore('cache').put(report, KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    return true
  } catch {
    return false
  }
}
