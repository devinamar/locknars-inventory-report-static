// Tests for v_armor_reach (schema/views/v_armor_reach.sql): how far each
// class's kept Legendary armor takes each three-stat build, over copies
// written with addArmor and their saved scores.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

const ROLL = { health: 30, melee: 25, grenade: 20 }

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

// The health, melee and grenade build's pieces: [slot, instance_id, its three
// values, the build's three totals].
function reach() {
  return db.selectArrays(
    'SELECT slot, instance_id, value_1, value_2, value_3, total_1, total_2, total_3 ' +
      "FROM v_armor_reach WHERE stat_1 = 'health' AND stat_2 = 'melee' AND stat_3 = 'grenade' ORDER BY slot",
  )
}

test('reach takes the best kept piece in each slot', () => {
  // A capped piece counts only once it's rescued.
  c.addPreference(db, 'Test Set', 'F')
  c.addArmor(db, 'helm', ROLL, { setName: 'Test Set', score: 100 })
  c.addArmor(db, 'capped', { health: 30, melee: 30, grenade: 30 }, { setName: 'Test Set', score: 90 })
  const arms = { health: 20, melee: 20, grenade: 20 }
  c.addArmor(db, 'arms', arms, { setName: 'Test Set', slot: 'Gauntlets', score: 100 })
  expect(reach()).toEqual([
    ['Gauntlets', 'arms', 20, 20, 20, 50, 45, 40],
    ['Helmet', 'helm', 30, 25, 20, 50, 45, 40],
  ])
  db.exec("INSERT INTO armor_rescue VALUES ('capped', 'health', 'melee', 'grenade', 50)")
  expect(reach()[1]).toEqual(['Helmet', 'capped', 30, 30, 30, 50, 50, 50])
})

test("exotics never count toward a build's reach", () => {
  // The exotic helmet rolls better, but only Legendary pieces count.
  c.addPreference(db, 'Test Set', 'F')
  c.addArmor(db, 'helm', ROLL, { setName: 'Test Set', score: 100 })
  c.addArmor(db, 'exotic', { health: 30, melee: 30, grenade: 30 }, { exotic: true, name: 'Test Exotic', score: 100 })
  expect(reach()).toEqual([['Helmet', 'helm', 30, 25, 20, 30, 25, 20]])
})
