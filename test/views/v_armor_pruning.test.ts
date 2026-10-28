// Tests for v_armor_pruning (schema/views/v_armor_pruning.sql): the armor
// pieces to dismantle, why, and the copy kept in their place, worked out from
// copies written with addArmor and their saved scores.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

const ROLL = { health: 30, melee: 25, grenade: 20 }

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

// {instance_id: [reason, keeper_id]} from v_armor_pruning.
function pruned() {
  return Object.fromEntries(
    db.selectObjects('SELECT * FROM v_armor_pruning').map((r) => [r.instance_id, [r.reason, r.keeper_id]]),
  )
}

test('legacy pieces go on their own and lower tiers compete', () => {
  // Grade F keeps one copy per slot: the Tier 4 piece outscores the Tier 5
  // one, which is past the cap. The legacy piece is flagged on its own.
  c.addPreference(db, 'Test Set', 'F')
  c.addArmor(db, 'old', ROLL, { tuning: [], gearTier: null })
  c.addArmor(db, 'low', ROLL, { setName: 'Test Set', tuning: [], gearTier: 4, score: 110 })
  c.addArmor(db, 'tuned', ROLL, { setName: 'Test Set', score: 100 })
  c.addArmor(db, 'exotic', ROLL, { tuning: [], exotic: true, name: 'Test Exotic', score: 100 })
  expect(pruned()).toEqual({ old: ['legacy', null], tuned: ['cap_tier', 'low'] })
})

test('an exact duplicate loses to the older copy', () => {
  // Same stats and tuning; a copy that tunes another stat is a roll of its own.
  c.addPreference(db, 'Test Set', 'S')
  c.addArmor(db, 'a1', ROLL, { setName: 'Test Set', score: 100 })
  c.addArmor(db, 'a2', ROLL, { setName: 'Test Set', score: 100 })
  c.addArmor(db, 'a3', ROLL, { setName: 'Test Set', tuning: ['melee'], score: 100 })
  expect(pruned()).toEqual({ a2: ['equal_same_set', 'a1'] })
})

test('each grade keeps its cap', () => {
  // One copy more than the cap, scores falling: only the last goes, losing to
  // the first. A set without a grade is Unclassified.
  const expected: Record<string, string[]> = {}
  for (const [code, cap] of db.selectArrays('SELECT grade, slot_cap FROM armor_grade') as [string, number][]) {
    const setName = `Grade ${code || 'none'}`
    if (code) c.addPreference(db, setName, code)
    for (let i = 0; i <= cap; i++) {
      c.addArmor(db, `${setName} ${i}`, { health: 30 - i }, { setName, score: 100 - i })
    }
    expected[`${setName} ${cap}`] = ['cap_tier', `${setName} 0`]
  }
  expect(pruned()).toEqual(expected)
})

test('caps count per class and slot', () => {
  c.addPreference(db, 'Test Set', 'F')
  for (const [instanceId, slot, armorClass, score] of [
    ['w1', 'Helmet', 'Warlock', 90],
    ['w2', 'Helmet', 'Warlock', 80],
    ['t1', 'Helmet', 'Titan', 70],
    ['g1', 'Gauntlets', 'Warlock', 60],
  ] as const) {
    c.addArmor(db, instanceId, { health: score }, { setName: 'Test Set', slot, armorClass, score })
  }
  expect(pruned()).toEqual({ w2: ['cap_tier', 'w1'] })
})

test('equal scores keep the lower id', () => {
  c.addPreference(db, 'Test Set', 'F')
  c.addArmor(db, 'b', { health: 30 }, { setName: 'Test Set', score: 100 })
  c.addArmor(db, 'a', { melee: 30 }, { setName: 'Test Set', score: 100 })
  expect(pruned()).toEqual({ b: ['cap_tier', 'a'] })
})

test('exotic versions compete by name', () => {
  // A reissue may spell the name differently; another class's copy is an
  // exotic of its own.
  c.addArmor(db, 'old', ROLL, { exotic: true, name: 'Test Exotic', score: 100 })
  c.addArmor(db, 'new', ROLL, { exotic: true, name: 'Test EXOTIC', score: 120 })
  c.addArmor(db, 'titan', ROLL, { exotic: true, name: 'Test Exotic', armorClass: 'Titan', score: 90 })
  expect(pruned()).toEqual({ old: ['exotic_dupe', 'new'] })
})

test('an untiered exotic is not legacy', () => {
  // An exotic from before Armor 3.0 competes with its other copies instead,
  // and stays when it scores best.
  c.addArmor(db, 'old', ROLL, { exotic: true, name: 'Test Exotic', tuning: [], gearTier: null, score: 110 })
  c.addArmor(db, 'new', ROLL, { exotic: true, name: 'Test Exotic', score: 100 })
  expect(pruned()).toEqual({ new: ['exotic_dupe', 'old'] })
})

test('exotic class items keep one copy per perk pair', () => {
  for (const [instanceId, perks, score] of [
    ['c1', ['Spirit A', 'Spirit B'], 100],
    ['c2', ['Spirit B', 'Spirit A'], 90],
    ['c3', ['Spirit A', 'Spirit C'], 80],
  ] as [string, string[], number][]) {
    c.addArmor(db, instanceId, ROLL, { exotic: true, name: 'Test Bond', slot: 'Class Armor', perks, score })
  }
  expect(pruned()).toEqual({ c2: ['exotic_dupe', 'c1'] })
})

test('a rescued piece is marked', () => {
  c.addPreference(db, 'Test Set', 'F')
  c.addArmor(db, 'kept', { health: 30 }, { setName: 'Test Set', score: 100 })
  c.addArmor(db, 'capped', { melee: 30 }, { setName: 'Test Set', score: 90 })
  db.exec("INSERT INTO armor_rescue VALUES ('capped', 'health', 'melee', 'grenade', 99)")
  expect(db.selectArrays('SELECT instance_id, rescued FROM v_armor_pruning')).toEqual([['capped', 1]])
})
