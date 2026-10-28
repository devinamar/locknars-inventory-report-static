// The Destiny 2 manifest: Bungie's definitions of every item, perk and mod.
// The data build downloads the JSON Bungie serves for each definition table
// and copies what the app uses into the tables named after them
// (schema/bungie/manifest/): every weapon, armor piece and plug (and the
// Gunsmith Orders, Banshee's bounties whose icons picture the weapon types),
// their sockets and plug sets, the stats, damage types, champion types,
// classes, buckets, objectives, armor sets and collectibles they name, and the
// activity modes. Ported from d2-inventory-report's sources/bungie/manifest.py
// and extract/bungie/manifest.py, which downloaded Bungie's SQLite manifest
// instead and copied it only for a new version.
import { type BindableValue, type Database } from '@sqlite.org/sqlite-wasm'
import { insertMany } from '../src/db.ts'
import { get } from '../src/http.ts'
import { saveSourceStatus } from '../src/source-status.ts'

const BUNGIE = 'https://www.bungie.net'

const WEAPON_ITEM_TYPE = 3 // DestinyItemType.Weapon
const ARMOR_ITEM_TYPE = 2 // DestinyItemType.Armor
// Banshee's bounties, one per weapon type and named after it ("Hand Cannons"):
// their icons are the only weapon type pictures in the manifest.
const GUNSMITH_ORDER = 'Gunsmith Order'

// The manifest's tables the copy reads.
const TABLES = [
  'DestinyDamageTypeDefinition',
  'DestinyBreakerTypeDefinition',
  'DestinyStatDefinition',
  'DestinyClassDefinition',
  'DestinyActivityModeDefinition',
  'DestinyEquipableItemSetDefinition',
  'DestinyInventoryItemDefinition',
  'DestinyInventoryBucketDefinition',
  'DestinyCollectibleDefinition',
  'DestinyObjectiveDefinition',
  'DestinySandboxPerkDefinition',
  'DestinyPlugSetDefinition',
  'DestinyInventoryItemConstantsDefinition',
]

// A definition as Bungie sends it, read field by field like the CLI's dicts.
type Definition = Record<string, any>
// The manifest's tables, each as Bungie serves it: {table: {hash: definition}}.
export type Tables = Record<string, Record<string, Definition>>

// DestinyInventoryItemDefinition's columns, in the order itemRow gives them.
const ITEM_COLUMNS = [
  'hash',
  'name',
  'description',
  'icon',
  'itemType',
  'itemTypeDisplayName',
  'classType',
  'tierType',
  'bucketTypeHash',
  'equipableItemSetHash',
  'ammoType',
  'defaultDamageTypeHash',
  'iconWatermark',
  'collectibleHash',
  'traitIds',
  'plugCategoryIdentifier',
  'socketEntries',
  'investmentStats',
]

// The fields of each nested entry the app reads, kept in the JSON columns.
const SOCKET_ENTRY_FIELDS = ['singleInitialItemHash', 'randomizedPlugSetHash', 'reusablePlugSetHash']
const INLINE_PLUG_FIELDS = ['plugItemHash']
const INVESTMENT_STAT_FIELDS = ['statTypeHash', 'value']
const PLUG_SET_ITEM_FIELDS = ['plugItemHash', 'currentlyCanRoll']
const SET_PERK_FIELDS = ['requiredSetCount', 'sandboxPerkHash']

// entry keeping only fields (the ones it has), in fields' order.
function pick(entry: Definition, fields: string[]): Definition {
  return Object.fromEntries(fields.filter((k) => Object.hasOwn(entry, k)).map((k) => [k, entry[k]]))
}

// entries, a list of Bungie's objects, as a JSON array keeping only fields
// (each entry the ones it has); '[]' for none.
function trimmed(entries: Definition[] | undefined, fields: string[]): string {
  return JSON.stringify((entries || []).map((e) => pick(e, fields)))
}

// Socket entries as a JSON array, each keeping SOCKET_ENTRY_FIELDS (the ones
// it has). A socket that names neither plug set also keeps its inline
// reusablePlugItems (INLINE_PLUG_FIELDS): they are its only list of options,
// as for most weapons' origin traits.
function trimmedSockets(entries: Definition[] | undefined): string {
  const rows = (entries || []).map((entry) => {
    const row = pick(entry, SOCKET_ENTRY_FIELDS)
    const namesSet = entry.randomizedPlugSetHash || entry.reusablePlugSetHash
    if (entry.reusablePlugItems?.length && !namesSet) {
      row.reusablePlugItems = entry.reusablePlugItems.map((plug: Definition) => pick(plug, INLINE_PLUG_FIELDS))
    }
    return row
  })
  return JSON.stringify(rows)
}

// True for an item with a plug block (a JSON object): one that can sit in a
// socket.
function isPlug(obj: Definition): boolean {
  return typeof obj.plug === 'object' && obj.plug !== null && !Array.isArray(obj.plug)
}

