// The schema copied from d2-inventory-report builds on the SQLite the site
// ships (sqlite-wasm), and every view compiles. The views need SQLite 3.44+
// (ORDER BY inside group_concat), so a failure here usually means a version
// or syntax gap, not bad data.
import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { expect, test } from 'vitest'
import { openDb } from '../src/db'

const SCHEMA = new URL('../schema/', import.meta.url).pathname

// Every .sql file under schema/, in the order d2-inventory-report's
// migrate.create_tables ran them: sorted by path.
const files = readdirSync(SCHEMA, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.sql'))
  .sort()

test('the schema builds and every view compiles', () => {
  const db = openDb()
  for (const f of files) db.exec(readFileSync(join(SCHEMA, f), 'utf8'))

  const views = db.selectValues("SELECT name FROM sqlite_master WHERE type = 'view'")
  // Each file in views/ is named after the view it creates.
  for (const f of files.filter((f) => f.startsWith('views/'))) {
    expect(views).toContain(basename(f, '.sql'))
  }
  // Preparing a SELECT compiles the view's whole query.
  for (const v of views) db.exec(`SELECT * FROM "${v}" LIMIT 0`)
  db.close()
})

test('numbers turn into text as they did in d2-inventory-report', () => {
  const db = openDb()
  expect(db.selectValue('SELECT CAST(2.0 / 3 AS TEXT)')).toBe('0.666666666666667')
  expect(db.selectValue("SELECT group_concat(x) FROM (SELECT 0.0355 AS x UNION ALL SELECT 1.0 / 3)")).toBe(
    '0.0355,0.333333333333333',
  )
  db.close()
})
