// Tests for v_popularity_perk (schema/views/v_popularity_perk.sql): each
// scored perk outside the trait pairs, with its rank and its share against
// its column's top.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test("perks rank by share against their column's top", () => {
  // The pairs (traits) aren't perks of a column; col_n keeps the published
  // order, which is socket order.
  c.addPopularity(db, 'Gun', [100], {
    columns: [
      c.popularityColumn('barrel', [
        ['Smallbore', 0.5],
        ['Full Bore', 0.25],
      ]),
      c.popularityColumn('traits', [['Rampage + Outlaw', 0.6]]),
      c.popularityColumn('trait1', [
        ['Rampage', 0.8],
        ['Kill Clip', 0.2],
      ]),
    ],
  })
  expect(
    db.selectArrays('SELECT col, col_n, perk, share, rank, round(rel, 4) FROM v_popularity_perk ORDER BY col_n, rank'),
  ).toEqual([
    ['barrel', 0, 'Smallbore', 0.5, 1, 1],
    ['barrel', 0, 'Full Bore', 0.25, 2, 0.5],
    ['trait1', 2, 'Rampage', 0.8, 1, 1],
    ['trait1', 2, 'Kill Clip', 0.2, 2, 0.25],
  ])
})
