// Tests for v_weapon_card (schema/views/v_weapon_card.sql): each copy left
// after pruning, with the card it shows on and the card's grid.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test("copies show on their scored weapon's card or their family's", () => {
  // Gun's versions roll two trait pools, so its copies split into two cards.
  // Rifle's versions aren't scored, so their copies share a card named after
  // the family, its grid named after its lowest version. A pruned copy is on
  // no card.
  for (const [itemHash, name] of [
    [100, 'Gun'],
    [101, 'Gun'],
    [200, 'Rifle'],
    [201, 'Rifle (Adept)'],
  ] as const) {
    c.addWeaponDef(db, itemHash, { name })
  }
  c.addPopularity(db, 'Gun (Raid)', [100], { family: 'Gun' })
  c.addPopularity(db, 'Gun (Pantheon)', [101], { family: 'Gun' })
  for (const [instanceId, itemHash] of [
    ['a', 100],
    ['b', 101],
    ['c', 101],
    ['d', 201],
    ['e', 200],
    ['f', 200],
  ] as const) {
    c.addCopy(db, instanceId, itemHash)
  }
  db.exec("INSERT INTO weapon_pruning (instance_id, reason, keeper_id) VALUES ('f', 'exact_duplicate', 'e')")
  const rows = db.selectArrays(
    'SELECT instance_id, card, entry, family, grid_id, k, copies FROM v_weapon_card ORDER BY instance_id',
  )
  expect(rows).toEqual([
    ['a', 'Gun (Raid)', 'Gun (Raid)', 'Gun', 100, 1, 1],
    ['b', 'Gun (Pantheon)', 'Gun (Pantheon)', 'Gun', 101, 1, 2],
    ['c', 'Gun (Pantheon)', 'Gun (Pantheon)', 'Gun', 101, 2, 2],
    ['d', 'Rifle', null, 'Rifle', 200, 1, 2],
    ['e', 'Rifle', null, 'Rifle', 200, 2, 2],
  ])
})

test('an unscored version joins the card its family name shares', () => {
  // Vigil is scored only under its first version: a copy of the other one
  // shares its card and its grid.
  c.addWeaponDef(db, 300, { name: 'Vigil' })
  c.addWeaponDef(db, 301, { name: 'Vigil' })
  c.addPopularity(db, 'Vigil', [300])
  c.addCopy(db, 'x', 300)
  c.addCopy(db, 'y', 301)
  const rows = db.selectArrays(
    'SELECT instance_id, card, entry, grid_id, copies FROM v_weapon_card ORDER BY instance_id',
  )
  expect(rows).toEqual([
    ['x', 'Vigil', 'Vigil', 300, 2],
    ['y', 'Vigil', null, 300, 2],
  ])
})
