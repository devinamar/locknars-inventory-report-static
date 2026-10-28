// Tests for copying the manifest into the definition tables (build/manifest.ts)
// and for downloading it. The manifest is a few tables laid out as Bungie
// serves them, holding real definitions from the live manifest trimmed to the
// fields the copy reads.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createDb } from '../../build/db.ts'
import { extractManifest, ingestManifest } from '../../build/manifest.ts'

// The live manifest's version, as Bungie's API names it.
const VERSION = '245114.26.10.13.2000-1-bnet.66137'

const FATEBRINGER = {
  hash: 4219826183,
  displayProperties: { name: 'Fatebringer (Timelost)' },
  itemType: 3,
  itemTypeDisplayName: 'Hand Cannon',
  classType: 3,
  defaultDamageTypeHash: 3373582085,
  equippingBlock: { ammoType: 1 },
  inventory: { tierType: 5, bucketTypeHash: 1498876634 },
  sockets: {
    socketEntries: [
      { singleInitialItemHash: 1294026524, reusablePlugItems: [], reusablePlugSetHash: 1 },
      {
        singleInitialItemHash: 1840239774,
        reusablePlugItems: [{ plugItemHash: 1840239774 }],
        randomizedPlugSetHash: 2044988252,
      },
    ],
  },
}
// Its origin socket (index 8) names no plug set: the inline list is its only
// list of options, Problem Solver and Vanguard Determination with their
// enhanced versions.
const MINT_RETROGRADE = {
  hash: 3285784871,
  displayProperties: { name: 'Mint Retrograde' },
  itemType: 3,
  itemTypeDisplayName: 'Pulse Rifle',
  classType: 3,
  inventory: { tierType: 5, bucketTypeHash: 1498876634 },
  sockets: {
    socketEntries: [
      {
        singleInitialItemHash: 3454102905,
        reusablePlugItems: [
          { plugItemHash: 3454102905 },
          { plugItemHash: 3846229553 },
          { plugItemHash: 2223800157 },
          { plugItemHash: 1621842933 },
        ],
      },
    ],
  },
}
const ADAPTIVE_FRAME = {
  hash: 1294026524,
  displayProperties: { name: 'Adaptive Frame' },
  itemType: 19,
  itemTypeDisplayName: 'Intrinsic',
  classType: 3,
  inventory: { tierType: 5, bucketTypeHash: 1469714392 },
  plug: { plugCategoryIdentifier: 'intrinsics' },
}
// A Hunter cloak, which is an ornament plug too. Its cosmetics socket names
// COSMETICS, the list of 712 it can switch to (trimmed to two here).
const SPACEWALK_CLOAK = {
  hash: 2147583688,
  displayProperties: { name: 'Spacewalk Cloak' },
  itemType: 2,
  itemTypeDisplayName: 'Hunter Cloak',
  classType: 1,
  inventory: { tierType: 5, bucketTypeHash: 1585787867 },
  itemCategoryHashes: [23, 49, 20],
  plug: { plugCategoryIdentifier: 'armor_skins_hunter_class' },
  sockets: { socketEntries: [{ singleInitialItemHash: 4248210736, reusablePlugSetHash: 236342179 }] },
}
const DEFAULT_SHADER = {
  hash: 4248210736,
  displayProperties: { name: 'Default Shader' },
  itemType: 19,
  itemTypeDisplayName: 'Restore Defaults',
  classType: 3,
  inventory: { tierType: 2, bucketTypeHash: 2422292810 },
  plug: { plugCategoryIdentifier: 'shader' },
}
const ASTROGRAPH = {
  hash: 2412474869,
  displayProperties: { name: 'Astrograph' },
  itemType: 19,
  itemTypeDisplayName: 'Shader',
  classType: 3,
  inventory: { tierType: 5, bucketTypeHash: 2422292810 },
  plug: { plugCategoryIdentifier: 'shader' },
}
// An item Bungie keeps hidden: no plug data, so the copy doesn't keep it.
const CLASSIFIED = {
  hash: 3921006357,
  displayProperties: { name: 'Classified' },
  itemType: 0,
  classType: 0,
  inventory: { tierType: 0, bucketTypeHash: 2422292810 },
}
// Banshee's order for hand cannons; its icon is the weapon type's picture.
const HAND_CANNONS = {
  hash: 3177548761,
  displayProperties: { name: 'Hand Cannons' },
  itemType: 26,
  itemTypeDisplayName: 'Gunsmith Order',
  classType: 3,
  inventory: { tierType: 2, bucketTypeHash: 635141261 },
}
const TERRORS_END = {
  hash: 2176571298,
  displayProperties: { name: "Terror's End" },
  itemType: 14,
  itemTypeDisplayName: 'Emblem',
  classType: 3,
  inventory: { tierType: 5, bucketTypeHash: 4274335291 },
}
// A weapon's Kill Tracker and the objective it counts, whose icon is the badge
// of what it counts.
const KILL_TRACKER = {
  hash: 905869860,
  displayProperties: { name: 'Kill Tracker' },
  itemType: 19,
  classType: 3,
  inventory: { tierType: 2, bucketTypeHash: 3313201758 },
  plug: { plugCategoryIdentifier: 'v400.plugs.weapons.masterworks.trackers' },
  objectives: { objectiveHashes: [73837075] },
}
const ENEMIES_DEFEATED = {
  hash: 73837075,
  displayProperties: { icon: '/common/destiny2_content/icons/31c848643d47d317a9b971214a988d22.png' },
  progressDescription: 'Enemies Defeated',
  inProgressValueStyle: 6,
  completedValueStyle: 6,
}
// Spacewalk Cloak's cosmetics: entry 0 and entry 682 of the live list.
const COSMETICS = {
  hash: 236342179,
  reusablePlugItems: [
    { plugItemHash: 2412474869, currentlyCanRoll: true },
    { plugItemHash: 3921006357, currentlyCanRoll: true },
  ],
}
// An Armor 3.0 tuning mod: its investment stats are what it adds to the piece
// it's plugged into.
const TUNING_MOD = {
  hash: 309000506,
  displayProperties: { name: '+Grenade / -Melee' },
  itemType: 19,
  itemTypeDisplayName: 'General Armor Mod',
  classType: 3,
  inventory: { tierType: 2, bucketTypeHash: 2422292810 },
  plug: { plugCategoryIdentifier: 'core.gear_systems.armor_tiering.plugs.tuning.mods' },
  investmentStats: [
    { statTypeHash: 1735777505, value: 5, isConditionallyActive: false },
    { statTypeHash: 4244567218, value: -5, isConditionallyActive: false },
  ],
}
// An armor set and its two bonuses.
const ATHEONS_MEMORY = {
  hash: 741162535,
  displayProperties: { name: "Atheon's Memory" },
  setPerks: [
    { requiredSetCount: 2, sandboxPerkHash: 17188252 },
    { requiredSetCount: 4, sandboxPerkHash: 17188253 },
  ],
}
const RADIOLARIA_BREACH = { hash: 17188252, displayProperties: { name: 'Radiolaria Breach' } }
const COLLECTIVE_POWER = { hash: 17188253, displayProperties: { name: 'Collective Power' } }
// The activity modes whose icons badge each side of perk popularity.
const ICONS = '/common/destiny2_content/icons/'
const RAID = {
  hash: 2043403989,
  modeType: 4,
  displayProperties: {
    name: 'Raid',
    icon: ICONS + 'DestinyActivityModeDefinition_bfe80e3dafe6686a9dc42df0606bdc9b.png',
  },
}
const TRIALS = {
  hash: 1673724806,
  modeType: 84,
  displayProperties: {
    name: 'Trials of Osiris',
    icon: ICONS + 'DestinyActivityModeDefinition_e35792b49b249ca5dcdb1e7657ca42b6.png',
  },
}

