// Tests for the report's queries (src/report/load.ts): each test writes copies
// and saved results with the test helpers, then checks the rows a page shows
// and their order.
import { type Database, type SqlValue } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as load from '../../src/report/load.ts'
import * as c from '../helpers.ts'

const ROLL = { health: 30, melee: 25, grenade: 20 }

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

// The query's rows as arrays of the named columns.
function rows(sql: string, ...columns: string[]): SqlValue[][] {
  return db.selectObjects(sql).map((r) => columns.map((col) => r[col]))
}

// A copy of the Test Rifle (definition 100) whose trait socket can switch to
// traits, and its weapon_result row.
function addRifleCopy(
  instanceId: string,
  traits: number[],
  gearTier: number,
  matchCount: number,
  hasWishlist = 1,
  damageType: number | null = null,
): void {
  c.addCopy(db, instanceId, 100, [c.INTRINSIC_ADAPTIVE, traits[0]], { reusable: { 1: traits }, gearTier, damageType })
  db.exec('INSERT INTO weapon_result VALUES (?, ?, ?)', { bind: [instanceId, matchCount, hasWishlist] })
}

// The Test Rifle, whose trait socket rolls Kill Clip, Rampage and Outlaw in
// that order, and Subsistence no longer. Its intrinsic socket rolls too, but
// no copy can switch it.
function addRifle(): void {
  c.addWeaponDef(db, 100, { sockets: [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A] })
  c.addPlugSet(db, 100, 1, 900, [
    [c.TRAIT_PERK_B, 1],
    [c.TRAIT_PERK_A, 1],
    [c.TRAIT_PERK_C, 1],
    [c.TRAIT_PERK_D, 0],
  ])
  c.addPlugSet(db, 100, 0, 901, [[c.INTRINSIC_ADAPTIVE, 1]], 'reusablePlugSetHash')
}

// Wishlists One and Two, after the defaults, with rolls for the Test Rifle
// [roll_id, list key, perk1, perk2, is_trash] and the copies' matches
// [instance_id, roll_id].
function addLists(
  rolls: [number, string, number | null, number | null, number][],
  matches: [string, number][],
): void {
  for (const table of ['wishlist_preference', 'wishlist_source']) {
    for (const list of [
      ['one', 'One'],
      ['two', 'Two'],
    ]) {
      db.exec(`INSERT INTO ${table} (key, label, url) VALUES (?, ?, '')`, { bind: list })
    }
  }
  for (const roll of rolls) {
    db.exec(
      'INSERT INTO wishlist_roll (roll_id, source_key, item_hash, perk1, perk2, is_trash) VALUES (?, ?, 100, ?, ?, ?)',
      { bind: roll },
    )
  }
  for (const match of matches) db.exec('INSERT INTO instance_wishlist_match VALUES (?, ?)', { bind: match })
}

