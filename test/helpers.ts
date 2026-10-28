// Shared test data, ported from d2-inventory-report's tests/conftest.py: fake
// plugs with real Bungie categories, and helpers that write definitions,
// copies, preferences and perk popularity the way the data build and the
// profile extract write them. testDb() is the old conn fixture.
import { crc32 } from 'node:zlib'
import { type BindableValue, type Database } from '@sqlite.org/sqlite-wasm'
import { STAT_KEYS, createDb, saveVocabulary } from '../build/db.ts'

declare global {
  interface JSON {
    rawJSON(text: string): unknown
  }
}

// A number as Python's json.dumps writes a float: 50 becomes 50.0. In JSON,
// SQLite reads 50.0 as a REAL and 50 as an INTEGER, and dividing two integers
// drops the remainder, so the values Python wrote as floats keep their point.
function real(n: number): unknown {
  return Number.isInteger(n) ? JSON.rawJSON(n.toFixed(1)) : n
}

// Plug hash constants: fake hashes used across the tests. Each has a real
// Bungie plugCategoryIdentifier, since the views sort plugs by category:
// v_plug's perk kinds, v_armor's stat plugs, v_armor_tuning's mods,
// v_kill_tracker's trackers.

export const TRAIT_PERK_A = 1001 // "Rampage"     — category: frames
export const TRAIT_PERK_B = 1002 // "Kill Clip"   — category: frames
export const TRAIT_PERK_C = 1003 // "Outlaw"      — category: frames
export const TRAIT_PERK_D = 1004 // "Subsistence" — category: frames
export const TRAIT_PERK_E = 1005 // "Firefly"     — category: frames

export const BARREL_PERK_X = 2001 // "Hammer-Forged Rifling" — category: barrels
export const BARREL_PERK_Y = 2002 // "Fluted Barrel"         — category: barrels

export const MAG_PERK_P = 3001 // "Appended Mag" — category: magazines
export const MAG_PERK_Q = 3002 // "Tactical Mag" — category: magazines

export const ORIGIN_PERK = 4001 // "Vanguard's Vindication" — category: origins

export const INTRINSIC_ADAPTIVE = 5001 // "Adaptive Frame"   — category: intrinsics
export const INTRINSIC_AGGRESSIVE = 5002 // "Aggressive Frame" — category: intrinsics

// Armor-related plugs
export const ARMOR_STAT_PLUG_A = 6001 // intrinsic stat plug — category: armor_stats
export const MW_PLUG_FULL = 6101 // masterwork plug — category: v400.plugs.armor.masterworks.stat.resistance
export const TUNING_HEALTH = 6201 // +5 Health tuning — category: TUNING_CATEGORY
export const TUNING_BALANCED = 6202 // Balanced Tuning — same category but +1 to all
export const TUNING_MELEE = 6203 // +5 Melee tuning — same category

export const TUNING_CATEGORY = 'core.gear_systems.armor_tiering.plugs.tuning.mods'

// Kill trackers — category: v400.plugs.weapons.masterworks.trackers
export const KILL_TRACKER = 7001
export const CRUCIBLE_TRACKER = 7002

// Objectives the trackers count, with their live hashes (two of those DIM
// reads as PvE and PvP): hash → [progressDescription, inProgressValueStyle,
// completedValueStyle, icon]; style 6 is Integer.
export const ENEMIES_DEFEATED = 73837075
export const OPPONENTS_DEFEATED = 74070459
const OBJECTIVES = new Map<number, [string, number, number, string]>([
  [ENEMIES_DEFEATED, ['Enemies Defeated', 6, 6, '/common/destiny2_content/icons/31c848643d47d317a9b971214a988d22.png']],
  [
    OPPONENTS_DEFEATED,
    ['Crucible Opponents Defeated', 6, 6, '/common/destiny2_content/icons/66317c523dd68205dcc753c7563d5068.png'],
  ],
])

// The stat hashes by the app's name for them.
const STAT_HASH: Record<string, number> = Object.fromEntries(
  Object.entries(STAT_KEYS).map(([hash, key]) => [key, Number(hash)]),
)