// The manifest's tables the copy reads, each holding its definitions.
const DEFINITIONS = byHash({
  DestinyDamageTypeDefinition: [{ hash: 3373582085, enumValue: 1, displayProperties: { name: 'Kinetic' } }],
  DestinyBreakerTypeDefinition: [],
  DestinyStatDefinition: [],
  DestinyClassDefinition: [],
  DestinyActivityModeDefinition: [RAID, TRIALS],
  DestinyEquipableItemSetDefinition: [ATHEONS_MEMORY],
  DestinyInventoryItemDefinition: [
    FATEBRINGER,
    MINT_RETROGRADE,
    ADAPTIVE_FRAME,
    SPACEWALK_CLOAK,
    DEFAULT_SHADER,
    ASTROGRAPH,
    CLASSIFIED,
    HAND_CANNONS,
    TERRORS_END,
    KILL_TRACKER,
    TUNING_MOD,
  ],
  DestinyInventoryBucketDefinition: [
    { hash: 1498876634, displayProperties: { name: 'Kinetic Weapons' }, bucketOrder: 20 },
    { hash: 1585787867, displayProperties: { name: 'Class Armor' }, bucketOrder: 90 },
  ],
  DestinyCollectibleDefinition: [],
  DestinyObjectiveDefinition: [ENEMIES_DEFEATED],
  DestinySandboxPerkDefinition: [RADIOLARIA_BREACH, COLLECTIVE_POWER],
  DestinyPlugSetDefinition: [COSMETICS],
  DestinyInventoryItemConstantsDefinition: [],
})

