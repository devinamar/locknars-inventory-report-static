// Tests for Clarity's community perk descriptions (build/clarity.ts): dim.json's
// entries parsed into Bungie-style text with inline icon tokens, and the
// extract that downloads them, replaces the stored descriptions and records
// Clarity's version. The entries are real ones from the live file; fetch is a
// stand-in answering as GitHub's raw file host does, serving JSON as
// text/plain.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  CLARITY_DIM_JSON_URL,
  CLARITY_VERSIONS_URL,
  extractClarity,
  parseClarityJson,
  parseDescription,
  saveNotes,
  segmentText,
} from '../../build/clarity.ts'
import { createDb } from '../../build/db.ts'
import { saveSourceStatus } from '../../src/source-status.ts'

const TEXT = { 'Content-Type': 'text/plain; charset=utf-8' }

// Demoralize's text holds a Void icon, and a spacer between its two lines.
const DEMORALIZE = {
  hash: 1464081238,
  name: 'Demoralize',
  descriptions: {
    en: [
      {
        linesContent: [
          { text: 'Precision Kills apply ' },
          { classNames: ['void'] },
          { text: 'Weaken to enemies within 7 meters of the target for ? seconds.' },
        ],
      },
      { classNames: ['spacer'] },
      { linesContent: [{ text: '1.5? second cooldown between activations.' }] },
    ],
  },
}
const DEMORALIZE_TEXT =
  'Precision Kills apply [Void]Weaken to enemies within 7 meters of the target for ? seconds.\n' +
  '1.5? second cooldown between activations.'
// An entry Clarity names but hasn't described.
const SPECIAL_AMMO_SCOUT = { hash: 25154119, name: 'Special Ammo Scout' }

const VERSION = '{"descriptions": 2.0625}' // the version stored in the live database
const NEW_VERSION = '{"descriptions": 2.0626}'
// A dim.json holding one description.
const DIM_JSON = { '1001': { descriptions: { en: [{ linesContent: [{ text: 'Kills grant damage.' }] }] } } }

let db: Database
beforeEach(() => {
  db = createDb()
  return () => db.close()
})
afterEach(() => {
  vi.restoreAllMocks()
})

// Answer each fetch in turn with the next of bodies, served as text/plain; a
// fetch beyond them fails. Returns the stand-in, which records the calls.
function answer(...bodies: string[]) {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no answer left'))
  for (const body of bodies) fetch.mockResolvedValueOnce(new Response(body, { headers: TEXT }))
  return fetch
}

// [the stored descriptions, the step's [status, detail]].
function stored() {
  const notes = new Map(db.selectArrays('SELECT plug_hash, text FROM clarity_note') as [number, string][])
  return [notes, db.selectArray("SELECT status, detail FROM source_status WHERE source = 'clarity'")]
}

test("the version text does not depend on the file's layout", async () => {
  // versions.json as GitHub serves it, then laid out another way: the same
  // text.
  const dimJson = JSON.stringify(DIM_JSON)
  const fetch = answer('{\n "descriptions": 2.0625\n}', dimJson, '{"descriptions":2.0625}', dimJson)
  await extractClarity(db)
  const first = stored()[1]
  await extractClarity(db)
  expect([first, stored()[1]]).toEqual([
    ['fresh', VERSION],
    ['fresh', VERSION],
  ])
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    CLARITY_VERSIONS_URL,
    CLARITY_DIM_JSON_URL,
    CLARITY_VERSIONS_URL,
    CLARITY_DIM_JSON_URL,
  ])
})

test('segments join into lines and empty lines are dropped', () => {
  expect(parseDescription(DEMORALIZE)).toBe(DEMORALIZE_TEXT)
})

test.each([
  ['void', '[Void]'],
  ['barrier', '[Shield-Piercing]'],
  ['overload', '[Disruption]'],
  ['unstoppable', '[Stagger]'],
  ['heavy', ''],
])("element and champion icons become Bungie's tokens: %s", (icon, token) => {
  // Other icons, such as heavy ammo's, leave nothing.
  expect(segmentText({ classNames: [icon] })).toBe(token)
})

test('a styled segment keeps its text', () => {
  // From Ranged Weapon's entry: the only class a segment with text has is bold.
  const segment = { text: 'With Gyro Core Equipped:', classNames: ['bold'] }
  expect(segmentText(segment)).toBe('With Gyro Core Equipped:')
})

test('descriptions are keyed by perk hash and entries without English are dropped', () => {
  // A key that isn't a perk hash is skipped too.
  const raw = { '1464081238': DEMORALIZE, '25154119': SPECIAL_AMMO_SCOUT, version: { en: 1 } }
  expect(parseClarityJson(raw)).toEqual(new Map([[1464081238, DEMORALIZE_TEXT]]))
})

// The extract: each data build downloads dim.json, whatever the version.

test('a download replaces the notes', async () => {
  saveNotes(db, new Map([[1001, 'Kills grant bonus damage.']]))
  saveSourceStatus(db, 'clarity', 'fresh', VERSION)
  const fetch = answer('{"descriptions": 2.0626}', JSON.stringify(DIM_JSON))
  await extractClarity(db)
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([CLARITY_VERSIONS_URL, CLARITY_DIM_JSON_URL])
  expect(stored()).toEqual([new Map([[1001, 'Kills grant damage.']]), ['fresh', NEW_VERSION]])
})

test('a failed download throws and saves nothing', async () => {
  // fetch's own failure when the host can't be reached.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
  await expect(extractClarity(db)).rejects.toThrow('fetch failed')
  expect(stored()).toEqual([new Map(), undefined])
})
