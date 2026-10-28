// Tests for v_popularity_pair (schema/views/v_popularity_pair.sql): each
// scored trait pair split into its traits, with its rank and its share
// against the top pair.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test('pairs split into their traits with their share against the top', () => {
  // A weapon with one trait socket scores single traits there, which aren't
  // pairs.
  c.addPopularity(db, 'Gun', [100], {
    columns: [
      c.popularityColumn('traits', [
        ['Rampage + Outlaw', 0.5],
        ['Rampage + Firefly', 0.3],
        ['Kill Clip + Outlaw', 0.2],
      ]),
    ],
  })
  c.addPopularity(db, 'Sidearm', [200], { columns: [c.popularityColumn('traits', [['Rampage', 1]])] })
  expect(
    db.selectArrays('SELECT name, trait1, trait2, rank, share, round(rel, 4) FROM v_popularity_pair ORDER BY rank'),
  ).toEqual([
    ['Gun', 'Rampage', 'Outlaw', 1, 0.5, 1],
    ['Gun', 'Rampage', 'Firefly', 2, 0.3, 0.6],
    ['Gun', 'Kill Clip', 'Outlaw', 3, 0.2, 0.4],
  ])
})

test('pairs the file rounds to nothing have a rel of 0', () => {
  // Every pair rounds to 0, so there is no top share to compare against.
  c.addPopularity(db, 'Gun', [100], {
    columns: [
      c.popularityColumn('traits', [
        ['Rampage + Outlaw', 0],
        ['Kill Clip + Outlaw', 0],
      ]),
    ],
  })
  expect(db.selectArrays('SELECT rel FROM v_popularity_pair')).toEqual([[0], [0]])
})