type Plug = {
  name: string
  category: string
  icon: string
  description: string
  investmentStats: { statTypeHash: number; value: number }[]
}

// Plug database: hash → its definition.
const PLUG_DB = new Map<number, Plug>([
  [TRAIT_PERK_A, plug('Rampage', 'frames', '/img/rampage.png', 'Kills grant bonus damage.')],
  [TRAIT_PERK_B, plug('Kill Clip', 'frames', '/img/killclip.png', 'Reloading after a kill grants bonus damage.')],
  [TRAIT_PERK_C, plug('Outlaw', 'frames', '/img/outlaw.png', 'Precision kills greatly decrease reload time.')],
  [TRAIT_PERK_D, plug('Subsistence', 'frames', '/img/subsistence.png', 'Defeating targets partially reloads the magazine.')],
  [TRAIT_PERK_E, plug('Firefly', 'frames', '/img/firefly.png', 'Precision kills cause the target to explode.')],
  [BARREL_PERK_X, plug('Hammer-Forged Rifling', 'barrels', '/img/hammerforged.png', 'Increased range.')],
  [BARREL_PERK_Y, plug('Fluted Barrel', 'barrels', '/img/fluted.png', 'Increased handling and stability.')],
  [MAG_PERK_P, plug('Appended Mag', 'magazines', '/img/appendedmag.png', 'Increased magazine size.')],
  [
    MAG_PERK_Q,
    plug('Tactical Mag', 'magazines', '/img/tacticalmag.png', 'Increased magazine size, reload speed, and stability.'),
  ],
  [ORIGIN_PERK, plug("Vanguard's Vindication", 'origins', '/img/vanguard.png', 'Final blows grant health regeneration.')],
  [INTRINSIC_ADAPTIVE, plug('Adaptive Frame', 'intrinsics', '/img/adaptive.png', 'A well-rounded grip.')],
  [INTRINSIC_AGGRESSIVE, plug('Aggressive Frame', 'intrinsics', '/img/aggressive.png', 'High damage, slow fire rate.')],
  [
    ARMOR_STAT_PLUG_A,
    plug('Stat Plug A', 'armor_stats', '', '', {
      health: 10,
      melee: 7,
      grenade: 15,
      super_stat: 8,
      class_stat: 5,
      weapons: 12,
    }),
  ],
  [MW_PLUG_FULL, plug('Upgrade Armor', 'v400.plugs.armor.masterworks.stat.resistance', '', '', { health: 2 })],
  [TUNING_HEALTH, plug('+5 Health / -5 Melee', TUNING_CATEGORY, '', '', { health: 5, melee: -5 })],
  [TUNING_MELEE, plug('+5 Melee / -5 Health', TUNING_CATEGORY, '', '', { melee: 5, health: -5 })],
  [
    TUNING_BALANCED,
    plug('Balanced Tuning', TUNING_CATEGORY, '', '', {
      health: 1,
      melee: 1,
      grenade: 1,
      super_stat: 1,
      class_stat: 1,
      weapons: 1,
    }),
  ],
  [KILL_TRACKER, plug('Kill Tracker', 'v400.plugs.weapons.masterworks.trackers', '', '')],
  [CRUCIBLE_TRACKER, plug('Crucible Tracker', 'v400.plugs.weapons.masterworks.trackers', '', '')],
])

function plug(name: string, category: string, icon: string, description: string, stats = {}): Plug {
  return { name, category, icon, description, investmentStats: investmentStats(stats) }
}

// A plug's investmentStats from {stat name: value}.
function investmentStats(stats: Record<string, number>) {
  return Object.entries(stats).map(([key, value]) => ({ statTypeHash: STAT_HASH[key], value }))
}

// A weapon copy's sockets: intrinsic, barrel, magazine, two traits, origin, and
// an armor masterwork plug standing in for a socket that isn't a perk.
export const WEAPON_SOCKETS = [
  INTRINSIC_ADAPTIVE,
  BARREL_PERK_X,
  MAG_PERK_P,
  TRAIT_PERK_A,
  TRAIT_PERK_C,
  ORIGIN_PERK,
  MW_PLUG_FULL,
]

