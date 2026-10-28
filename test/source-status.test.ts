// Tests for recording how each outside source fared (src/source-status.ts),
// and for insertMany (src/db.ts), which the sources write their rows with.
import { expect, test } from 'vitest'
import { createDb } from '../build/db.ts'
import { insertMany } from '../src/db.ts'
import { saveSourceStatus } from '../src/source-status.ts'

const VERSION = '{"descriptions": 2.0625}'

test("a source's status is replaced each run", () => {
  // One row per source: its latest status, when it was checked, and its
  // detail.
  const db = createDb()
  saveSourceStatus(db, 'clarity', 'fresh', VERSION)
  saveSourceStatus(db, 'clarity', 'failed', VERSION)
  const rows = db.selectObjects('SELECT * FROM source_status')
  expect(rows.map((r) => [r.source, r.status, r.detail])).toEqual([['clarity', 'failed', VERSION]])
  expect(Date.parse(`${rows[0].checked_at}Z`)).toBeLessThanOrEqual(Date.now())
  db.close()
})

test('insertMany writes every row, or none when one fails', () => {
  const db = createDb()
  insertMany(db, 'INSERT INTO source_status VALUES (?, ?, ?, ?)', [
    ['a', 'fresh', 't', ''],
    ['b', 'fresh', 't', ''],
  ])
  expect(db.selectValue('SELECT count(*) FROM source_status')).toBe(2)
  // The duplicate key rolls back the whole batch, 'c' included.
  expect(() =>
    insertMany(db, 'INSERT INTO source_status VALUES (?, ?, ?, ?)', [
      ['c', 'fresh', 't', ''],
      ['a', 'fresh', 't', ''],
    ]),
  ).toThrow()
  expect(db.selectValues('SELECT source FROM source_status ORDER BY source')).toEqual(['a', 'b'])
  db.close()
})