// A DestinyInventoryItemDefinition row (ITEM_COLUMNS): the fields the app
// reads, as the manifest has them. plugCategoryIdentifier is '' for a plug
// without one and NULL for an item that isn't a plug. socketEntries is kept
// for weapons and armor (trimmedSockets) and investmentStats for plugs, the
// only ones the app reads; each is [] otherwise.
function itemRow(obj: Definition): BindableValue[] {
  const category = isPlug(obj) ? obj.plug.plugCategoryIdentifier || '' : null
  const gear = obj.itemType === WEAPON_ITEM_TYPE || obj.itemType === ARMOR_ITEM_TYPE
  return [
    obj.hash,
    obj.displayProperties?.name,
    obj.displayProperties?.description,
    obj.displayProperties?.icon,
    obj.itemType,
    obj.itemTypeDisplayName,
    obj.classType,
    obj.inventory?.tierType,
    obj.inventory?.bucketTypeHash,
    obj.equippingBlock?.equipableItemSetHash,
    obj.equippingBlock?.ammoType,
    obj.defaultDamageTypeHash,
    obj.iconWatermark,
    obj.collectibleHash,
    obj.traitIds == null ? null : JSON.stringify(obj.traitIds),
    category,
    trimmedSockets(gear ? obj.sockets?.socketEntries : []),
    trimmed(category === null ? [] : obj.investmentStats, INVESTMENT_STAT_FIELDS),
  ]
}

// INSERT rows into table's columns, in one transaction.
function insert(db: Database, table: string, columns: string[], rows: BindableValue[][]): void {
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
  insertMany(db, sql, rows)
}

// Copy what the app uses from the manifest's tables into the database, with
// the manifest_version row. Returns the counts the CLI printed: the plugs,
// weapons, armor pieces and plug sets copied.
export function ingestManifest(db: Database, tables: Tables, version: string) {
  // Every definition in a manifest table.
  const definitions = (table: string): Definition[] => Object.values(tables[table])

  // The whole small tables.
  const damageRows = definitions('DestinyDamageTypeDefinition').map((o) => [
    o.hash,
    o.enumValue,
    o.displayProperties?.name,
    o.displayProperties?.icon,
  ])
  const breakerRows = definitions('DestinyBreakerTypeDefinition').map((o) => [
    o.hash,
    o.displayProperties?.name,
    o.displayProperties?.icon,
  ])
  const statRows = definitions('DestinyStatDefinition').map((o) => [
    o.hash,
    o.displayProperties?.name,
    o.displayProperties?.icon,
  ])
  const classRows = definitions('DestinyClassDefinition').map((o) => [o.hash, o.classType, o.displayProperties?.name])
  const modeRows = definitions('DestinyActivityModeDefinition').map((o) => [
    o.hash,
    o.modeType,
    o.displayProperties?.name,
    o.displayProperties?.icon,
  ])
  const perkHashes = new Set()
  const setRows = definitions('DestinyEquipableItemSetDefinition').map((o) => {
    const perks: Definition[] = o.setPerks || []
    for (const perk of perks) perkHashes.add(perk.sandboxPerkHash)
    return [o.hash, o.displayProperties?.name, trimmed(perks, SET_PERK_FIELDS)]
  })

  // Weapons, armor and plugs: one row each, and the hashes they name.
  const itemRows: BindableValue[][] = []
  const namedSets = new Set()
  const objectiveHashes = new Set()
  const collectibleHashes = new Set()
  const bucketHashes = new Set()
  let weapons = 0
  let armor = 0
  let plugs = 0
  for (const obj of definitions('DestinyInventoryItemDefinition')) {
    const isWeapon = obj.itemType === WEAPON_ITEM_TYPE
    const plug = isPlug(obj)
    const gear = isWeapon || obj.itemType === ARMOR_ITEM_TYPE
    const isOrder = obj.itemTypeDisplayName === GUNSMITH_ORDER
    if (!(gear || plug || isOrder)) continue
    itemRows.push(itemRow(obj))
    if (gear) {
      if (isWeapon) {
        weapons += 1
        if (obj.collectibleHash) collectibleHashes.add(obj.collectibleHash)
      } else {
        armor += 1
      }
      bucketHashes.add(obj.inventory?.bucketTypeHash)
      for (const se of obj.sockets?.socketEntries || []) {
        for (const h of [se.randomizedPlugSetHash, se.reusablePlugSetHash]) if (h) namedSets.add(h)
      }
    }
    if (plug) {
      plugs += 1
      for (const h of obj.objectives?.objectiveHashes || []) objectiveHashes.add(h)
    }
  }

  // What the items name: their buckets, the weapons' collectibles, the plugs'
  // objectives and the set bonuses' perks.
  const named = (table: string, hashes: Set<unknown>) => definitions(table).filter((o) => hashes.has(o.hash))
  const bucketRows = named('DestinyInventoryBucketDefinition', bucketHashes).map((o) => [
    o.hash,
    o.displayProperties?.name,
    o.bucketOrder,
  ])
  const collectibleRows = named('DestinyCollectibleDefinition', collectibleHashes).map((o) => [o.hash, o.sourceString])
  const objectiveRows = named('DestinyObjectiveDefinition', objectiveHashes).map((o) => [
    o.hash,
    o.progressDescription,
    o.inProgressValueStyle,
    o.completedValueStyle,
    o.displayProperties?.icon,
  ])
  const sandboxPerkRows = named('DestinySandboxPerkDefinition', perkHashes).map((o) => [
    o.hash,
    o.displayProperties?.name,
    o.displayProperties?.description,
    o.displayProperties?.icon,
  ])

  // The plug sets the sockets name, each with its plugs as listed.
  const plugSetRows = named('DestinyPlugSetDefinition', namedSets).map((o) => [
    o.hash,
    trimmed(o.reusablePlugItems, PLUG_SET_ITEM_FIELDS),
  ])

  // Gear tier pip images and masterwork borders.
  const constantsRows = definitions('DestinyInventoryItemConstantsDefinition').map((o) => [
    o.hash,
    JSON.stringify(o.gearTierOverlayImagePaths || []),
    o.masterworkBorderedOverlayPath,
    o.masterworkExoticBorderedOverlayPath,
  ])

  // Parents before children, so every foreign key holds as rows go in. The
  // build starts from an empty database, so plain INSERTs do; the CLI
  // upserted, never emptying the tables its stored copies and wishlist rolls
  // pointed at, so that a row missing from a newer manifest couldn't orphan
  // them.
  insert(db, 'DestinyDamageTypeDefinition', ['hash', 'enumValue', 'name', 'icon'], damageRows)
  insert(db, 'DestinyBreakerTypeDefinition', ['hash', 'name', 'icon'], breakerRows)
  insert(db, 'DestinyStatDefinition', ['hash', 'name', 'icon'], statRows)
  insert(db, 'DestinyClassDefinition', ['hash', 'classType', 'name'], classRows)
  insert(db, 'DestinyActivityModeDefinition', ['hash', 'modeType', 'name', 'icon'], modeRows)
  insert(db, 'DestinyEquipableItemSetDefinition', ['hash', 'name', 'setPerks'], setRows)
  insert(db, 'DestinySandboxPerkDefinition', ['hash', 'name', 'description', 'icon'], sandboxPerkRows)
  insert(db, 'DestinyInventoryBucketDefinition', ['hash', 'name', 'bucketOrder'], bucketRows)
  insert(db, 'DestinyCollectibleDefinition', ['hash', 'sourceString'], collectibleRows)
  insert(
    db,
    'DestinyObjectiveDefinition',
    ['hash', 'progressDescription', 'inProgressValueStyle', 'completedValueStyle', 'icon'],
    objectiveRows,
  )
  insert(db, 'DestinyInventoryItemDefinition', ITEM_COLUMNS, itemRows)
  insert(db, 'DestinyPlugSetDefinition', ['hash', 'reusablePlugItems'], plugSetRows)
  insert(
    db,
    'DestinyInventoryItemConstantsDefinition',
    ['hash', 'gearTierOverlayImagePaths', 'masterworkBorderedOverlayPath', 'masterworkExoticBorderedOverlayPath'],
    constantsRows,
  )
  db.exec('INSERT INTO manifest_version VALUES (?)', { bind: [version] })
  return { plugs, weapons, armor, plugSets: plugSetRows.length }
}

