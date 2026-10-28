// The player's profile: every weapon and armor copy, with the instance
// components the item tables store (300 instances, 304 stats, 305 sockets,
// 309 plug objectives, 310 reusable plugs), saved one table per component.
// Every weapon and armor copy is kept, whatever its tier; the analysis decides
// which ones to compare. A component is stored one row per copy, nested as the
// profile sends it and trimmed to the fields the app reads. A copy's
// DestinyItemComponent row is updated in place, because DIM tags and notes
// point at it; its other rows are replaced, and copies gone are deleted.
// Ported from d2-inventory-report's extract/bungie/profile.py and
// inventory.py. It runs in the browser, on GetProfile's Response part, which
// src/bungie.ts's getProfile returns as the CLI's API client did.
import { type BindableValue, type Database } from '@sqlite.org/sqlite-wasm'
import { insertMany } from './db.ts'
import { saveSourceStatus } from './source-status.ts'

// A part of Bungie's response, read field by field like the CLI's dicts.
type Json = Record<string, any>

// Rows for the component tables, in their column order: a copy's instance
// values, and each other component as [copy, its JSON].
export type ProfileRows = {
  items: [string, number, number][] // DestinyItemComponent
  instances: [string, number | null, number | null, number | null, number | null][] // DestinyItemInstanceComponent
  stats: [string, string][] // DestinyItemStatsComponent
  sockets: [string, string][] // DestinyItemSocketsComponent
  reusablePlugs: [string, string][] // DestinyItemReusablePlugsComponent
  plugObjectives: [string, string][] // DestinyItemPlugObjectivesComponent
}

// The fields of each component entry the app reads, kept in the JSON.
const SOCKET_FIELDS = ['plugHash']
const PLUG_FIELDS = ['plugItemHash']
const OBJECTIVE_FIELDS = ['objectiveHash', 'progress']

// A true/false field as 1 or 0, or null when the profile leaves it out.
function flag(value: unknown): number | null {
  return value == null ? null : Number(value)
}

// entry with only fields, the ones it has.
function keep(entry: Json, fields: string[]): Json {
  return Object.fromEntries(fields.filter((k) => Object.hasOwn(entry, k)).map((k) => [k, entry[k]]))
}

// lists ({key: [entry]}, keyed by socket index or plug hash) with each entry
// trimmed to fields.
function keepLists(lists: Json | undefined, fields: string[]): Json {
  return Object.fromEntries(
    Object.entries(lists || {}).map(([key, entries]) => [key, entries.map((e: Json) => keep(e, fields))]),
  )
}