type Definition = { hash: number; [field: string]: unknown }

// The manifest: one table per definition type, each definition under its
// hash, the way Bungie serves a table's JSON.
function byHash(tables: Record<string, Definition[]>) {
  const keyed = (definitions: Definition[]) => Object.fromEntries(definitions.map((d) => [d.hash, d]))
  return Object.fromEntries(Object.entries(tables).map(([table, definitions]) => [table, keyed(definitions)]))
}

let db: Database
beforeEach(() => {
  // A new database with nothing copied into it yet.
  db = createDb()
  return () => db.close()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function ingest() {
  return ingestManifest(db, DEFINITIONS, VERSION)
}

test('weapons, armor, plugs and Gunsmith Orders are copied and the rest skipped', () => {
  // The live manifest's 19,268 such definitions are copied and its other
  // 19,626 skipped: here an emblem, and the hidden item the cosmetics name.
  expect(ingest()).toEqual({ plugs: 6, weapons: 2, armor: 1, plugSets: 1 })
  expect(new Set(db.selectValues('SELECT name FROM DestinyInventoryItemDefinition'))).toEqual(
    new Set([
      'Fatebringer (Timelost)',
      'Mint Retrograde',
      'Adaptive Frame',
      'Spacewalk Cloak',
      'Default Shader',
      'Astrograph',
      'Hand Cannons',
      'Kill Tracker',
      '+Grenade / -Melee',
    ]),
  )
  const ammo = db.selectValue('SELECT ammoType FROM DestinyInventoryItemDefinition WHERE hash = 4219826183')
  expect(ammo).toBe(1) // primary
})

test('the objectives plugs count are copied with their badges', () => {
  // The Kill Tracker's "Enemies Defeated", which the report draws as its
  // badge, as DIM does.
  ingest()
  expect(db.selectArrays('SELECT * FROM DestinyObjectiveDefinition')).toEqual([
    [73837075, 'Enemies Defeated', 6, 6, '/common/destiny2_content/icons/31c848643d47d317a9b971214a988d22.png'],
  ])
})

// A JSON column of the row keyed by hash key, parsed.
function jsonColumn(table: string, column: string, key: number) {
  return JSON.parse(db.selectValue(`SELECT ${column} FROM ${table} WHERE hash = ?`, [key]) as string)
}

test('a weapon keeps its sockets and a plug its stats in its own row', () => {
  // Each list holds the fields the app reads, in Bungie's order: the tuning
  // mod's isConditionallyActive goes. A weapon's stats and a plug's sockets
  // aren't kept, so they're [].
  ingest()
  const item = 'DestinyInventoryItemDefinition'
  expect(jsonColumn(item, 'socketEntries', 4219826183)).toEqual([
    { singleInitialItemHash: 1294026524, reusablePlugSetHash: 1 },
    { singleInitialItemHash: 1840239774, randomizedPlugSetHash: 2044988252 },
  ])
  expect(jsonColumn(item, 'investmentStats', 4219826183)).toEqual([])
  expect(jsonColumn(item, 'investmentStats', 309000506)).toEqual([
    { statTypeHash: 1735777505, value: 5 },
    { statTypeHash: 4244567218, value: -5 },
  ])
  expect(jsonColumn(item, 'socketEntries', 309000506)).toEqual([])
})

test('a socket naming no plug set keeps its inline plugs', () => {
  // Mint Retrograde's origin socket lists its options inline, so they are
  // kept; Fatebringer's sockets name plug sets, so their inline lists go.
  ingest()
  expect(jsonColumn('DestinyInventoryItemDefinition', 'socketEntries', 3285784871)).toEqual([
    {
      singleInitialItemHash: 3454102905,
      reusablePlugItems: [
        { plugItemHash: 3454102905 },
        { plugItemHash: 3846229553 },
        { plugItemHash: 2223800157 },
        { plugItemHash: 1621842933 },
      ],
    },
  ])
})

test('the activity modes are copied with their icons', () => {
  ingest()
  expect(db.selectArrays('SELECT * FROM DestinyActivityModeDefinition ORDER BY modeType')).toEqual(
    [RAID, TRIALS].map((m) => [m.hash, m.modeType, m.displayProperties.name, m.displayProperties.icon]),
  )
})

test('an armor set keeps its bonuses and their perks are copied', () => {
  ingest()
  expect(jsonColumn('DestinyEquipableItemSetDefinition', 'setPerks', 741162535)).toEqual([
    { requiredSetCount: 2, sandboxPerkHash: 17188252 },
    { requiredSetCount: 4, sandboxPerkHash: 17188253 },
  ])
  const names = db.selectValues('SELECT name FROM DestinySandboxPerkDefinition ORDER BY hash')
  expect(names).toEqual(['Radiolaria Breach', 'Collective Power'])
})

test('a plug set keeps its entries as listed', () => {
  // The cosmetics list names the Classified item, which the copy doesn't
  // keep: its entry stays as sent, and views joining on stored plugs skip it.
  ingest()
  expect(jsonColumn('DestinyPlugSetDefinition', 'reusablePlugItems', 236342179)).toEqual([
    { plugItemHash: 2412474869, currentlyCanRoll: true },
    { plugItemHash: 3921006357, currentlyCanRoll: true },
  ])
})

// Downloading the manifest, with fetch swapped for Bungie's servers.

const MANIFEST = 'https://www.bungie.net/Platform/Destiny2/Manifest/'
// Where Bungie serves each table's JSON, as the manifest's
// jsonWorldComponentContentPaths name them.
const PATHS: Record<string, string> = Object.fromEntries(
  Object.keys(DEFINITIONS).map((table) => [
    table,
    `/common/destiny2_content/json/en/${table}-e677f6ea-2a1e-48d4-a8c8-700a39a62585.json`,
  ]),
)

// Swap fetch for Bungie's servers: the API names VERSION and each table's
// path, and each path serves its table (the item definitions as items, when
// given). Returns the [url, has a timeout] of each request.
function serve(items?: BodyInit): [string, boolean][] {
  const sent: [string, boolean][] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    sent.push([url, init?.signal instanceof AbortSignal])
    if (url === MANIFEST) {
      const response = { version: VERSION, jsonWorldComponentContentPaths: { en: PATHS } }
      return new Response(JSON.stringify({ Response: response, ErrorCode: 1, ErrorStatus: 'Success' }))
    }
    const table = Object.keys(PATHS).find((t) => url === `https://www.bungie.net${PATHS[t]}`)!
    if (items !== undefined && table === 'DestinyInventoryItemDefinition') return new Response(items)
    return new Response(JSON.stringify(DEFINITIONS[table]))
  })
  return sent
}

