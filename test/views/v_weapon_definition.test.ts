// Tests for v_weapon_definition (schema/views/v_weapon_definition.sql): each
// weapon definition as the report shows it before any copy.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test('a definition without copies has its family, slot, ammo and frame', () => {
  // The Popular page shows weapons the vault doesn't hold: their slot, ammo
  // badge, default element and starting frame come from the definition.
  c.addWeaponDef(db, 100, { name: 'Gun (Adept)', ammoType: 2 })
  const row = db.selectArray(
    'SELECT item_hash, name, family_name, slot, ammo, ammo_icon, element, archetype FROM v_weapon_definition',
  )
  expect(row).toEqual([
    100,
    'Gun (Adept)',
    'Gun',
    'Kinetic Weapons',
    'special',
    'https://www.bungie.net/img/destiny_content/ammo_types/special.png',
    'Kinetic',
    'Adaptive Frame',
  ])
})
