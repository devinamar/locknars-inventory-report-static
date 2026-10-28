// Tests for the profile (src/profile.ts): reading the response into rows for
// the component tables, and saving them, one current set of rows per copy.
// Copies gone from the profile are deleted, and a copy's own row is updated in
// place, so its DIM tag survives the next snapshot. Ported from
// d2-inventory-report's tests/extract/bungie/test_profile.py and
// test_inventory.py, with tests of the ingest the run calls around them.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { STAT_KEYS } from '../build/db.ts'
import { ingestProfile, profileRows, saveSnapshot } from '../src/profile.ts'
import * as c from './helpers.ts'

const RPM = Number(Object.entries(STAT_KEYS).find(([, key]) => key === 'rpm')![0])

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function item(itemHash: number, instanceId: string, state = 0) {
  return { itemHash, itemInstanceId: instanceId, state }
}

// Reading the response

test('keeps every weapon and armor copy', () => {
  // Whatever their tier; only items that aren't weapons or armor, and stacks
  // without an instance id, are left out.
  c.addWeaponDef(db, 100, { tier: 5 })
  c.addWeaponDef(db, 101, { tier: 4 }) // a rare weapon
  c.addArmorDef(db, 200, { tier: 4 })
  const response = c.makeProfile({
    vault: [
      item(100, 'legendary'),
      item(101, 'rare'),
      item(200, 'armor'),
      item(999, 'not gear'),
      { itemHash: 100 }, // no instance
    ],
  })
  const rows = profileRows(db, response)
  expect(rows.items.map((r) => r[0])).toEqual(['legendary', 'rare', 'armor'])
})

test('copies your characters carry are kept too', () => {
  // The vault, each character's inventory and each character's equipped gear
  // are three lists; a copy left out would be deleted from the database as
  // gone.
  c.addWeaponDef(db, 100)
  const response = c.makeProfile({
    vault: [item(100, 'vault')],
    carried: [item(100, 'carried')],
    equipped: [item(100, 'equipped')],
  })
  const rows = profileRows(db, response)
  expect(rows.items.map((r) => r[0])).toEqual(['vault', 'carried', 'equipped'])
})

test('copies and their instance data', () => {
  // A copy the profile sends no instance data for has no instance row; a
  // damage type the definitions don't have is NULL.
  c.addWeaponDef(db, 100)
  const voidHash = db.selectValue('SELECT hash FROM DestinyDamageTypeDefinition WHERE enumValue = 4')
  const response = c.makeProfile({
    vault: [item(100, 'w1', 5)],
    equipped: [item(100, 'w2'), item(100, 'w3')],
    instances: {
      w1: { primaryStat: { value: 2010 }, gearTier: 4, damageTypeHash: voidHash },
      w2: { damageTypeHash: 0, isEquipped: true },
    },
  })
  const rows = profileRows(db, response)
  // [itemInstanceId, itemHash, state]
  expect(rows.items).toEqual([
    ['w1', 100, 5],
    ['w2', 100, 0],
    ['w3', 100, 0],
  ])
  // [itemInstanceId, isEquipped, primaryStat.value, gearTier, damageTypeHash]
  expect(rows.instances).toEqual([
    ['w1', null, 2010, 4, voidHash],
    ['w2', 1, null, null, null],
  ])
})

