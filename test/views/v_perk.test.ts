// Tests for v_perk (schema/views/v_perk.sql): one row per weapon perk name,
// with the plug that stands for the name, its icon and its text.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test('a perk name is one row standing on its noted plug', () => {
  // Rampage's enhanced plug shares the name and has Clarity's note, so it
  // stands for the name; Kill Clip has no note, so its lowest hash does, with
  // Bungie's text. The masterwork isn't a perk.
  db.exec(
    'INSERT INTO DestinyInventoryItemDefinition (hash, name, description, icon, plugCategoryIdentifier) ' +
      "VALUES (9002, 'Rampage', 'Enhanced.', '/e.png', 'frames')",
  )
  db.exec("INSERT INTO clarity_note VALUES (9002, 'Stacks three times.')")
  const rows = db.selectArrays(
    'SELECT perk, plug_hash, icon, text FROM v_perk ' +
      "WHERE perk IN ('Rampage', 'Kill Clip', 'Masterwork') ORDER BY perk",
  )
  expect(rows).toEqual([
    ['Kill Clip', 1002, 'https://www.bungie.net/img/killclip.png', 'Reloading after a kill grants bonus damage.'],
    ['Rampage', 9002, 'https://www.bungie.net/e.png', 'Stacks three times.'],
  ])
})