test("roll copies rank each card's copies by popularity", () => {
  // Every card with a copy left, by name: the Solo Rifle's one copy, then
  // the Test Rifle's, scored on PvE by its trait column. b's Rampage and c's
  // are the favourite, a's Kill Clip half as picked: c leads on its 3
  // wishlist matches, then b, then a. PvP has no scores, so wishlist
  // matches, then gear tier, decide: c, a (Tier 5), b. A pruned copy is left
  // out. a completes One's Kill Clip roll and fits Two's trash roll, which
  // doesn't count in its split by list; only One's rolls name perks for the
  // rifle. Only the Test Rifle is to review.
  addRifle()
  c.addWeaponDef(db, 200, { name: 'Solo Rifle', sockets: [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A] })
  addRifleCopy('b', [c.TRAIT_PERK_A, c.TRAIT_PERK_C], 4, 1)
  addRifleCopy('a', [c.TRAIT_PERK_B, c.TRAIT_PERK_D], 5, 1)
  addRifleCopy('c', [c.TRAIT_PERK_A], 4, 3)
  addRifleCopy('pruned', [c.TRAIT_PERK_A], 4, 0)
  c.addCopy(db, 'solo', 200, [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A], { reusable: { 1: [c.TRAIT_PERK_A] } })
  c.addPopularity(db, 'Test Rifle', [100], {
    rank: 4,
    columns: [
      c.popularityColumn('trait1', [
        ['Rampage', 0.6],
        ['Kill Clip', 0.3],
        ['Outlaw', 0.1],
      ]),
    ],
  })
  db.exec("INSERT INTO weapon_result VALUES ('solo', 0, 0)")
  db.exec("INSERT INTO weapon_pruning VALUES ('pruned', 'exact_duplicate', 'c')")
  addLists(
    [
      [1, 'one', c.TRAIT_PERK_B, null, 0],
      [2, 'two', c.TRAIT_PERK_D, null, 1],
    ],
    [
      ['a', 1],
      ['a', 2],
    ],
  )

  expect(
    rows(
      load.ROLL_COPIES,
      'instance_id',
      'card',
      'k',
      'pve_rank',
      'pve_heat',
      'pvp_rank',
      'pvp_score',
      'pve_weapon_rank',
      'split',
      'matched',
      'trash',
      'covered',
    ),
  ).toEqual([
    ['solo', 'Solo Rifle', 1, 1, null, 1, null, null, null, '', '', ''],
    ['c', 'Test Rifle', 3, 1, 10, 1, null, 4, null, '', '', 'one'],
    ['b', 'Test Rifle', 2, 2, 10, 3, null, 4, null, '', '', 'one'],
    ['a', 'Test Rifle', 1, 3, 5, 2, null, 4, '1 One', 'one', 'two', 'one'],
  ])
  const totals = db.selectObject(load.TOTALS)!
  expect(totals.to_review).toBe(1)
  expect([totals.matched, totals.uncovered]).toEqual([3, 1])
})

test('grid rows name the copies with each perk and the rolls they complete', () => {
  // a (1 on the card) can switch between Kill Clip and Rampage, b (2) has
  // Rampage. Both complete One's Rampage roll, a Two's Kill Clip roll too:
  // their places after the three default lists are 4 and 5.
  addRifle()
  addRifleCopy('a', [c.TRAIT_PERK_B, c.TRAIT_PERK_A], 5, 2)
  addRifleCopy('b', [c.TRAIT_PERK_A], 5, 1)
  addLists(
    [
      [1, 'one', c.TRAIT_PERK_A, null, 0],
      [2, 'two', c.TRAIT_PERK_B, null, 0],
    ],
    [
      ['a', 1],
      ['a', 2],
      ['b', 1],
    ],
  )
  expect(rows(load.GRID, 'col', 'perk', 'owners', 'hits', 'lists').slice(-3)).toEqual([
    ['trait1', 'Kill Clip', '1', '1:5', '5'],
    ['trait1', 'Rampage', '1 2', '1:4 2:4', '4'],
    ['trait1', 'Outlaw', '', '', ''],
  ])
})

test('set bonuses carry their Aegis ranking', () => {
  // The sheet names the set without " Set" and ranks only its 2-piece bonus.
  c.addArmor(db, 'a1', ROLL, { setName: 'Test Set', score: 100 })
  const setHash = db.selectValue("SELECT hash FROM DestinyEquipableItemSetDefinition WHERE name = 'Test Set'")
  db.exec("INSERT INTO DestinySandboxPerkDefinition VALUES (1, 'Two', 'Two pieces.', '/two.png')")
  db.exec("INSERT INTO DestinySandboxPerkDefinition VALUES (2, 'Four', 'Four pieces.', '')")
  db.exec("INSERT INTO aegis_bonus (set_name, pieces, bonus_name, rank, grade) VALUES ('Test', 2, 'Two', 5, 'B')")
  c.addSetPerks(db, setHash as number, [
    [4, 2],
    [2, 1],
  ])
  const bonuses = load.loadSetBonuses(db).get('Test Set')!
  expect(bonuses.map((b) => [b.pieces, b.name, b.icon])).toEqual([
    [2, 'Two', 'https://www.bungie.net/two.png'],
    [4, 'Four', ''],
  ])
  expect([bonuses[0].aegis.grade, bonuses[0].aegis.rank]).toEqual(['B', 5])
  expect(bonuses[1].aegis).toBeNull()
})

