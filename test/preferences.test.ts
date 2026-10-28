// Tests for the player's armor preferences outside their storage
// (src/preferences.ts): written over the shared database's defaults before a
// build's analysis and read back after it. Picking a stat and reading a
// backup file are the Preferences tab's, tested with it
// (preferences-tab.test.ts).
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import { applyPreferences, preferenceRows, toPrefs, toRows } from '../src/preferences.ts'
import { type PreferenceRow } from '../src/saved.ts'
import { testDb } from './helpers.ts'

let db: Database
beforeEach(() => {
  // The schema with the default preferences and wishlists the data build adds.
  db = testDb()
  return () => db.close()
})

// A preference row: a set with no picks and no grade unless fields say so.
function row(name: string, fields: Partial<PreferenceRow> = {}): PreferenceRow {
  return { name, is_exotic: 0, stat_1: null, stat_2: null, stat_3: null, grade: '', rank: 0, ...fields }
}

// The stored rows of the names given, compared ignoring case.
function stored(...names: string[]): PreferenceRow[] {
  const wanted = names.map((n) => n.toLowerCase())
  return preferenceRows(db).filter((r) => wanted.includes(r.name.toLowerCase()))
}

// The sets of grade, first to last.
function grade(code: string): string[] {
  return preferenceRows(db)
    .filter((r) => !r.is_exotic && r.grade === code)
    .map((r) => r.name)
}

// Writing the player's preferences over the defaults

test("a saved preference replaces the default of its name, whatever the case", () => {
  // The defaults hold Exodus Down (S, Health) and the Hunter exotic Aeon
  // Swift (Health, Melee). The player's rows win, under their own spelling,
  // and each name is stored once.
  applyPreferences(db, [
    row('EXODUS DOWN', { stat_1: 'melee', stat_2: 'weapons', grade: 'S', rank: 2 }),
    row('aeon swift', { is_exotic: 1, stat_1: 'weapons' }),
  ])
  expect(stored('Exodus Down', 'Aeon Swift')).toEqual([
    row('EXODUS DOWN', { stat_1: 'melee', stat_2: 'weapons', grade: 'S', rank: 2 }),
    row('aeon swift', { is_exotic: 1, stat_1: 'weapons' }),
  ])
})

test('a default the player never saved stays, and a set new to them is added', () => {
  const defaults = preferenceRows(db)
  applyPreferences(db, [row('Exodus Down', { stat_1: 'health', grade: 'S', rank: 2 }), row('Brand New Set')])
  const rows = preferenceRows(db)
  expect(rows).toHaveLength(defaults.length + 1)
  expect(stored("Atheon's Memory", 'Brand New Set')).toEqual([
    defaults.find((r) => r.name === "Atheon's Memory"),
    row('Brand New Set'),
  ])
})

test('a set saved in another grade leaves its old one, and both are renumbered', () => {
  // The player moved Exodus Down from S (2nd) to the top of A. S closes up;
  // in A it shares rank 1 with Smoke Jumper Set, and comes first by name.
  const [s, a] = [grade('S'), grade('A')]
  applyPreferences(db, [row('Exodus Down', { stat_1: 'health', grade: 'A', rank: 1 })])
  expect(grade('S')).toEqual(s.filter((n) => n !== 'Exodus Down'))
  expect(grade('A')).toEqual(['Exodus Down', ...a])
  expect(stored(...grade('A')).map((r) => r.rank)).toEqual(grade('A').map((_, i) => i + 1))
})

test('no saved preferences leave the defaults as they are', () => {
  const defaults = db.selectArrays('SELECT * FROM armor_preference ORDER BY rowid')
  applyPreferences(db, [])
  expect(db.selectArrays('SELECT * FROM armor_preference ORDER BY rowid')).toEqual(defaults)
})

test('rows read back sets by grade and rank, then exotics by name', () => {
  const rows = preferenceRows(db)
  const exoticsFrom = rows.findIndex((r) => r.is_exotic)
  expect(rows.slice(exoticsFrom).every((r) => r.is_exotic)).toBe(true)
  expect(rows.slice(0, 2).map((r) => [r.name, r.grade, r.rank])).toEqual([
    ["Atheon's Memory", 'S', 1],
    ['Exodus Down', 'S', 2],
  ])
  // And they turn into the editor's preferences and back unchanged.
  expect(toRows(toPrefs(rows))).toEqual(rows)
})