// The damage types the manifest defines (DestinyDamageTypeDefinition): enum
// value -> [hash, name].
const DAMAGE_TYPES = new Map<number, [number, string]>([
  [1, [3373582085, 'Kinetic']],
  [2, [2303181850, 'Arc']],
  [3, [1847026933, 'Solar']],
  [4, [3454344768, 'Void']],
  [6, [151347233, 'Stasis']],
  [7, [3949783978, 'Strand']],
])

// The weapon and armor buckets (DestinyInventoryBucketDefinition): hash, name,
// bucketOrder.
export const KINETIC_BUCKET = 1498876634
export const HELMET_BUCKET = 3448274439
const BUCKETS: [number, string, number][] = [
  [KINETIC_BUCKET, 'Kinetic Weapons', 20],
  [2465295065, 'Energy Weapons', 30],
  [953998645, 'Power Weapons', 40],
  [HELMET_BUCKET, 'Helmet', 50],
  [3551918588, 'Gauntlets', 60],
  [14239492, 'Chest Armor', 70],
  [20886954, 'Leg Armor', 80],
  [1585787867, 'Class Armor', 90],
]

// The classes (DestinyClassDefinition): hash, classType, name.
const CLASSES: [number, number, string][] = [
  [3655393761, 0, 'Titan'],
  [671679327, 1, 'Hunter'],
  [2271682572, 2, 'Warlock'],
]
const BUCKET_HASHES = Object.fromEntries(BUCKETS.map(([hash, name]) => [name, hash]))
const CLASS_TYPES = Object.fromEntries(CLASSES.map(([, classType, name]) => [name, classType]))

// A database with the schema and the defaults, holding what the data build
// and the extract would: the test plugs with their investment stats and
// objectives, the damage types, the stats the app names, the weapon and armor
// buckets, the classes, and the app's stat vocabulary.
export function testDb(): Database {
  const db = createDb()
  for (const [hash, p] of PLUG_DB) {
    insert(db, 'DestinyInventoryItemDefinition', {
      hash,
      name: p.name,
      description: p.description,
      icon: p.icon,
      plugCategoryIdentifier: p.category,
      investmentStats: JSON.stringify(p.investmentStats),
    })
  }
  for (const [hash, objective] of OBJECTIVES) {
    db.exec('INSERT INTO DestinyObjectiveDefinition VALUES (?, ?, ?, ?, ?)', { bind: [hash, ...objective] })
  }
  for (const [enumValue, [hash, name]] of DAMAGE_TYPES) {
    insert(db, 'DestinyDamageTypeDefinition', { hash, enumValue, name })
  }
  for (const [hash, key] of Object.entries(STAT_KEYS)) {
    db.exec('INSERT INTO DestinyStatDefinition VALUES (?, ?, ?)', { bind: [Number(hash), key, `/img/${key}.png`] })
  }
  for (const bucket of BUCKETS) db.exec('INSERT INTO DestinyInventoryBucketDefinition VALUES (?, ?, ?)', { bind: bucket })
  for (const cls of CLASSES) db.exec('INSERT INTO DestinyClassDefinition VALUES (?, ?, ?)', { bind: cls })
  saveVocabulary(db)
  return db
}

// INSERT one row of {column: value} into table.
function insert(db: Database, table: string, row: Record<string, unknown>): void {
  const columns = Object.keys(row)
  db.exec(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, {
    bind: Object.values(row) as BindableValue[],
  })
}

// True for a dict holding something: Python's truthiness, which add_copy uses
// to leave out a component.
function hasEntries(value: object | undefined): value is object {
  return value !== undefined && Object.keys(value).length > 0
}

// Definitions and copies in the db, written the way the manifest ingest and
// the profile extract write them.

// A definition's socketEntries: one entry per starting plug, 0 for a socket
// that starts empty (null).
function socketEntries(plugs: (number | null)[]): string {
  return JSON.stringify(plugs.map((plug) => ({ singleInitialItemHash: plug || 0 })))
}

type WeaponDef = {
  name?: string
  tier?: number
  damageType?: number | null
  sockets?: (number | null)[]
  // Any other DestinyInventoryItemDefinition column.
  [column: string]: unknown
}

