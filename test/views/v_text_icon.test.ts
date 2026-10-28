// Tests for v_text_icon (schema/views/v_text_icon.sql): the icon for each
// inline token in Bungie's text that names a damage type, a champion breaker
// type or an ability stat.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test('tokens with an icon get its URL', () => {
  // A button prompt such as [Light Attack] has none, and neither does a
  // damage type without an icon.
  db.exec("UPDATE DestinyDamageTypeDefinition SET icon = '/arc.png' WHERE name = 'Arc'")
  db.exec("INSERT INTO DestinyBreakerTypeDefinition VALUES (1, 'Shield Piercing', '/sp.png')")
  db.exec("UPDATE DestinyStatDefinition SET name = 'Grenade' WHERE name = 'grenade'")
  const icons = Object.fromEntries(db.selectArrays('SELECT token, icon FROM v_text_icon'))
  expect(icons['[Arc]']).toBe('https://www.bungie.net/arc.png')
  expect(icons['[Shield-Piercing]']).toBe('https://www.bungie.net/sp.png')
  expect(icons['[Grenade]']).toBe('https://www.bungie.net/img/grenade.png')
  expect(Object.keys(icons)).not.toContain('[Light Attack]')
  expect(Object.keys(icons)).not.toContain('[Void]')
})
