// Tests for v_popularity_column (schema/views/v_popularity_column.sql): each
// scored column with its label, confidence, votes and top pick, and each
// weapon's weakest column.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test('columns are labelled as the weapon calls them', () => {
  // A rocket sidearm's barrel is its Tube, from its top perk's plug; the
  // pairs are Trait pairs, and a single trait socket's column is Traits.
  db.exec(
    'INSERT INTO DestinyInventoryItemDefinition (hash, name, plugCategoryIdentifier) ' +
      "VALUES (9001, 'Quick Launch', 'tubes')",
  )
  c.addPopularity(db, 'Sidearm', [100], {
    columns: [
      c.popularityColumn('barrel', [['Quick Launch', 0.6]]),
      c.popularityColumn('traits', [['Rampage + Outlaw', 0.5]]),
      c.popularityColumn('trait1', [['Rampage', 0.7]]),
      c.popularityColumn('trait2', [['Outlaw', 0.6]]),
      c.popularityColumn('origin', [["Vanguard's Vindication", 0.9]]),
    ],
  })
  c.addPopularity(db, 'Bow', [200], { columns: [c.popularityColumn('traits', [['Rampage', 0.7]])] })
  expect(db.selectArrays('SELECT name, col, label FROM v_popularity_column ORDER BY name, col_n')).toEqual([
    ['Bow', 'traits', 'Traits'],
    ['Sidearm', 'barrel', 'Tube'],
    ['Sidearm', 'traits', 'Trait pairs'],
    ['Sidearm', 'trait1', 'Trait 1'],
    ['Sidearm', 'trait2', 'Trait 2'],
    ['Sidearm', 'origin', 'Origin'],
  ])
})

test('the weakest column has the fewest votes and ties go to trait1', () => {
  // Gun's magazine has the fewest votes. Every column of Rifle ties, so its
  // first trait column is the weakest, and same says they tie.
  c.addPopularity(db, 'Gun', [100], {
    columns: [
      c.popularityColumn('barrel', [['Smallbore', 0.6]], 80.4),
      c.popularityColumn('magazine', [['Tactical Mag', 0.4]], 25.2),
      c.popularityColumn('trait1', [['Rampage', 0.7]], 80),
    ],
  })
  c.addPopularity(db, 'Rifle', [200], {
    columns: [
      c.popularityColumn('barrel', [['Smallbore', 0.6]]),
      c.popularityColumn('traits', [['Rampage + Outlaw', 0.5]]),
      c.popularityColumn('trait1', [['Rampage', 0.7]]),
    ],
  })
  expect(
    db.selectArrays(
      'SELECT name, col, confidence, votes, top, top_share, same FROM v_popularity_column ' +
        'WHERE weakest ORDER BY name',
    ),
  ).toEqual([
    ['Gun', 'magazine', 'low', 25, 'Tactical Mag', 0.4, 0],
    ['Rifle', 'trait1', 'medium', 50, 'Rampage', 0.7, 1],
  ])
})

test("a thin origin column isn't the weakest unless it's the only one", () => {
  // Few of Shotgun's copies have its origin trait, as on Belisarius-D: its
  // columns that count tie at medium, so same holds. Relic has only an origin
  // column, which is then its weakest.
  c.addPopularity(db, 'Shotgun', [100], {
    columns: [
      c.popularityColumn('barrel', [['Smallbore', 0.6]], 33),
      c.popularityColumn('trait1', [['Rampage', 0.7]], 33),
      c.popularityColumn('origin', [['Hakke Breach Armaments', 1]], 1),
    ],
  })
  c.addPopularity(db, 'Relic', [200], { columns: [c.popularityColumn('origin', [['Nadir Focus', 1]])] })
  expect(
    db.selectArrays('SELECT name, col, confidence, same FROM v_popularity_column WHERE weakest ORDER BY name'),
  ).toEqual([
    ['Relic', 'origin', 'medium', null],
    ['Shotgun', 'trait1', 'medium', 1],
  ])
})
