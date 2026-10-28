// Tests for the report's Preferences tab (src/preferences-tab.ts): each change
// it saves, from the settings saved to what they become, by the CLI editor's
// rules (src/analyze/prefs/store.ts, withPick) and --add-wishlist's
// (src/wishlists.ts); and the backup file it exports and imports, which is
// taken whole or not at all. Its page (the controls, kept as saved) runs in
// the browser.
import { expect, test } from 'vitest'
import { parseBackup } from '../src/preferences.ts'
import {
  addList,
  backupText,
  moveSet,
  pickStat,
  regradeSet,
  removeList,
  resetArmor,
} from '../src/preferences-tab.ts'
import { type PreferenceRow, type Saved } from '../src/saved.ts'

// A preference row: a set with no picks and no grade unless fields say so.
function row(name: string, fields: Partial<PreferenceRow> = {}): PreferenceRow {
  return { name, is_exotic: 0, stat_1: null, stat_2: null, stat_3: null, grade: '', rank: 0, ...fields }
}

const VOLTRON = { key: 'voltron', label: 'Voltron', url: 'https://example.com/voltron.txt' }
const MINE = { key: 'my_list', label: 'My List!', url: 'https://example.com/mine.txt' }

// What a build leaves saved, in the order it reads them back: sets by grade
// and rank (Echo unclassified, with no rank of its own), then exotics by
// name; and a wishlist of the player's.
const SAVED: Saved = {
  preferences: [
    row('Alpha', { stat_1: 'health', stat_2: 'weapons', grade: 'S', rank: 1 }),
    row('Bravo', { stat_1: 'melee', grade: 'S', rank: 2 }),
    row('Charlie', { stat_1: 'grenade', grade: 'A', rank: 1 }),
    row('Delta', { stat_1: 'super_stat', stat_2: 'class_stat', stat_3: 'weapons', grade: 'A', rank: 2 }),
    row('Echo'),
    row('Aeon Swift', { is_exotic: 1, stat_1: 'health', stat_2: 'melee' }),
    row("Assassin's Cowl", { is_exotic: 1, stat_1: 'melee' }),
  ],
  wishlists: [MINE],
}

// The sets saved, as [name, grade, rank], in their order.
function sets(saved: Saved): [string, string, number][] {
  return saved.preferences.filter((r) => !r.is_exotic).map((r) => [r.name, r.grade, r.rank])
}

// Picking a stat

test.each([
  ['None ends the picks', ['health', 'melee', 'grenade'], 1, null, ['health', null, null]],
  ['None first clears them all', ['health', 'melee', 'grenade'], 0, null, [null, null, null]],
  ['a pick after the last', ['health', null, null], 1, 'melee', ['health', 'melee', null]],
  ['a new stat replaces the pick', ['health', 'melee', 'grenade'], 0, 'weapons', ['weapons', 'melee', 'grenade']],
  ['a stat picked later trades places', ['health', 'melee', 'grenade'], 0, 'grenade', ['grenade', 'melee', 'health']],
  ['a stat picked earlier trades places too', ['health', 'melee', null], 1, 'health', ['melee', 'health', null]],
])('picking a stat: %s', (_, stats, i, stat, picks) => {
  // The set keeps its grade and rank.
  const [stat_1, stat_2, stat_3] = stats as (string | null)[]
  const saved = { preferences: [row('Delta', { stat_1, stat_2, stat_3, grade: 'A', rank: 3 })], wishlists: [] }
  const [after] = pickStat(saved, 'Delta', i as number, stat as string | null).preferences
  expect(after).toEqual(row('Delta', { stat_1: picks[0], stat_2: picks[1], stat_3: picks[2], grade: 'A', rank: 3 }))
})

test('a change saves every preference, in the order a build reads them back, the others as they were', () => {
  // An exotic's 3rd pick. Echo keeps its rank of 0, and the wishlists stay.
  const after = pickStat(SAVED, 'Aeon Swift', 2, 'grenade')
  expect(after).toEqual({
    preferences: SAVED.preferences.map((r) => (r.name === 'Aeon Swift' ? { ...r, stat_3: 'grenade' } : r)),
    wishlists: [MINE],
  })
  expect(SAVED.preferences[5].stat_3).toBe(null)
  // Rows saved in another order (a backup file's) come back in the build's.
  const shuffled = { ...SAVED, preferences: [...SAVED.preferences].reverse() }
  expect(pickStat(shuffled, 'Aeon Swift', 2, 'grenade')).toEqual(after)
})

// Moving a set within its grade