test('components are kept as sent, trimmed to the fields read', () => {
  // One row per copy the profile sends a component for. Hashes stay whether
  // or not the definition tables have them, an empty socket is {}, and only
  // the fields the app reads are kept.
  c.addWeaponDef(db, 100)
  const response = c.makeProfile({
    vault: [item(100, 'w1'), item(100, 'w2')],
    sockets: { w1: [c.INTRINSIC_ADAPTIVE, 7777, null] },
    reusable: { w1: { 1: [c.TRAIT_PERK_A, 8888], 5: [c.TRAIT_PERK_B] } },
    stats: { w1: { [RPM]: 140, 9999: 1 } },
  })
  const data = response.itemComponents
  for (const socket of data.sockets.data.w1.sockets) Object.assign(socket, { isEnabled: true, isVisible: true })
  for (const plug of data.reusablePlugs.data.w1.plugs['1']) Object.assign(plug, { canInsert: true, enabled: true })
  const rows = profileRows(db, response)
  expect(rows.sockets.map((r) => r[0])).toEqual(['w1'])
  expect(JSON.parse(rows.sockets[0][1])).toEqual([{ plugHash: c.INTRINSIC_ADAPTIVE }, { plugHash: 7777 }, {}])
  expect(JSON.parse(rows.reusablePlugs[0][1])).toEqual({
    '1': [{ plugItemHash: c.TRAIT_PERK_A }, { plugItemHash: 8888 }],
    '5': [{ plugItemHash: c.TRAIT_PERK_B }],
  })
  expect(JSON.parse(rows.stats[0][1])).toEqual({ [String(RPM)]: 140, '9999': 1 })
})

test("plug objectives keep each plug's objectives as sent", () => {
  // Keyed by plug, each objective's hash and progress; completionValue,
  // complete and visible are left out.
  c.addWeaponDef(db, 100)
  const response = c.makeProfile({
    vault: [item(100, 'w1')],
    objectives: {
      w1: {
        [c.KILL_TRACKER]: [
          [c.ENEMIES_DEFEATED, 46],
          [9999, 1],
        ],
        8888: [[c.ENEMIES_DEFEATED, 3]],
      },
    },
  })
  const rows = profileRows(db, response)
  expect(rows.plugObjectives.map((r) => r[0])).toEqual(['w1'])
  expect(JSON.parse(rows.plugObjectives[0][1])).toEqual({
    [String(c.KILL_TRACKER)]: [
      { objectiveHash: c.ENEMIES_DEFEATED, progress: 46 },
      { objectiveHash: 9999, progress: 1 },
    ],
    '8888': [{ objectiveHash: c.ENEMIES_DEFEATED, progress: 3 }],
  })
})

// Saving the copies

// Save a profile holding copies of weapon 100 and armor piece 400, the way a
// run saves it.
function save(weaponIds: string[] = [], armorIds: string[] = []) {
  const response = c.makeProfile({
    vault: [
      ...weaponIds.map((i) => ({ itemHash: 100, itemInstanceId: i })),
      ...armorIds.map((i) => ({ itemHash: 400, itemInstanceId: i })),
    ],
    sockets: Object.fromEntries(weaponIds.map((i) => [i, c.WEAPON_SOCKETS])),
  })
  saveSnapshot(db, profileRows(db, response))
}

test('copies gone from the profile are deleted', () => {
  // With their rows in the component tables.
  c.addWeaponDef(db, 100)
  c.addArmorDef(db, 400)
  save(['w1', 'w2'], ['a1', 'a2'])
  save(['w2'], ['a1'])
  expect(db.selectValues('SELECT itemInstanceId FROM DestinyItemComponent ORDER BY 1')).toEqual(['a1', 'w2'])
  expect(db.selectValues('SELECT DISTINCT itemInstanceId FROM DestinyItemSocketsComponent')).toEqual(['w2'])
})

test("a copy's DIM tag survives the next snapshot", () => {
  c.addWeaponDef(db, 100)
  save(['w1', 'w2'])
  // The row the CLI's DIM sync (dim.save) writes for w1's tag and notes.
  db.exec("INSERT INTO item_dim (instance_id, tag, notes) VALUES ('w1', 'keep', 'god roll')")
  save(['w1', 'w2'])
  expect(db.selectArrays('SELECT * FROM item_dim')).toEqual([['w1', 'keep', 'god roll']])
})

// The ingest: the rows saved, with the run's checks around them

