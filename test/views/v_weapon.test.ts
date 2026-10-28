// Tests for v_weapon (schema/views/v_weapon.sql): every weapon copy with its
// definition, family, slot, element, archetype, season and icons, read from
// rows written the way the ingest and the profile extract write them.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import { STAT_KEYS } from '../../build/db.ts'
import * as c from '../helpers.ts'

const SOCKETS = c.WEAPON_SOCKETS
const RPM = Number(Object.entries(STAT_KEYS).find(([, key]) => key === 'rpm')![0])

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

function weapon(instanceId: string) {
  return db.selectObject('SELECT * FROM v_weapon WHERE instance_id = ?', [instanceId])!
}

function season(instanceId: string) {
  const w = weapon(instanceId)
  return [w.season_num, w.season_name, w.season_date]
}

test('weapon lists every copy with its tier', () => {
  // Copies without a trait socket and lower tiers are listed too; the
  // analysis decides which to compare.
  c.addWeaponDef(db, 100)
  c.addWeaponDef(db, 101, { tier: 4 })
  c.addCopy(db, 'traits', 100, SOCKETS)
  c.addCopy(db, 'none', 100, SOCKETS.slice(0, 3))
  c.addCopy(db, 'rare', 101, SOCKETS)
  expect(db.selectArrays('SELECT instance_id, tier FROM v_weapon ORDER BY instance_id')).toEqual([
    ['none', 5],
    ['rare', 4],
    ['traits', 5],
  ])
})

test.each([
  ['Abyssal Edge (Adept)', 'Abyssal Edge'],
  ['Fatebringer (Timelost)', 'Fatebringer'],
  ["Zaouli's Bane (Harrowed)", "Zaouli's Bane"],
  ['Fatebringer', 'Fatebringer'],
])('family drops an edition suffix: %s', (name, family) => {
  // So the special editions group with the base weapon.
  c.addWeaponDef(db, 100, { name })
  c.addCopy(db, 'w1', 100, SOCKETS)
  expect(weapon('w1').family_name).toBe(family)
})

test("slot is its bucket's name and tier 6 is exotic", () => {
  c.addWeaponDef(db, 100, { name: 'The Messenger', tier: 6 })
  c.addCopy(db, 'w1', 100, SOCKETS)
  const w1 = weapon('w1')
  expect([w1.slot, w1.slot_order, w1.is_exotic]).toEqual(['Kinetic Weapons', 20, 1])
})

test("element is the copy's, else the weapon's default", () => {
  c.addWeaponDef(db, 100, { damageType: 1 })
  c.addCopy(db, 'void', 100, SOCKETS, { damageType: 4 })
  c.addCopy(db, 'default', 100, SOCKETS)
  expect(weapon('void').element).toBe('Void')
  expect(weapon('default').element).toBe('Kinetic')
})

test("weapon type icon is its Gunsmith order's", () => {
  // The order is named after the type, plural; a Combat Bow's is Bows. A type
  // without an order has no icon.
  for (const [hash, name, icon] of [
    [1, 'Auto Rifles', '/ar.png'],
    [2, 'Bows', '/bow.png'],
  ]) {
    db.exec(
      'INSERT INTO DestinyInventoryItemDefinition (hash, name, itemTypeDisplayName, icon) ' +
        "VALUES (?, ?, 'Gunsmith Order', ?)",
      { bind: [hash, name, icon] },
    )
  }
  c.addWeaponDef(db, 100)
  c.addWeaponDef(db, 101, { itemTypeDisplayName: 'Combat Bow' })
  c.addWeaponDef(db, 102, { itemTypeDisplayName: 'Glaive' })
  for (const [instanceId, itemHash] of [
    ['ar', 100],
    ['bow', 101],
    ['glaive', 102],
  ] as const) {
    c.addCopy(db, instanceId, itemHash, SOCKETS)
  }
  const icons = Object.fromEntries(['ar', 'bow', 'glaive'].map((i) => [i, weapon(i).wtype_icon]))
  expect(icons).toEqual({
    ar: 'https://www.bungie.net/ar.png',
    bow: 'https://www.bungie.net/bow.png',
    glaive: '',
  })
})

