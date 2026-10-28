// Tests for v_plug (schema/views/v_plug.sql): each stored plug as the app shows
// it, the kind of weapon perk socket its category fills, and what the weapon
// calls that socket.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test('plug text as written and its icon as a url', () => {
  // Bungie's inline tokens stay in the text.
  const text = '[Light Attack]  : [Stagger] Powered [Arc] melee\n\nheal you.'
  db.exec(
    'INSERT INTO DestinyInventoryItemDefinition (hash, name, description, icon, plugCategoryIdentifier) ' +
      'VALUES (?, ?, ?, ?, ?)',
    { bind: [9001, 'Test', text, '/t.png', 'frames'] },
  )
  const row = db.selectArray('SELECT icon, description FROM v_plug WHERE hash = 9001')
  expect(row).toEqual(['https://www.bungie.net/t.png', text])
})

test.each([
  // The first perk column, under each name a weapon type gives it.
  ['barrels', 'barrel', 'Barrel'],
  ['scopes', 'barrel', 'Scope'],
  ['tubes', 'barrel', 'Tube'],
  ['bowstrings', 'barrel', 'String'],
  ['blades', 'barrel', 'Blade'],
  ['hafts', 'barrel', 'Haft'],
  // The second perk column, likewise.
  ['magazines', 'magazine', 'Magazine'],
  ['batteries', 'magazine', 'Battery'],
  ['arrows', 'magazine', 'Arrow'],
  ['guards', 'magazine', 'Guard'],
  ['magazines_gl', 'magazine', 'Magazine'],
  ['stocks', 'stock', 'Stock'],
  ['grips', 'grip', 'Grip'],
  ['frames', 'trait', 'Trait'],
  ['origins', 'origin', 'Origin'],
  ['intrinsics', 'intrinsic', 'Frame'],
  // Plugs that aren't weapon perks.
  ['v400.plugs.weapons.masterworks.trackers', null, null],
  ['shader', null, null],
])('plug kind and label come from its category: %s', (category, kind, label) => {
  db.exec("INSERT INTO DestinyInventoryItemDefinition (hash, name, plugCategoryIdentifier) VALUES (9101, 'Plug', ?)", {
    bind: [category],
  })
  const row = db.selectArray('SELECT kind, label FROM v_plug WHERE hash = 9101')
  expect(row).toEqual([kind, label])
})