test('set pieces by class, grade, slot and score', () => {
  // The Warlock (more pieces) comes first; grade S before A; helmets before
  // gauntlets; a slot's copies best score first. Grade A keeps two per slot:
  // the third helmet is past the cap but rescued, so it stays.
  c.addPreference(db, 'Set S', 'S', 1, ['health', 'melee'])
  c.addPreference(db, 'Set A', 'A', 1)
  for (const [instanceId, setName, slot, score] of [
    ['a1', 'Set A', 'Helmet', 100],
    ['a2', 'Set A', 'Helmet', 90],
    ['a3', 'Set A', 'Helmet', 80],
    ['s3', 'Set S', 'Gauntlets', 95],
    ['s1', 'Set S', 'Helmet', 90],
    ['s2', 'Set S', 'Helmet', 100],
  ] as const) {
    c.addArmor(db, instanceId, { health: score }, { setName, slot, score })
  }
  c.addArmor(db, 't1', ROLL, { setName: 'Set S', armorClass: 'Titan', score: 50 })
  db.exec("INSERT INTO armor_rescue VALUES ('a3', 'health', 'melee', 'grenade', 100)")

  // flagged counts each set's pieces to purge or kept for a build.
  expect(rows(load.SET_PIECES, 'armor_class', 'set_name', 'instance_id', 'flagged')).toEqual([
    ['Warlock', 'Set S', 's2', 0],
    ['Warlock', 'Set S', 's1', 0],
    ['Warlock', 'Set S', 's3', 0],
    ['Warlock', 'Set A', 'a1', 1],
    ['Warlock', 'Set A', 'a2', 1],
    ['Warlock', 'Set A', 'a3', 1],
    ['Titan', 'Set S', 't1', 0],
  ])
  const a3 = db.selectObjects(load.SET_PIECES)[5]
  expect([a3.reason, a3.rescued, a3.builds, a3.purge]).toEqual(['cap_tier', 1, 'health,melee,grenade', 0])
  const totals = db.selectObject(load.TOTALS)!
  expect([totals.armor_to_purge, totals.rescued]).toEqual([0, 1])
})

test('legacy pieces are listed apart', () => {
  // The Tier 4 piece is scored with its set, beside the Tier 5 one.
  c.addArmor(db, 'old', ROLL, { tuning: [], gearTier: null })
  c.addArmor(db, 'low', ROLL, { slot: 'Gauntlets', tuning: [], gearTier: 4, score: 90 })
  c.addArmor(db, 'tuned', ROLL, { score: 100 })
  expect(rows(load.LEGACY, 'instance_id')).toEqual([['old']])
  expect(rows(load.SET_PIECES, 'instance_id', 'gear_tier')).toEqual([
    ['tuned', 5],
    ['low', 4],
  ])
})

test('exotic dupes group under the copy kept', () => {
  // Equal scores: the older copy stays and the other is marked a tie. An
  // exotic with one copy isn't listed.
  c.addArmor(db, 'e1', ROLL, { exotic: true, name: 'Test Exotic', score: 100 })
  c.addArmor(db, 'e2', ROLL, { exotic: true, name: 'TEST EXOTIC', score: 100 })
  c.addArmor(db, 'e3', ROLL, { exotic: true, name: 'Other Exotic', score: 50 })
  expect(rows(load.EXOTIC_DUPES, 'instance_id', 'keeper_id', 'reason', 'tie')).toEqual([
    ['e1', 'e1', null, 0],
    ['e2', 'e1', 'exotic_dupe', 1],
  ])
})