// The rows of every weapon and armor copy in profile: each item in the vault,
// the character inventories and equipped gear with an instance id and a
// stored weapon or armor definition, so its foreign key holds. The rest are
// left out: stacks, items that aren't gear, and any item whose definition the
// db lacks (it holds only the current manifest's, where the CLI's db kept
// older ones too). A component's hashes are kept as sent, whether or not the
// definition tables have them; a copy the profile sends a component for gets
// its row, the others none. An instance's damage type the definitions don't
// have is NULL.
export function profileRows(db: Database, profile: Json): ProfileRows {
  const gearHashes = new Set(
    db.selectValues('SELECT hash FROM DestinyInventoryItemDefinition WHERE itemType IN (2, 3)'),
  )
  const damageHashes = new Set(db.selectValues('SELECT hash FROM DestinyDamageTypeDefinition'))
  const characterItems = (component: Json | undefined): Json[] =>
    Object.values<Json>(component?.data ?? {}).flatMap((inv) => inv.items ?? [])
  const allItems: Json[] = [
    ...(profile.profileInventory?.data?.items ?? []),
    ...characterItems(profile.characterInventories),
    ...characterItems(profile.characterEquipment),
  ]
  // A per-instance component's data: {instance id: its value}.
  const component = (name: string): Json => profile.itemComponents?.[name]?.data ?? {}
  const instances = component('instances')
  const stats = component('stats')
  const sockets = component('sockets')
  const reusablePlugs = component('reusablePlugs')
  const plugObjectives = component('plugObjectives')

  const rows: ProfileRows = { items: [], instances: [], stats: [], sockets: [], reusablePlugs: [], plugObjectives: [] }
  for (const item of allItems) {
    const id = item.itemInstanceId
    if (!id || !gearHashes.has(item.itemHash)) continue
    rows.items.push([id, item.itemHash, item.state ?? 0])

    const instance = instances[id]
    if (instance != null) {
      const damageHash = damageHashes.has(instance.damageTypeHash) ? instance.damageTypeHash : null
      rows.instances.push([
        id,
        flag(instance.isEquipped),
        instance.primaryStat?.value ?? null,
        instance.gearTier ?? null,
        damageHash,
      ])
    }

    const copyStats = stats[id]
    if (copyStats != null) {
      const values = Object.entries<Json>(copyStats.stats || {}).filter(([, s]) => Object.hasOwn(s, 'value'))
      rows.stats.push([id, JSON.stringify(Object.fromEntries(values.map(([h, s]) => [h, s.value])))])
    }

    const copySockets = sockets[id]
    if (copySockets != null) {
      const entries = (copySockets.sockets || []).map((s: Json) => keep(s, SOCKET_FIELDS))
      rows.sockets.push([id, JSON.stringify(entries)])
    }

    const reusable = reusablePlugs[id]
    if (reusable != null) rows.reusablePlugs.push([id, JSON.stringify(keepLists(reusable.plugs, PLUG_FIELDS))])

    const perPlug = plugObjectives[id]
    if (perPlug != null) {
      rows.plugObjectives.push([id, JSON.stringify(keepLists(perPlug.objectivesPerPlug, OBJECTIVE_FIELDS))])
    }
  }
  return rows
}

// Save the copies in rows: each copy's own row upserted, the copies gone
// deleted (the foreign keys' cascades take their rows in the other tables),
// and each component table replaced. The CLI saved it all in one
// transaction; insertMany opens its own, one per table, so a failure partway
// leaves the tables before it saved.
export function saveSnapshot(db: Database, rows: ProfileRows): void {
  insertMany(
    db,
    'INSERT INTO DestinyItemComponent (itemInstanceId, itemHash, state) VALUES (?, ?, ?) ' +
      'ON CONFLICT(itemInstanceId) DO UPDATE SET itemHash = excluded.itemHash, state = excluded.state',
    rows.items,
  )
  // The copies kept go in as one JSON array rather than a ? each.
  db.exec('DELETE FROM DestinyItemComponent WHERE itemInstanceId NOT IN (SELECT value FROM json_each(?))', {
    bind: [JSON.stringify(rows.items.map((r) => r[0]))],
  })
  const tables: [string, BindableValue[][]][] = [
    ['DestinyItemInstanceComponent', rows.instances],
    ['DestinyItemStatsComponent', rows.stats],
    ['DestinyItemSocketsComponent', rows.sockets],
    ['DestinyItemReusablePlugsComponent', rows.reusablePlugs],
    ['DestinyItemPlugObjectivesComponent', rows.plugObjectives],
  ]
  for (const [table, tableRows] of tables) {
    db.exec(`DELETE FROM ${table}`)
    if (tableRows.length) {
      insertMany(db, `INSERT INTO ${table} VALUES (${tableRows[0].map(() => '?').join(', ')})`, tableRows)
    }
  }
}

// Save every weapon and armor copy in profile (GetProfile's Response, asked
// for PROFILE_COMPONENTS) and record the profile fresh. Throws, saving
// nothing, when the profile has no socket data, where the CLI exited: saved,
// it would leave every copy without its perks. The CLI had recorded the
// profile fresh before that check; here a profile that wasn't saved isn't
// called fresh.
export function ingestProfile(db: Database, profile: Json): void {
  const rows = profileRows(db, profile)
  if (!rows.reusablePlugs.length) {
    console.warn(
      'No reusablePlugs data returned! OAuth may not be working correctly. ' +
        'Falling back to currently equipped perks only.',
    )
  }
  if (!rows.sockets.length) throw new Error('No socket data in the profile. Check OAuth status.')
  saveSnapshot(db, rows)
  saveSourceStatus(db, 'profile', 'fresh')
}