// A kinetic Auto Rifle definition with one socket entry per entry in sockets,
// the socket's starting plug (default: the Adaptive Frame intrinsic). Any
// other key sets that DestinyInventoryItemDefinition column.
export function addWeaponDef(db: Database, itemHash: number, def: WeaponDef = {}): void {
  const { name = 'Test Rifle', tier = 5, damageType = 1, sockets = [INTRINSIC_ADAPTIVE], ...fields } = def
  insert(db, 'DestinyInventoryItemDefinition', {
    hash: itemHash,
    name,
    itemType: 3,
    itemTypeDisplayName: 'Auto Rifle',
    tierType: tier,
    bucketTypeHash: KINETIC_BUCKET,
    defaultDamageTypeHash: damageType ? DAMAGE_TYPES.get(damageType)![0] : null,
    socketEntries: socketEntries(sockets),
    ...fields,
  })
}

// A plug set listing plugs ([plug hash, currentlyCanRoll]) in that order,
// named by the definition's socket socketIdx as its key (randomizedPlugSetHash,
// or reusablePlugSetHash for a set to switch to).
export function addPlugSet(
  db: Database,
  itemHash: number,
  socketIdx: number,
  setHash: number,
  plugs: [number, boolean | number][],
  key = 'randomizedPlugSetHash',
): void {
  const entries = plugs.map(([h, canRoll]) => ({ plugItemHash: h, currentlyCanRoll: Boolean(canRoll) }))
  db.exec('INSERT INTO DestinyPlugSetDefinition VALUES (?, ?)', { bind: [setHash, JSON.stringify(entries)] })
  db.exec(
    `UPDATE DestinyInventoryItemDefinition SET socketEntries = json_set(socketEntries, '$[${socketIdx}].${key}', ?) ` +
      'WHERE hash = ?',
    { bind: [setHash, itemHash] },
  )
}

// The inline plug list (reusablePlugItems) of the definition's socket
// socketIdx, as a socket naming no plug set keeps it.
export function addInlinePlugs(db: Database, itemHash: number, socketIdx: number, plugs: number[]): void {
  db.exec(
    'UPDATE DestinyInventoryItemDefinition ' +
      `SET socketEntries = json_set(socketEntries, '$[${socketIdx}].reusablePlugItems', json(?)) WHERE hash = ?`,
    { bind: [JSON.stringify(plugs.map((h) => ({ plugItemHash: h }))), itemHash] },
  )
}

type ArmorDef = {
  name?: string
  setName?: string
  setHash?: number | null
  tier?: number
  sockets?: (number | null)[]
  slot?: string
  armorClass?: string
}

// An armor definition (a Titan helmet unless slot and armorClass say
// otherwise), the armor set it belongs to and its socket entries. A setName
// makes an armor set of that name (setHash, else a hash of the name); with
// setName '' the piece is outside a set. sockets is each socket's starting
// plug (null for none).
export function addArmorDef(db: Database, itemHash: number, def: ArmorDef = {}): void {
  const { name = 'Test Helm', setName = 'Bushido', tier = 5, sockets = [], slot = 'Helmet', armorClass = 'Titan' } = def
  let { setHash = null } = def
  if (setName && setHash === null) setHash = crc32(setName)
  if (setName) {
    db.exec('INSERT OR IGNORE INTO DestinyEquipableItemSetDefinition (hash, name) VALUES (?, ?)', {
      bind: [setHash, setName],
    })
  }
  db.exec(
    'INSERT INTO DestinyInventoryItemDefinition ' +
      '(hash, name, itemType, classType, tierType, bucketTypeHash, equipableItemSetHash, socketEntries) ' +
      'VALUES (?, ?, 2, ?, ?, ?, ?, ?)',
    { bind: [itemHash, name, CLASS_TYPES[armorClass], tier, BUCKET_HASHES[slot], setHash, socketEntries(sockets)] },
  )
}

// The armor set's bonuses, perks: [requiredSetCount, sandboxPerkHash].
export function addSetPerks(db: Database, setHash: number, perks: [number, number][]): void {
  const setPerks = perks.map(([n, h]) => ({ requiredSetCount: n, sandboxPerkHash: h }))
  db.exec('UPDATE DestinyEquipableItemSetDefinition SET setPerks = ? WHERE hash = ?', {
    bind: [JSON.stringify(setPerks), setHash],
  })
}

