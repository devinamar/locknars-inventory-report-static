// Tests for v_popularity_weapon (schema/views/v_popularity_weapon.sql): each
// scored weapon per side, with its pool label, its Endgame bar and its
// weakest column.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test.each([
  [100, 50, 1], // 50 hard copies, half of all: clears both bars
  [100, 49, 0], // a copy short of 50
  [250, 60, 0], // 60 hard copies, but 24% of all
])(
  'the endgame badge needs enough hard copies and share: %i players, %i hard copies',
  (players, hardCopies, endgame) => {
    c.addPopularity(db, 'Gun', [100], { players, hardCopies })
    expect(db.selectArray('SELECT hard_copies, endgame FROM v_popularity_weapon')).toEqual([hardCopies, endgame])
  },
)

test("a split weapon shows its pool and its weakest column's confidence", () => {
  // Gun (Pantheon) is one trait pool of Gun; Fixed is a fixed roll, with no
  // columns to grade.
  c.addPopularity(db, 'Gun (Pantheon)', [301, 300], {
    family: 'Gun',
    rank: 4,
    columns: [
      c.popularityColumn('barrel', [['Smallbore', 0.6]], 120),
      c.popularityColumn('trait1', [['Rampage', 0.7]], 20),
    ],
  })
  c.addPopularity(db, 'Fixed', [400], { rank: 9 })
  expect(
    db.selectArrays(
      'SELECT name, family, pool, grid_id, rank, confidence, weakest, weakest_votes, top ' +
        'FROM v_popularity_weapon ORDER BY rank',
    ),
  ).toEqual([
    ['Gun (Pantheon)', 'Gun', '(Pantheon)', 300, 4, 'low', 'Trait 1', 20, 'Rampage'],
    ['Fixed', 'Fixed', '', 400, 9, null, null, null, null],
  ])
})

test("a weapon's margin is half its widest share range", () => {
  // Rampage's 95% range (40% to 80%) is Gun's widest, so its shares are good
  // to ±20 points; the trait pairs' ranges don't count, and a fixed roll has
  // no shares.
  const pair = c.popularityColumn('traits', [['Rampage + Outlaw', 0.5]])
  Object.assign(pair.perks[0], { low: 0.1, high: 0.9 })
  const trait = c.popularityColumn('trait1', [
    ['Rampage', 0.6],
    ['Kill Clip', 0.3],
  ])
  Object.assign(trait.perks[0], { low: 0.4, high: 0.8 })
  c.addPopularity(db, 'Gun', [100], { rank: 1, columns: [pair, trait] })
  c.addPopularity(db, 'Fixed', [400], { rank: 2 })
  expect(db.selectArrays('SELECT name, round(margin, 4) FROM v_popularity_weapon ORDER BY rank')).toEqual([
    ['Gun', 0.2],
    ['Fixed', null],
  ])
})

test("a thin origin column's range doesn't set the margin", () => {
  // Shotgun's one-copy origin trait ranges from 10% to 90%; its barrel's
  // range, 55% to 65%, sets the margin.
  const barrel = c.popularityColumn('barrel', [['Smallbore', 0.6]], 33)
  const origin = c.popularityColumn('origin', [['Hakke Breach Armaments', 0.5]], 1)
  Object.assign(origin.perks[0], { low: 0.1, high: 0.9 })
  c.addPopularity(db, 'Shotgun', [100], { columns: [barrel, origin] })
  expect(db.selectArray('SELECT round(margin, 4) FROM v_popularity_weapon')).toEqual([0.05])
})
