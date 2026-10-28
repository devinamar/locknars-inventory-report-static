// Tests for v_popularity_family (schema/views/v_popularity_family.sql): each
// family's effective votes per column, pooled over its scored weapons.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test('votes pool over both sides and every weapon of the family', () => {
  c.addPopularity(db, 'Gun (Raid)', [100], {
    family: 'Gun',
    columns: [c.popularityColumn('barrel', [['Smallbore', 1]], 60)],
  })
  c.addPopularity(db, 'Gun (Raid)', [100], {
    side: 'pvp',
    family: 'Gun',
    columns: [c.popularityColumn('barrel', [['Smallbore', 1]], 15)],
  })
  c.addPopularity(db, 'Gun (Pantheon)', [200], {
    family: 'Gun',
    columns: [
      c.popularityColumn('barrel', [['Full Bore', 1]], 30),
      c.popularityColumn('magazine', [['Tactical Mag', 1]], 30),
    ],
  })
  expect(db.selectArrays('SELECT family, col, votes FROM v_popularity_family ORDER BY col')).toEqual([
    ['Gun', 'barrel', 105],
    ['Gun', 'magazine', 30],
  ])
})