test('builds count the covered and list the short', () => {
  // One piece in each slot, 30 in health, melee and grenade: that build
  // reaches 150 in each; every build with another stat is short.
  for (const slot of ['Helmet', 'Gauntlets', 'Chest Armor', 'Leg Armor', 'Class Armor']) {
    c.addArmor(db, slot, { health: 30, melee: 30, grenade: 30 }, { slot, score: 100 })
  }
  const warlock = db.selectObject(load.CLASSES)!
  expect([warlock.armor_class, warlock.legendary, warlock.covered]).toEqual(['Warlock', 5, 1])
  const short = db.selectObjects(load.SHORT_BUILDS)
  expect(short).toHaveLength(19)
  const lows = short.map((r) => r.low as number)
  expect(lows).toEqual([...lows].sort((a, b) => a - b))
})

test('preferences list sets by grade and exotics by class', () => {
  // The shipped defaults are stored too; only the test's own entries are
  // checked. An exotic the manifest lacks has no class and comes last.
  c.addPreference(db, 'Zeta Set', '', 0, ['health'])
  c.addPreference(db, 'Beta Set', 'A', 2)
  c.addPreference(db, 'Alpha Set', 'A', 1)
  c.addPreference(db, 'Top Set', 'S', 9)
  c.addArmorDef(db, 900, { name: 'Test Exotic Helm', setName: '', tier: 6, armorClass: 'Hunter' })
  for (const name of ['Unknown Exotic', 'test exotic helm']) {
    db.exec("INSERT INTO armor_preference (name, is_exotic, stat_1) VALUES (?, 1, 'melee')", { bind: [name] })
  }
  const ours = new Set(['Zeta Set', 'Beta Set', 'Alpha Set', 'Top Set', 'Unknown Exotic', 'test exotic helm'])
  const sets = rows(load.SET_PREFERENCES, 'name', 'grade')
  expect(sets.filter((r) => ours.has(r[0] as string))).toEqual([
    ['Top Set', 'S'],
    ['Alpha Set', 'A'],
    ['Beta Set', 'A'],
    ['Zeta Set', ''],
  ])
  const exotics = rows(load.EXOTIC_PREFERENCES, 'name', 'armor_class')
  expect(exotics.filter((r) => ours.has(r[0] as string))).toEqual([
    ['test exotic helm', 'Hunter'],
    ['Unknown Exotic', null],
  ])
})

test('preference badges come from the manifest', () => {
  // A set has a badge per class, its helmet's icon (the Hunter's lacks a
  // helmet: its vest); an exotic's is its own, with the first named plug in
  // an intrinsic socket as its perk.
  c.addPreference(db, 'Iconic Set', 'B', 1)
  c.addArmorDef(db, 902, { name: 'Iconic Helm', setName: 'Iconic Set' })
  c.addArmorDef(db, 903, { name: 'Iconic Vest', setName: 'Iconic Set', slot: 'Chest Armor' })
  c.addArmorDef(db, 905, { name: 'Hunter Vest', setName: 'Iconic Set', slot: 'Chest Armor', armorClass: 'Hunter' })
  db.exec(
    'INSERT INTO DestinyInventoryItemDefinition (hash, name, description, plugCategoryIdentifier) ' +
      "VALUES (70901, 'Perky', 'Does it.', 'intrinsics')",
  )
  c.addArmorDef(db, 904, { name: 'Perk Exotic', setName: '', tier: 6, sockets: [null, 70901] })
  for (const icon of [
    ['/helm.png', 902],
    ['/vest.png', 903],
    ['/exotic.png', 904],
    ['/hunter.png', 905],
  ]) {
    db.exec('UPDATE DestinyInventoryItemDefinition SET icon = ? WHERE hash = ?', { bind: icon })
  }
  db.exec("INSERT INTO armor_preference (name, is_exotic, stat_1) VALUES ('Perk Exotic', 1, 'melee')")
  const setHashes = rows(load.SET_PREFERENCES, 'name', 'set_hash')
    .filter((r) => r[0] === 'Iconic Set')
    .map((r) => r[1])
  expect(setHashes).toHaveLength(1)
  const badges = rows(load.SET_BADGES, 'set_hash', 'armor_class', 'icon')
    .filter((r) => r[0] === setHashes[0])
    .map((r) => r.slice(1))
  expect(badges).toEqual([
    ['Hunter', 'https://www.bungie.net/hunter.png'],
    ['Titan', 'https://www.bungie.net/helm.png'],
  ])
  const exotics = rows(load.EXOTIC_PREFERENCES, 'name', 'item_hash', 'icon', 'perk', 'perk_text')
  expect(exotics).toContainEqual(['Perk Exotic', 904, 'https://www.bungie.net/exotic.png', 'Perky', 'Does it.'])
})

