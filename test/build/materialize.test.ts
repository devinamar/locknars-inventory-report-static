// Tests for storing the views no player's data reaches as tables
// (materializeSharedViews in build/db.ts), which the data build does so the
// browser reads them instead of working them out.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import { materializeSharedViews } from '../../build/db.ts'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  c.addWeaponDef(db, 100, { name: 'Gun', sockets: c.WEAPON_SOCKETS })
  c.addPopularity(db, 'Gun', [100], { hardCopies: 30, columns: [c.popularityColumn('barrel', [['Fluted Barrel', 1]])] })
  c.addCopy(db, 'w1', 100, c.WEAPON_SOCKETS)
  return () => db.close()
})

// Each relation's rows as SQLite quotes their values (1.0 stays apart from 1),
// sorted: what a view gives and what its stored table gives must match.
function quoted(name: string): string[] {
  const columns = db.selectValues(`SELECT name FROM pragma_table_info('${name}')`) as string[]
  const row = columns.map((col) => `quote("${col}")`).join(" || '|' || ")
  return (db.selectValues(`SELECT ${row} FROM "${name}"`) as string[]).sort()
}

function kind(name: string) {
  return db.selectValue('SELECT type FROM sqlite_master WHERE name = ?', [name])
}

test("the views no player's data reaches become tables of the same rows", () => {
  const before = Object.fromEntries(['v_popularity_weapon', 'v_weapon_pool', 'v_plug'].map((v) => [v, quoted(v)]))
  expect(before.v_popularity_weapon.length).toBe(1)
  const stored = materializeSharedViews(db)
  for (const [view, rows] of Object.entries(before)) {
    expect(stored).toContain(view)
    expect(kind(view)).toBe('table')
    expect(quoted(view)).toEqual(rows)
  }
  // A view a stored one reads is stored first.
  expect(stored.indexOf('v_popularity_version')).toBeLessThan(stored.indexOf('v_popularity_weapon'))
})

test("the views over a player's data stay views and still work", () => {
  // v_wishlist_perk reads wishlist_preference, which a player's own lists
  // change; v_weapon_grid reads the copies.
  const before = Object.fromEntries(['v_weapon', 'v_weapon_grid', 'v_copy_perk'].map((v) => [v, quoted(v)]))
  const stored = materializeSharedViews(db)
  for (const view of ['v_weapon', 'v_weapon_grid', 'v_copy_perk', 'v_wishlist_perk', 'v_armor']) {
    expect(stored).not.toContain(view)
    expect(kind(view)).toBe('view')
  }
  for (const [view, rows] of Object.entries(before)) expect(quoted(view)).toEqual(rows)
})
