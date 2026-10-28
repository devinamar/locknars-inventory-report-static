// Tests for v_wishlist_perk (schema/views/v_wishlist_perk.sql): each wishlist
// roll's perks by name, with its list's place.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test("a roll's perks are named with its list's place", () => {
  // Aegis Endgame is the second default list. A roll naming no perks (any
  // roll of the weapon) has no rows; a trash roll keeps its flag.
  db.exec("INSERT INTO wishlist_source (key, label, url) VALUES ('aegis_endgame', 'Aegis', '')")
  for (const roll of [
    [1, c.BARREL_PERK_X, c.TRAIT_PERK_A, 0],
    [2, null, null, 0],
    [3, c.TRAIT_PERK_B, null, 1],
  ]) {
    db.exec(
      'INSERT INTO wishlist_roll (roll_id, source_key, item_hash, perk1, perk2, is_trash) ' +
        "VALUES (?, 'aegis_endgame', 100, ?, ?, ?)",
      { bind: roll },
    )
  }
  const rows = db.selectArrays(
    'SELECT roll_id, source_key, place, item_hash, is_trash, perk FROM v_wishlist_perk ORDER BY roll_id, perk',
  )
  expect(rows).toEqual([
    [1, 'aegis_endgame', 2, 100, 0, 'Hammer-Forged Rifling'],
    [1, 'aegis_endgame', 2, 100, 0, 'Rampage'],
    [3, 'aegis_endgame', 2, 100, 1, 'Kill Clip'],
  ])
})