test('wishlists list the defaults, then the added', () => {
  const defaults = rows(load.WISHLISTS, 'key')
  db.exec("INSERT INTO wishlist_preference VALUES ('mine', 'Mine', 'u')")
  expect(rows(load.WISHLISTS, 'key')).toEqual([...defaults, ['mine']])
})

test('sources say how each fared', () => {
  db.exec("INSERT INTO wishlist_source (key, label, url) VALUES ('src', 'Src', 'u')")
  for (const status of [
    ['manifest', 'fresh'],
    ['dim', 'skipped'],
    ['wishlist:src', 'stale'],
  ]) {
    db.exec("INSERT INTO source_status (source, status, checked_at) VALUES (?, ?, '2026-10-18')", { bind: status })
  }
  expect(rows(load.SOURCES, 'name', 'ok', 'status')).toEqual([
    ['Bungie manifest', 1, 'Up to date'],
    ['Bungie profile', 0, 'Not checked'],
    ['DIM', 0, 'Skipped'],
    ['Clarity', 0, 'Not checked'],
    ['Src', 0, 'Download failed: the last good copy is used'],
    ['The Aegis', 0, 'Not checked'],
    ['d2-perk-popularity', 0, 'Not checked'],
  ])
})

// Popular and the perk grids.

// Gun is scored on both sides (rank 2 on PvE, 1 on PvP, Endgame on PvE),
// Rifle on PvE only (rank 1, a fixed roll); the vault holds a copy of each
// of Gun's two versions.
function addScoredGuns(): void {
  c.addWeaponDef(db, 100, { name: 'Gun', ammoType: 2 })
  c.addWeaponDef(db, 101, { name: 'Gun (Adept)', ammoType: 2 })
  c.addWeaponDef(db, 200, { name: 'Rifle', ammoType: 1 })
  const columns = [
    c.popularityColumn('barrel', [
      ['Fluted Barrel', 0.6],
      ['Hammer-Forged Rifling', 0.4],
    ]),
    c.popularityColumn('traits', [
      ['Rampage + Outlaw', 0.5],
      ['Kill Clip + Outlaw', 0.3],
    ]),
    c.popularityColumn('trait1', [
      ['Rampage', 0.7],
      ['Kill Clip', 0.3],
    ]),
    c.popularityColumn('trait2', [['Outlaw', 1.0]]),
  ]
  c.addPopularity(db, 'Gun', [100, 101], { rank: 2, hardCopies: 60, columns })
  c.addPopularity(db, 'Gun', [100, 101], { side: 'pvp', rank: 1, columns: columns.slice(0, 2) })
  c.addPopularity(db, 'Rifle', [200], { rank: 1 })
  c.addCopy(db, 'a', 100)
  c.addCopy(db, 'b', 101)
}

