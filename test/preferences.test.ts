// Tests for the player's armor preferences outside their storage
// (src/preferences.ts): written over the shared database's defaults before a
// build's analysis and read back after it, with what the CLI's editor showed
// beside each; a stat picked on the settings page; and a backup file, which
// is taken whole or not at all.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import {
  applyPreferences,
  parseBackup,
  preferenceNotes,
  preferenceRows,
  toPrefs,
  toRows,
  withPick,
} from '../src/preferences.ts'
import { type PreferenceRow } from '../src/saved.ts'
import { testDb } from './helpers.ts'
import { pref } from './analyze/helpers.ts'

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

test('notes hold what the CLI editor showed, for the preferences it knew about', () => {
  // The Aegis ranks one of Exodus Down's bonuses. The player owns no armor,
  // so no other set or exotic has a bonus or effect to show.
  db.exec(
    'INSERT INTO aegis_bonus (set_name, pieces, bonus_name, trigger_text, effect, analysis, rank, grade) ' +
      "VALUES ('Exodus Down', 2, 'Rapid Repair', 'orb\npickup', 'heal', 'solid', 26, 'B')",
  )
  expect(preferenceNotes(db)).toEqual({ 'Exodus Down': '  Aegis #26 [B] 2pc Rapid Repair: orb pickup -> heal | solid' })
})

// Picking a stat on the settings page

test.each([
  ['None ends the picks', ['health', 'melee', 'grenade'], 1, null, ['health', null, null]],
  ['None first clears them all', ['health', 'melee', 'grenade'], 0, null, [null, null, null]],
  ['a pick after the last', ['health', null, null], 1, 'melee', ['health', 'melee', null]],
  ['a new stat replaces the pick', ['health', 'melee', 'grenade'], 0, 'weapons', ['weapons', 'melee', 'grenade']],
  ['a stat picked later trades places', ['health', 'melee', 'grenade'], 0, 'grenade', ['grenade', 'melee', 'health']],
  ['a stat picked earlier trades places too', ['health', 'melee', null], 1, 'health', ['melee', 'health', null]],
])('picking a stat: %s', (_, stats, i, stat, picks) => {
  const result = withPick(pref(stats as string[], { grade: 'A', rank: 3 }), i as number, stat as string | null)
  expect(result).toEqual(pref((picks as (string | null)[]).filter(Boolean) as string[], { grade: 'A', rank: 3 }))
})

// Backup files

const VOLTRON = { key: 'voltron', label: 'Voltron', url: 'https://example.com/voltron.txt' }
const MINE = { key: 'my_list', label: 'My List!', url: 'https://example.com/mine.txt' }

// A good backup file's contents, as the settings page's Export writes them.
function backup() {
  return {
    version: 1,
    preferences: [
      row('Exodus Down', { stat_1: 'health', stat_2: 'weapons', grade: 'S', rank: 1 }),
      row('Aeon Swift', { is_exotic: 1, stat_1: 'melee' }),
      row('Unsorted'),
    ],
    wishlists: [{ ...MINE }],
  }
}

test('a good backup file gives its preferences and wishlists', () => {
  const file = backup()
  expect(parseBackup(JSON.stringify(file), [VOLTRON])).toEqual({ preferences: file.preferences, wishlists: [MINE] })
})

// A backup file edited by change, then refused for the reason matching why.
const BAD: [string, (file: any) => unknown, RegExp][] = [
  ['not JSON', () => '{"version": 1,', /isn't JSON/],
  ['a list', () => [], /exactly version, preferences and wishlists/],
  ['an extra key', (f) => ({ ...f, extra: true }), /exactly version, preferences and wishlists/],
  ['another version', (f) => ({ ...f, version: 2 }), /version is 2/],
  ['preferences not a list', (f) => ({ ...f, preferences: {} }), /should each be a list/],
  ['a row missing a column', (f) => (delete f.preferences[0].rank, f), /preference 1 should hold exactly/],
  ['a row with an extra column', (f) => ((f.preferences[1].note = ''), f), /preference 2 should hold exactly/],
  ['a row without a name', (f) => ((f.preferences[0].name = ' '), f), /has no name/],
  ['is_exotic not 0 or 1', (f) => ((f.preferences[1].is_exotic = true), f), /is_exotic isn't 0 or 1/],
  ['an unknown stat', (f) => ((f.preferences[0].stat_1 = 'mobility'), f), /"mobility", which isn't one of/],
  ['a stat that is not text', (f) => ((f.preferences[0].stat_2 = 3), f), /picks 3, which isn't one of/],
  ['a stat twice', (f) => ((f.preferences[0].stat_2 = 'health'), f), /picks a stat twice/],
  ['a stat after None', (f) => (Object.assign(f.preferences[0], { stat_2: null, stat_3: 'melee' }), f), /after None/],
  ['an unknown grade', (f) => ((f.preferences[0].grade = 'Z'), f), /grade "Z" isn't S to F/],
  ['an exotic with a grade', (f) => ((f.preferences[1].grade = 'S'), f), /exotic, which has no grade/],
  ['a negative rank', (f) => ((f.preferences[0].rank = -1), f), /rank isn't a whole number/],
  ['a rank as text', (f) => ((f.preferences[0].rank = '1'), f), /rank isn't a whole number/],
  ['a name twice', (f) => (f.preferences.push(row('EXODUS down')), f), /EXODUS down is in the file twice/],
  ['a wishlist without a url', (f) => ({ ...f, wishlists: [{ key: 'a', label: 'A' }] }), /wishlist 1 should hold/],
  ['a URL that is not http', (f) => ((f.wishlists[0].url = 'ftp://example.com/a.txt'), f), /must start with https/],
  ['a script URL', (f) => ((f.wishlists[0].url = 'javascript:alert(1)'), f), /must start with https/],
  ['a key its label would not make', (f) => ((f.wishlists[0].key = 'mine'), f), /key should be my_list/],
  ['a default taken', (f) => ((f.wishlists[0].url = VOLTRON.url), f), /Voltron already has that name or URL/],
  ['a wishlist twice', (f) => (f.wishlists.push({ ...MINE }), f), /My List! already has that name or URL/],
]

test.each(BAD)('a backup file is refused whole for %s', (_, change, why) => {
  const file = change(backup())
  expect(() => parseBackup(typeof file === 'string' ? file : JSON.stringify(file), [VOLTRON])).toThrow(why)
})
