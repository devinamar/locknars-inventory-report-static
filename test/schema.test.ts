// The schema copied from d2-inventory-report builds on the SQLite the site
// ships (sqlite-wasm), with its default preferences, and every view compiles.
// The views need SQLite 3.44+ (ORDER BY inside group_concat), so a failure
// here usually means a version or syntax gap, not bad data.
import { basename } from 'node:path'
import { expect, test } from 'vitest'
import { createDb, schemaFiles } from '../build/db.ts'
import { openDb } from '../src/db.ts'

test('the schema builds and every view compiles', () => {
  const db = createDb()
  const views = db.selectValues("SELECT name FROM sqlite_master WHERE type = 'view'")
  // Each file in views/ is named after the view it creates.
  for (const f of schemaFiles().filter((f) => f.startsWith('views/'))) {
    expect(views).toContain(basename(f, '.sql'))
  }
  // Preparing a SELECT compiles the view's whole query.
  for (const v of views) db.exec(`SELECT * FROM "${v}" LIMIT 0`)
  db.close()
})

test('the default preferences and wishlist sources load', () => {
  const db = createDb()
  expect(db.selectValue('SELECT count(*) FROM armor_preference WHERE is_exotic = 0')).toBeGreaterThan(0)
  expect(db.selectValue('SELECT count(*) FROM armor_preference WHERE is_exotic = 1')).toBeGreaterThan(0)
  expect(db.selectValues('SELECT key FROM wishlist_preference ORDER BY rowid')).toEqual([
    'voltron',
    'aegis_endgame',
    'aegis_shopping',
  ])
  db.close()
})

test('numbers turn into text as they did in d2-inventory-report', () => {
  const db = openDb()
  expect(db.selectValue('SELECT CAST(2.0 / 3 AS TEXT)')).toBe('0.666666666666667')
  expect(db.selectValue('SELECT group_concat(x) FROM (SELECT 0.0355 AS x UNION ALL SELECT 1.0 / 3)')).toBe(
    '0.0355,0.333333333333333',
  )
  db.close()
})

test('foreign keys are enforced', () => {
  const db = openDb()
  expect(db.selectValue('PRAGMA foreign_keys')).toBe(1)
  db.close()
})