type Copy = {
  reusable?: Record<number, number[]>
  stats?: Record<number, number>
  state?: number
  damageType?: number | null
  objectives?: Record<number, [number, number][]>
  gearTier?: number | null
}

// A copy: its DestinyItemComponent row, its instance data when it has a
// damageType (an enum value) or a gearTier, and a row of JSON for each
// component given: the plug in each socket (sockets, null for an empty one),
// the plugs a socket can switch to (reusable, {socket index: [plug hashes]}),
// its stats ({stat hash: value}) and its plugs' objective progress
// (objectives, {plug hash: [[objective hash, progress]]}).
export function addCopy(
  db: Database,
  instanceId: string,
  itemHash: number,
  sockets: (number | null)[] = [],
  copy: Copy = {},
): void {
  const { reusable, stats, state = 0, damageType = null, objectives, gearTier = null } = copy
  const components: [string, unknown][] = []
  if (sockets.length) {
    components.push(['DestinyItemSocketsComponent', sockets.map((plug) => (plug ? { plugHash: plug } : {}))])
  }
  if (hasEntries(reusable)) {
    const value = Object.fromEntries(
      Object.entries(reusable).map(([idx, plugs]) => [idx, plugs.map((plug) => ({ plugItemHash: plug }))]),
    )
    components.push(['DestinyItemReusablePlugsComponent', value])
  }
  if (hasEntries(stats)) components.push(['DestinyItemStatsComponent', stats])
  if (hasEntries(objectives)) {
    const value = Object.fromEntries(
      Object.entries(objectives).map(([plug, entries]) => [
        plug,
        entries.map(([o, p]) => ({ objectiveHash: o, progress: p })),
      ]),
    )
    components.push(['DestinyItemPlugObjectivesComponent', value])
  }
  insert(db, 'DestinyItemComponent', { itemInstanceId: instanceId, itemHash, state })
  if (damageType || gearTier) {
    insert(db, 'DestinyItemInstanceComponent', {
      itemInstanceId: instanceId,
      damageTypeHash: damageType ? DAMAGE_TYPES.get(damageType)![0] : null,
      gearTier,
    })
  }
  for (const [table, value] of components) {
    db.exec(`INSERT INTO ${table} VALUES (?, ?)`, { bind: [instanceId, JSON.stringify(value)] })
  }
}

type Armor = {
  setName?: string
  slot?: string
  armorClass?: string
  name?: string
  exotic?: boolean
  tuning?: string[]
  gearTier?: number | null
  perks?: string[]
  score?: number
}

// One armor copy with a definition of its own (named after its set and slot
// unless name is given; Exotic or Legendary): a stat plug carrying its base
// stats ({stat name: value}), a tuning plug raising each stat in tuning, its
// gear tier, an intrinsic plug named after each of perks, and its armor_score
// row when score is given.
export function addArmor(db: Database, instanceId: string, stats: Record<string, number>, armor: Armor = {}): void {
  const {
    setName = 'Bushido',
    slot = 'Helmet',
    armorClass = 'Warlock',
    name,
    exotic = false,
    tuning = ['health'],
    gearTier = 5,
    perks = [],
    score,
  } = armor
  const itemHash = crc32(instanceId)
  addArmorDef(db, itemHash, { name: name || `${setName} ${slot}`, setName, tier: exotic ? 6 : 5, slot, armorClass })
  const statPlug: [number, string, string, Record<string, number>] = [
    crc32(`stats ${instanceId}`),
    '',
    'armor_stats',
    stats,
  ]
  const tuningPlugs = tuning.map((stat): [number, string, string, Record<string, number>] => [
    crc32(`tuning ${stat}`),
    '',
    TUNING_CATEGORY,
    { [stat]: 5 },
  ])
  const perkPlugs = perks.map((p): [number, string, string, Record<string, number>] => [
    crc32(`perk ${p}`),
    p,
    'intrinsics',
    {},
  ])
  for (const [hash, plugName, category, values] of [statPlug, ...tuningPlugs, ...perkPlugs]) {
    db.exec(
      'INSERT OR IGNORE INTO DestinyInventoryItemDefinition (hash, name, plugCategoryIdentifier, investmentStats) ' +
        'VALUES (?, ?, ?, ?)',
      { bind: [hash, plugName, category, JSON.stringify(investmentStats(values))] },
    )
  }
  const sockets = [statPlug[0], ...perkPlugs.map(([h]) => h)]
  let reusable: Record<number, number[]> = {}
  if (tuningPlugs.length) {
    reusable = { [sockets.length]: tuningPlugs.map(([h]) => h) }
    sockets.push(tuningPlugs[0][0])
  }
  addCopy(db, instanceId, itemHash, sockets, { reusable, gearTier })
  if (score !== undefined) {
    db.exec('INSERT INTO armor_score (instance_id, preferred_score) VALUES (?, ?)', { bind: [instanceId, score] })
  }
}