test('the ingest saves the copies, as the views read them, and records the profile fresh', () => {
  c.addWeaponDef(db, 100)
  ingestProfile(
    db,
    c.makeProfile({
      vault: [item(100, 'w1')],
      sockets: { w1: c.WEAPON_SOCKETS },
      reusable: { w1: { 3: [c.TRAIT_PERK_A, c.TRAIT_PERK_B] } },
      stats: { w1: { [RPM]: 140 } },
    }),
  )
  expect(db.selectValue("SELECT rpm FROM v_weapon WHERE instance_id = 'w1'")).toBe(140)
  expect(db.selectValues("SELECT perk FROM v_weapon_roll WHERE instance_id = 'w1' AND socket_idx = 3")).toEqual([
    'Rampage',
    'Kill Clip',
  ])
  expect(db.selectArrays('SELECT source, status, detail FROM source_status')).toEqual([['profile', 'fresh', '']])
})

test("hashes the definitions don't have don't stop the ingest", () => {
  // Foreign keys are enforced, and the db holds only the current manifest's
  // definitions. An item whose hash isn't a stored weapon or armor piece is
  // left out with its components, as the CLI left out every item that wasn't:
  // one the db lacks, or a stored item that isn't gear, like the Gunsmith
  // Order bounty a character carries. A plug or objective hash is kept as
  // sent; a damage type is NULL.
  c.addWeaponDef(db, 100)
  db.exec(
    'INSERT INTO DestinyInventoryItemDefinition (hash, name, itemType, itemTypeDisplayName) ' +
      "VALUES (1, 'Auto Rifles', 26, 'Gunsmith Order')",
  )
  ingestProfile(
    db,
    c.makeProfile({
      vault: [item(100, 'w1'), item(999, 'unknown')],
      carried: [item(1, 'order')],
      sockets: { w1: [7777, c.INTRINSIC_ADAPTIVE], unknown: [c.INTRINSIC_ADAPTIVE] },
      reusable: { w1: { 0: [7777, 8888] }, unknown: { 0: [8888] } },
      objectives: { w1: { 8888: [[9999, 3]] } },
      instances: { w1: { damageTypeHash: 12345 }, unknown: { damageTypeHash: 12345 }, order: {} },
    }),
  )
  expect(db.selectArrays('SELECT itemInstanceId, itemHash FROM DestinyItemComponent')).toEqual([['w1', 100]])
  expect(db.selectArrays('SELECT * FROM DestinyItemInstanceComponent')).toEqual([['w1', null, null, null, null]])
  expect(db.selectArrays('SELECT * FROM DestinyItemSocketsComponent')).toEqual([
    ['w1', JSON.stringify([{ plugHash: 7777 }, { plugHash: c.INTRINSIC_ADAPTIVE }])],
  ])
  expect(db.selectArrays('SELECT * FROM DestinyItemReusablePlugsComponent')).toEqual([
    ['w1', JSON.stringify({ 0: [{ plugItemHash: 7777 }, { plugItemHash: 8888 }] })],
  ])
  expect(db.selectArrays('SELECT * FROM DestinyItemPlugObjectivesComponent')).toEqual([
    ['w1', JSON.stringify({ 8888: [{ objectiveHash: 9999, progress: 3 }] })],
  ])
})

test('without socket data the ingest throws and saves nothing', () => {
  // As the CLI exited, saving nothing: a profile whose sockets are missing
  // (its login didn't take) would leave every copy without its perks. The
  // missing switchable plugs get the CLI's warning first.
  c.addWeaponDef(db, 100)
  save(['w1'])
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(() => ingestProfile(db, c.makeProfile({ vault: [item(100, 'w2')] }))).toThrow(
    'No socket data in the profile. Check OAuth status.',
  )
  expect(warn).toHaveBeenCalledOnce()
  expect(db.selectValues('SELECT itemInstanceId FROM DestinyItemComponent')).toEqual(['w1'])
  expect(db.selectValue('SELECT count(*) FROM DestinyItemSocketsComponent')).toBe(1)
  expect(db.selectValue("SELECT count(*) FROM source_status WHERE source = 'profile'")).toBe(0)
})
