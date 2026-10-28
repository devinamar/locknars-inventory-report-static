// Tests for loading the stored copies (src/analyze/inventory.ts): which
// weapons the analysis compares, and what each weapon and armor copy carries.
// The round trips save their copies the way a run does: a profile response
// through src/profile.ts. Ported from d2-inventory-report's
// tests/analyze/test_inventory.py.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import { loadArmor, loadBelowLegendary, loadWeapons } from '../../src/analyze/inventory.ts'
import { insertMany } from '../../src/db.ts'
import { profileRows, saveSnapshot } from '../../src/profile.ts'
import * as c from '../helpers.ts'
import { armorStats } from './helpers.ts'

// Intrinsic, barrel, magazine and two traits.
const SOCKETS = [c.INTRINSIC_ADAPTIVE, c.BARREL_PERK_X, c.MAG_PERK_P, c.TRAIT_PERK_A, c.TRAIT_PERK_C]

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

// Save a profile response (makeProfile's parts) the way a run saves it.
function saveProfile(parts: Parameters<typeof c.makeProfile>[0]): void {
  saveSnapshot(db, profileRows(db, c.makeProfile(parts)))
}

test('analysis compares legendary and up and flags lower tiers', () => {
  // Every copy is stored; the analysis loads the Legendary and Exotic ones
  // that have a trait socket, and flags every copy below Legendary.
  c.addWeaponDef(db, 100, { tier: 5 })
  c.addWeaponDef(db, 101, { name: 'Exotic Rifle', tier: 6 })
  c.addWeaponDef(db, 102, { name: 'Rare Rifle', tier: 4 })
  c.addCopy(db, 'legendary', 100, SOCKETS)
  c.addCopy(db, 'no traits', 100, SOCKETS.slice(0, 3))
  c.addCopy(db, 'exotic', 101, SOCKETS)
  c.addCopy(db, 'rare', 102, SOCKETS)
  const weapons = loadWeapons(db)
  expect(weapons.map((w) => w.instanceId)).toEqual(['exotic', 'legendary'])
  expect(loadBelowLegendary(db)).toEqual(['rare'])
})

test('a weapon copy loads with its roll', () => {
  // Each perk socket with its kind and the perks the copy can switch to, in
  // the game's order; a socket it can't switch holds its plugged perk, and
  // an intrinsic it can't switch isn't a perk socket.
  insertMany(db, 'INSERT INTO DestinyInventoryItemDefinition (hash, name, plugCategoryIdentifier) VALUES (?, ?, ?)', [
    [1, 'Arrowhead Brake', 'barrels'],
    [2, 'Smallbore', 'barrels'],
    [3, 'Outlaw', 'frames'],
    [4, 'Rampage', 'frames'],
    [5, 'Kill Clip', 'frames'],
  ])
  c.addWeaponDef(db, 100, { name: 'Fatebringer', sockets: [c.INTRINSIC_ADAPTIVE, 2, 3, 4] })
  saveProfile({
    vault: [{ itemHash: 100, itemInstanceId: 'w1' }],
    sockets: { w1: [c.INTRINSIC_ADAPTIVE, 2, 3, 5] },
    reusable: { w1: { 1: [1, 2], 3: [4, 5] } },
  })
  const [w1, ...rest] = loadWeapons(db)
  expect(rest).toEqual([])
  expect([w1.instanceId, w1.itemHash]).toEqual(['w1', 100])
  expect(w1.roll.map((s) => [s.kind, s.perks])).toEqual([
    ['barrel', ['Arrowhead Brake', 'Smallbore']],
    ['trait', ['Outlaw']],
    ['trait', ['Rampage', 'Kill Clip']],
  ])
})

test('an armor copy loads with its set bonus and stats', () => {
  db.exec("INSERT INTO DestinyEquipableItemSetDefinition (hash, name) VALUES (77, 'Bushido')")
  insertMany(db, 'INSERT INTO DestinySandboxPerkDefinition (hash, name, description) VALUES (?, ?, ?)', [
    [701, 'Two', 'two pieces.'],
    [702, 'Four', 'four pieces.'],
  ])
  c.addSetPerks(db, 77, [
    [2, 701],
    [4, 702],
  ])
  c.addArmorDef(db, 400, { setHash: 77, sockets: [c.ARMOR_STAT_PLUG_A] })
  saveProfile({
    vault: ['a1', 'a2'].map((i) => ({ itemHash: 400, itemInstanceId: i })),
    sockets: { a1: [c.ARMOR_STAT_PLUG_A] },
  })

  const pieces = loadArmor(db)
  expect(pieces).toHaveLength(2)
  const [a1, a2] = pieces
  expect(a1.armor).toEqual(a2.armor)
  expect(a1.armor.setBonus).toEqual({ twoPieceBonus: 'Two: two pieces.', fourPieceBonus: 'Four: four pieces.' })
  expect(a1.stats).toEqual(armorStats(10, 7, 15, 8, 5, 12))
  expect(a2.stats).toEqual(armorStats())
})