// Save a set's armor preference: its grade, rank and stat picks.
export function addPreference(db: Database, name: string, grade: string, rank = 0, stats: string[] = []): void {
  const [stat1 = null, stat2 = null, stat3 = null] = stats
  db.exec('INSERT INTO armor_preference (name, stat_1, stat_2, stat_3, grade, rank) VALUES (?, ?, ?, ?, ?, ?)', {
    bind: [name, stat1, stat2, stat3, grade, rank],
  })
}

// d2-perk-popularity's scores, written the way the data build stores the
// published file. Its n_eff, shares and ranges are floats.

// One published column: its kind, its perks [name, share] most picked first
// ('A + B' for a trait pair), and n_eff with the confidence it grades to.
// Each perk's 95% range is its share 0.05 either way.
export function popularityColumn(kind: string, perks: [string, number][], nEff = 50) {
  let confidence = 'very low'
  if (nEff >= 100) confidence = 'high'
  else if (nEff >= 30) confidence = 'medium'
  else if (nEff >= 10) confidence = 'low'
  return {
    kind,
    n_eff: real(nEff),
    confidence,
    perks: perks.map(([perk, share]) => ({
      perk,
      share: real(share),
      low: real(share - 0.05),
      high: real(share + 0.05),
    })),
  }
}

type Popularity = {
  side?: string
  family?: string | null
  rank?: number
  players?: number
  hardCopies?: number
  columns?: ReturnType<typeof popularityColumn>[]
}

// A weapon scored on one side: its versions, rank and voting copies
// (hardCopies of them from hard content, as many effective votes), and its
// published columns (popularityColumn). family defaults to the name.
export function addPopularity(db: Database, name: string, itemHashes: number[], popularity: Popularity = {}): void {
  const { side = 'pve', family = null, rank = 1, players = 100, hardCopies = 0, columns = [] } = popularity
  const groups = {
    hard: { copies: hardCopies, n_eff: real(hardCopies) },
    normal: { copies: players - hardCopies, n_eff: real(players - hardCopies) },
  }
  db.exec(
    'INSERT INTO perk_popularity_weapon (side, name, family, type, item_hash, item_hashes, rank, players, ' +
      "active_players, hard, hard_weight, last_seen, stale, groups, columns) VALUES (?, ?, ?, 'Auto Rifle', ?, ?, " +
      "?, ?, ?, 0, 0.5, '2026-10-23T22:00:00Z', 0, ?, ?)",
    {
      bind: [
        side,
        name,
        family || name,
        itemHashes[0],
        JSON.stringify(itemHashes),
        rank,
        players,
        players,
        JSON.stringify(groups),
        JSON.stringify(columns),
      ],
    },
  )
}

// The published file's categories [key, label, side, hard], in order.
export function addPopularityFile(db: Database, categories: [string, string, string, boolean][]): void {
  const value = categories.map(([key, label, side, hard]) => ({ key, label, side, weight: 1, hard }))
  db.exec("INSERT INTO perk_popularity_file VALUES ('2026-10-25T15:23:40Z', '{}', ?)", {
    bind: [JSON.stringify(value)],
  })
}