test("archetype is the copy's intrinsic, else the starting one", () => {
  c.addWeaponDef(db, 100)
  c.addCopy(db, 'own', 100, [c.INTRINSIC_AGGRESSIVE, ...SOCKETS.slice(1)])
  c.addCopy(db, 'empty', 100, [null, ...SOCKETS.slice(1)])
  const own = weapon('own')
  const empty = weapon('empty')
  expect([own.archetype, own.archetype_icon]).toEqual([
    'Aggressive Frame',
    'https://www.bungie.net/img/aggressive.png',
  ])
  expect(empty.archetype).toBe('Adaptive Frame')
})

test('rpm and lock state', () => {
  // State 1 is Bungie's Locked flag (4 is Masterwork).
  c.addWeaponDef(db, 100)
  c.addCopy(db, 'w1', 100, SOCKETS, { stats: { [RPM]: 140 }, state: 1 | 4 })
  c.addCopy(db, 'w2', 100, SOCKETS, { state: 4 })
  const w1 = weapon('w1')
  const w2 = weapon('w2')
  expect([w1.rpm, w1.is_locked]).toEqual([140, 1])
  expect([w2.rpm, w2.is_locked]).toEqual([0, 0])
})

test('source is where its collection entry says it drops', () => {
  // Bungie's "Random Perks" line, the source of 91 of the live vault's
  // copies, names no place, so it's left out.
  db.exec('INSERT INTO DestinyCollectibleDefinition VALUES (?, ?), (?, ?)', {
    bind: [1, 'Commander Zavala', 2, 'Random Perks: This item cannot be reacquired from Collections.'],
  })
  c.addWeaponDef(db, 100, { collectibleHash: 1 })
  c.addWeaponDef(db, 101, { collectibleHash: 2 })
  c.addCopy(db, 'w1', 100, SOCKETS)
  c.addCopy(db, 'w2', 101, SOCKETS)
  expect([weapon('w1').source, weapon('w2').source]).toEqual(['Commander Zavala', ''])
})

test("ammo is the weapon's ammo type with its badge", () => {
  // Luna's Howl is primary, Ergo Sum special (not heavy, though a sword).
  c.addWeaponDef(db, 100, { ammoType: 1 })
  c.addWeaponDef(db, 101, { ammoType: 2 })
  c.addWeaponDef(db, 102)
  for (const [instanceId, itemHash] of [
    ['primary', 100],
    ['special', 101],
    ['unknown', 102],
  ] as const) {
    c.addCopy(db, instanceId, itemHash, SOCKETS)
  }
  const badges = 'https://www.bungie.net/img/destiny_content/ammo_types/'
  expect(['primary', 'special', 'unknown'].map((i) => [weapon(i).ammo, weapon(i).ammo_icon])).toEqual([
    ['primary', badges + 'primary.png'],
    ['special', badges + 'special.png'],
    ['', ''],
  ])
})

test('season takes a season trait, then annual, then any', () => {
  c.addWeaponDef(db, 100, { traitIds: '["releases.v400.annual", "releases.v710.season"]' })
  c.addWeaponDef(db, 101, { traitIds: '["releases.v100", "releases.v400.annual"]' })
  c.addWeaponDef(db, 102, { traitIds: '["item.weapon.exotic", "releases.v100"]' })
  for (const [iid, itemHash] of [
    ['season', 100],
    ['annual', 101],
    ['any', 102],
  ] as const) {
    c.addCopy(db, iid, itemHash, SOCKETS)
  }
  expect(season('season')).toEqual([21, 'Season of the Deep', '2023-05-23'])
  expect(season('annual')).toEqual([4, 'Forsaken', '2018-09-04'])
  expect(season('any')).toEqual([1, 'Red War', '2017-09-06'])
})

test('a weapon whose traits name no known release has no season', () => {
  // In today's manifest, only BrayTech RWP Mk. II; its icon still carries its
  // watermark, the Warmind badge.
  const icon = '/common/destiny2_content/icons/da5f961ef97b78293cc498978c10e178.png'
  c.addWeaponDef(db, 100, { traitIds: '["item.weapon.scout_rifle"]', iconWatermark: icon })
  c.addCopy(db, 'w1', 100, SOCKETS)
  expect(season('w1')).toEqual([0, '', ''])
  expect(weapon('w1').watermark).toBe(`https://www.bungie.net${icon}`)
})