// Download the current manifest and copy it in: Bungie's API names its
// version and where each table's JSON is, and the tables the copy reads
// download together. Any failure throws: the build has no stored copy to fall
// back on, so a failed source fails it and the last good deploy stays live.
export async function extractManifest(db: Database, apiKey = ''): Promise<void> {
  // The index call carries the API key when there is one: Bungie mostly
  // answers without it, but on 2026-10-27 about 1 call in 10 failed with
  // HTTP 500 (ApiKeyMissingFromRequest). The data build sends the live
  // site's key; a call from a server carries no Origin, which the key
  // accepts.
  const headers: Record<string, string> = apiKey ? { 'X-API-Key': apiKey } : {}
  const manifest = await (await get(`${BUNGIE}/Platform/Destiny2/Manifest/`, { headers })).json()
  // As in the CLI's API client, a Bungie error (an ErrorCode other than 1,
  // Success) fails too.
  if (manifest.ErrorCode !== 1) throw new Error(`Bungie API error: ${manifest.Message}`)
  const { version, jsonWorldComponentContentPaths } = manifest.Response
  const paths: Record<string, string> = jsonWorldComponentContentPaths.en
  const tables = Object.fromEntries(
    await Promise.all(
      TABLES.map(async (table) => {
        if (!paths[table]) throw new Error(`The manifest names no ${table}`)
        return [table, await (await get(BUNGIE + paths[table])).json()]
      }),
    ),
  )
  const { plugs, weapons, armor, plugSets } = ingestManifest(db, tables, version)
  saveSourceStatus(db, 'manifest', 'fresh', version)
  console.log(`Manifest ${version}: ${plugs} plugs, ${weapons} weapons, ${armor} armor, ${plugSets} plug sets`)
}
