// Tests for finding exact weapon duplicates (src/analyze/weapon-pruning.ts):
// copies of one family whose element, archetype and every perk socket match.
// The copy kept has the highest gear tier, then the best wishlist score, then
// the lowest itemInstanceId. Ported from d2-inventory-report's
// tests/analyze/test_weapon_pruning.py.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import { findExactDuplicates } from '../../src/analyze/weapon-pruning.ts'
import * as c from '../helpers.ts'

// Intrinsic, barrel, magazine and two traits.
const ROLL = [c.INTRINSIC_ADAPTIVE, c.BARREL_PERK_X, c.MAG_PERK_P, c.TRAIT_PERK_A, c.TRAIT_PERK_C]

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

type Scored = { itemHash?: number; roll?: number[]; score?: number; gearTier?: number | null; element?: number }

// A copy with its weapon_result row, as scoring saves it.
function scoredCopy(instanceId: string, copy: Scored = {}): void {
  const { itemHash = 100, roll = ROLL, score = 0, gearTier = null, element = 2 } = copy
  c.addCopy(db, instanceId, itemHash, roll, { damageType: element, gearTier })
  db.exec('INSERT INTO weapon_result VALUES (?, ?, 1)', { bind: [instanceId, score] })
}

test('matching copies keep the oldest', () => {
  c.addWeaponDef(db, 100)
  for (const instanceId of ['w1', 'w2', 'w3']) scoredCopy(instanceId)
  expect(findExactDuplicates(db)).toEqual([
    ['w2', 'w1'],
    ['w3', 'w1'],
  ])
})

test('gear tier then score pick the keeper', () => {
  // Tier beats score and age; at equal tier the better score wins.
  c.addWeaponDef(db, 100)
  scoredCopy('old', { score: 5 })
  scoredCopy('tiered', { gearTier: 3 })
  scoredCopy('tiered_scored', { gearTier: 3, score: 2 })
  expect(findExactDuplicates(db)).toEqual([
    ['old', 'tiered_scored'],
    ['tiered', 'tiered_scored'],
  ])
})

test('copies differing in one perk are kept', () => {
  c.addWeaponDef(db, 100)
  scoredCopy('w1')
  scoredCopy('w2', { roll: [c.INTRINSIC_ADAPTIVE, c.BARREL_PERK_Y, ...ROLL.slice(2)] })
  expect(findExactDuplicates(db)).toEqual([])
})

test('element and archetype must match', () => {
  c.addWeaponDef(db, 100)
  scoredCopy('arc')
  scoredCopy('void', { element: 4 })
  scoredCopy('aggressive', { roll: [c.INTRINSIC_AGGRESSIVE, ...ROLL.slice(1)] })
  expect(findExactDuplicates(db)).toEqual([])
})

test('editions of one family are compared', () => {
  c.addWeaponDef(db, 100, { name: 'Fatebringer' })
  c.addWeaponDef(db, 200, { name: 'Fatebringer (Timelost)' })
  scoredCopy('base', { itemHash: 100 })
  scoredCopy('timelost', { itemHash: 200 })
  expect(findExactDuplicates(db)).toEqual([['timelost', 'base']])
})

test('unscored copies are left out', () => {
  // Only copies the analysis scored (weapon_result) are compared.
  c.addWeaponDef(db, 100)
  scoredCopy('w1')
  c.addCopy(db, 'w2', 100, ROLL, { damageType: 2 })
  expect(findExactDuplicates(db)).toEqual([])
})