test('a set moves up or down its grade, past neither end', () => {
  expect(sets(moveSet(SAVED, 'Bravo', -1))).toEqual([
    ['Bravo', 'S', 1],
    ['Alpha', 'S', 2],
    ['Charlie', 'A', 1],
    ['Delta', 'A', 2],
    ['Echo', '', 0],
  ])
  expect(sets(moveSet(SAVED, 'Charlie', 1)).slice(2, 4)).toEqual([
    ['Delta', 'A', 1],
    ['Charlie', 'A', 2],
  ])
  // At a grade's ends nothing changes, not even the unranked Echo's rank.
  for (const [name, by] of [['Alpha', -1], ['Bravo', 1], ['Delta', 1], ['Echo', -1], ['Echo', 1]] as const) {
    expect(moveSet(SAVED, name, by)).toEqual(SAVED)
  }
})

test('unclassified sets take places once one of them moves', () => {
  // As in the CLI's editor: the move numbers the whole group.
  const saved = { ...SAVED, preferences: [...SAVED.preferences, row('Foxtrot')] }
  expect(sets(moveSet(saved, 'Foxtrot', -1)).slice(-2)).toEqual([
    ['Foxtrot', '', 1],
    ['Echo', '', 2],
  ])
})

// Grading a set

test('a set given another grade goes last in it, and both grades close up', () => {
  // Alpha leaves the top of S for A: Bravo is S's 1st, Alpha A's 3rd.
  expect(sets(regradeSet(SAVED, 'Alpha', 'A'))).toEqual([
    ['Bravo', 'S', 1],
    ['Charlie', 'A', 1],
    ['Delta', 'A', 2],
    ['Alpha', 'A', 3],
    ['Echo', '', 0],
  ])
  // A grade no set had takes it 1st; an unclassified set joins its grade last.
  expect(sets(regradeSet(SAVED, 'Delta', 'F')).slice(2)).toEqual([
    ['Charlie', 'A', 1],
    ['Delta', 'F', 1],
    ['Echo', '', 0],
  ])
  expect(sets(regradeSet(SAVED, 'Echo', 'S')).slice(0, 3)).toEqual([
    ['Alpha', 'S', 1],
    ['Bravo', 'S', 2],
    ['Echo', 'S', 3],
  ])
  // Its own grade again: nothing changes.
  expect(regradeSet(SAVED, 'Bravo', 'S')).toEqual(SAVED)
})

// Back to the defaults

test('a reset leaves no armor preferences, and the wishlists as they were', () => {
  // So the next build starts from the shared database's defaults, as a new
  // player's does (applyPreferences, in preferences.test.ts).
  expect(resetArmor(SAVED)).toEqual({ preferences: [], wishlists: [MINE] })
})

// The player's wishlists

test('a wishlist is added under the key its label makes, after theirs', () => {
  const url = 'https://gist.githubusercontent.com/me/abc/raw/list.txt'
  expect(addList(SAVED, [VOLTRON], 'Second List', url)).toEqual({
    preferences: SAVED.preferences,
    wishlists: [MINE, { key: 'second_list', label: 'Second List', url }],
  })
})

test.each([
  ['a default name', 'VOLTRON', 'https://example.com/b.txt', 'Voltron already has that name or URL'],
  ['a default URL', 'Other', VOLTRON.url, 'Voltron already has that name or URL'],
  ['a name of theirs', 'my list', 'https://example.com/b.txt', 'My List! already has that name or URL'],
  ['a URL of theirs', 'Other', MINE.url, 'My List! already has that name or URL'],
  ['a URL that is not http', 'Other', 'ftp://example.com/a.txt', 'the URL must start with https:// or http://'],
  ['a script URL', 'Other', 'javascript:alert(1)', 'the URL must start with https:// or http://'],
  ['a label without a letter or digit', '!!!', 'https://example.com/a.txt', 'the label needs a letter or digit'],
])('a wishlist is refused for %s', (_, label, url, why) => {
  expect(() => addList(SAVED, [VOLTRON], label, url)).toThrow(why)
})

test('a wishlist of theirs is removed by its key, and only theirs', () => {
  expect(removeList(SAVED, 'my_list')).toEqual({ preferences: SAVED.preferences, wishlists: [] })
  expect(removeList(SAVED, 'voltron')).toEqual(SAVED)
})

// Backup files

test('an exported backup file imports as the settings it was made from', () => {
  expect(JSON.parse(backupText(SAVED))).toEqual({ version: 1, ...SAVED })
  expect(parseBackup(backupText(SAVED), [VOLTRON])).toEqual(SAVED)
})

// A good backup file's contents, as the tab's Export writes them.
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