// How many rows the manifest left: its damage types (copied first), its
// items, its version and its source status.
function manifestRows() {
  return ['DestinyDamageTypeDefinition', 'DestinyInventoryItemDefinition', 'manifest_version', 'source_status'].map(
    (table) => db.selectValue(`SELECT count(*) FROM ${table}`),
  )
}

test('the manifest is downloaded from the paths Bungie names, and its version recorded', async () => {
  // One request for the API and one for each table, every one with a
  // timeout. The version is Bungie's, recorded with the source's status.
  const sent = serve()
  await extractManifest(db)
  const urls = [MANIFEST, ...Object.values(PATHS).map((path) => `https://www.bungie.net${path}`)]
  expect(sent.sort()).toEqual(urls.sort().map((url) => [url, true]))
  expect(manifestRows()).toEqual([1, 9, 1, 1])
  expect(db.selectValues('SELECT version FROM manifest_version')).toEqual([VERSION])
  expect(db.selectArrays('SELECT source, status, detail FROM source_status')).toEqual([['manifest', 'fresh', VERSION]])
})

test('an API key goes with the index call', async () => {
  // Bungie mostly answers the index without one, but sometimes refuses with
  // ApiKeyMissingFromRequest, so the data build sends its key.
  serve()
  await extractManifest(db, 'KEY')
  const calls = vi.mocked(globalThis.fetch).mock.calls
  const index = calls.filter(([input]) => String(input) === MANIFEST)
  expect(index.map(([, init]) => new Headers(init?.headers).get('X-API-Key'))).toEqual(['KEY'])
})

test('a broken download leaves no manifest behind', async () => {
  // Nothing is written until every table is in: the build fails, and the
  // last good deploy stays live.
  serve('<html>')
  await expect(extractManifest(db)).rejects.toThrow(SyntaxError)
  expect(manifestRows()).toEqual([0, 0, 0, 0])
})

test('a download cut off midway leaves no manifest behind', async () => {
  // The connection drops after the first chunk of the item definitions; the
  // build fails, and the next one starts over.
  const items = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"4219826183": {"hash": 4219826183, '))
      controller.error(new Error('Connection broken'))
    },
  })
  serve(items)
  await expect(extractManifest(db)).rejects.toThrow('Connection broken')
  expect(manifestRows()).toEqual([0, 0, 0, 0])
})
