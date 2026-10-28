// Tests for v_popularity_version (schema/views/v_popularity_version.sql):
// each scored version with the weapon it counts toward and its grid.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test('each version belongs to its scored weapon once', () => {
  // Both sides list the Pantheon pool's versions, yet each is one row; a grid
  // is named after its weapon's lowest version hash.
  c.addPopularity(db, 'Gun (Pantheon)', [301, 300], { family: 'Gun' })
  c.addPopularity(db, 'Gun (Pantheon)', [301, 300], { side: 'pvp', family: 'Gun' })
  c.addPopularity(db, 'Gun (Raid)', [200], { family: 'Gun' })
  expect(
    db.selectArrays('SELECT item_hash, name, family, grid_id FROM v_popularity_version ORDER BY item_hash'),
  ).toEqual([
    [200, 'Gun (Raid)', 'Gun', 200],
    [300, 'Gun (Pantheon)', 'Gun', 300],
    [301, 'Gun (Pantheon)', 'Gun', 300],
  ])
})