test('popularity lists each side in rank order with its looks and vault', () => {
  // Gun's most picked perks are its barrel's, then its traits', by their
  // plugs; both its versions' copies are in the vault.
  addScoredGuns()
  expect(
    rows(load.POPULARITY, 'side', 'name', 'rank', 'ammo', 'slot', 'owned', 'pve_endgame', 'pvp_endgame', 'top_perks'),
  ).toEqual([
    ['pve', 'Rifle', 1, 'primary', 'Kinetic Weapons', 0, 0, 0, ''],
    ['pve', 'Gun', 2, 'special', 'Kinetic Weapons', 2, 1, 0, '2002 1001 1003'],
    ['pvp', 'Gun', 1, 'special', 'Kinetic Weapons', 2, 1, 0, '2002'],
  ])
})

test("the Markdown's columns and pairs follow Popular's order", () => {
  addScoredGuns()
  expect(rows(load.POPULAR_COLUMNS, 'side', 'name', 'col', 'top')).toEqual([
    ['pve', 'Gun', 'barrel', 'Fluted Barrel'],
    ['pve', 'Gun', 'traits', 'Rampage + Outlaw'],
    ['pve', 'Gun', 'trait1', 'Rampage'],
    ['pve', 'Gun', 'trait2', 'Outlaw'],
    ['pvp', 'Gun', 'barrel', 'Fluted Barrel'],
    ['pvp', 'Gun', 'traits', 'Rampage + Outlaw'],
  ])
  expect(rows(load.POPULAR_PAIRS, 'side', 'rank', 'trait1', 'trait2')).toEqual([
    ['pve', 1, 'Rampage', 'Outlaw'],
    ['pve', 2, 'Kill Clip', 'Outlaw'],
    ['pvp', 1, 'Rampage', 'Outlaw'],
    ['pvp', 2, 'Kill Clip', 'Outlaw'],
  ])
})

test("a grid's pairs carry both sides' figures and the copies making them", () => {
  // Each trait by its plug; Gun's grid is named after its lowest version.
  // d (4 on the card) makes Rampage + Outlaw, the top pair, desired on each
  // side, which One (the fourth list) names; Kill Clip + Outlaw, second, is
  // desired too. c's Kill Clip + Subsistence, which players weren't seen
  // with, is undesirable (the pairs have medium confidence), and One trashes
  // it.
  addScoredGuns()
  c.addCopy(db, 'c', 100, [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_B, c.TRAIT_PERK_D])
  c.addCopy(db, 'd', 101, [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A, c.TRAIT_PERK_C])
  addLists(
    [
      [1, 'one', c.TRAIT_PERK_A, c.TRAIT_PERK_C, 0],
      [2, 'one', c.TRAIT_PERK_B, c.TRAIT_PERK_D, 1],
    ],
    [],
  )
  expect(
    rows(
      load.GRID_PAIRS,
      'grid_id',
      'a',
      'b',
      'pve_rank',
      'pve_share',
      'pve_verdict',
      'pvp_rank',
      'pvp_share',
      'pvp_verdict',
      'copies',
      'wanted',
      'trash',
    ),
  ).toEqual([
    [100, 1001, 1003, 1, 0.5, 'g', 1, 0.5, 'g', '4', '4', ''],
    [100, 1002, 1003, 2, 0.3, 'g', 2, 0.3, 'g', '', '', ''],
    [100, 1002, 1004, null, null, 'b', null, null, 'b', '3', '', '4'],
  ])
})

test("Popular's filters offer the scored weapons' types, slots and ammo", () => {
  addScoredGuns()
  expect(rows(load.POPULAR_OPTIONS, 'kind', 'value', 'label')).toEqual([
    ['ammo', 'primary', 'Primary'],
    ['ammo', 'special', 'Special'],
    ['slot', 'Kinetic Weapons', 'Kinetic'],
    ['type', 'Auto Rifle', 'Auto Rifle'],
  ])
})

test("the scores' date is the file's and their source has no link", () => {
  // d2-perk-popularity's repo is private, so it has no link yet.
  c.addPopularityFile(db, [])
  expect(db.selectObject(load.TOTALS)!.scores_at).toBe('2026-10-25T15:23:40Z')
  expect(rows(load.SOURCES, 'name', 'url').at(-1)).toEqual(['d2-perk-popularity', ''])
})
