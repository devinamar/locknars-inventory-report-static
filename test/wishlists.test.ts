// Tests for the DIM wishlist source (src/wishlists.ts), ported from
// d2-inventory-report's tests/sources/test_wishlists.py and
// tests/extract/test_wishlists.py: parsing a wishlist file, where each roll
// line becomes one ParsedRoll, in file order, with the notes and tags that
// apply to it; adding a source; what save writes to wishlist_roll;
// downloading each source every run; and a player's own lists, which the
// browser adds and downloads on each build. The download is a stand-in.
import { createHash } from 'node:crypto'
import { type Database } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { insertMany } from '../src/db.ts'
import { SOURCES } from '../src/report/load.ts'
import {
  WILDCARD_ITEM_HASH,
  addSource,
  addWishlist,
  extractWishlists,
  parseWishlistText,
  save,
  sourceProblem,
} from '../src/wishlists.ts'
import * as c from './helpers.ts'

const PLUGS: [number, string, string, string][] = [
  [1, 'Arrowhead Brake', 'barrels', ''],
  [2, 'Smallbore', 'barrels', ''],
  [3, 'Appended Mag', 'magazines', ''],
  [4, 'Rampage', 'frames', ''],
  [5, 'Kill Clip', 'frames', ''],
  [6, 'Outlaw', 'frames', ''],
]

let db: Database
beforeEach(() => {
  // The shared test db plus these plugs and two weapons.
  db = c.testDb()
  insertMany(
    db,
    'INSERT INTO DestinyInventoryItemDefinition (hash, name, plugCategoryIdentifier, icon) VALUES (?, ?, ?, ?)',
    PLUGS,
  )
  c.addWeaponDef(db, 100, { name: 'Fatebringer' })
  c.addWeaponDef(db, 200, { name: 'Palindrome' })
  return () => db.close()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function rolls(text: string) {
  return parseWishlistText(text)
}

// Roll lines

test('a wishlist line becomes a roll', () => {
  expect(rolls('dimwishlist:item=100&perks=1,2,3,4')).toEqual([
    { itemHash: 100, perks: [1, 2, 3, 4], notes: '', tags: new Set(), isTrash: false },
  ])
})

test('a trash line is flagged trash', () => {
  expect(rolls('dimtrashlist:item=100&perks=5').map((r) => [r.itemHash, r.perks, r.isTrash])).toEqual([
    [100, [5], true],
  ])
})

test('a negative item hash trashes the whole weapon', () => {
  // DIM's shorthand: item=-<hash>, with no perks.
  expect(rolls('dimwishlist:item=-100')).toEqual([
    { itemHash: 100, perks: [], notes: '', tags: new Set(), isTrash: true },
  ])
})

test('the wildcard hash stays and is not trash', () => {
  // item=-69420 applies the roll to every weapon.
  const parsed = rolls(`dimwishlist:item=${WILDCARD_ITEM_HASH}&perks=9,10`)
  expect(parsed.map((r) => [r.itemHash, r.perks, r.isTrash])).toEqual([[WILDCARD_ITEM_HASH, [9, 10], false]])
})

test('each line is its own roll, in file order', () => {
  // A curator's two barrels by two traits, written out one line per pair.
  const text = [1, 2].flatMap((b) => [3, 4].map((t) => `dimwishlist:item=100&perks=${b},${t}`)).join('\n')
  expect(rolls(text).map((r) => r.perks)).toEqual([
    [1, 3],
    [1, 4],
    [2, 3],
    [2, 4],
  ])
})

// Notes

test('inline notes belong to their roll', () => {
  const text = 'dimwishlist:item=100&perks=1#notes:god roll\ndimwishlist:item=100&perks=2'
  expect(rolls(text).map((r) => r.notes)).toEqual(['god roll', ''])
})

test('a block note is inherited by the rolls after it', () => {
  const text = '//notes:Great for raids\ndimwishlist:item=100&perks=1\ndimwishlist:item=100&perks=2'
  expect(rolls(text).map((r) => r.notes)).toEqual(['Great for raids', 'Great for raids'])
})

test('inline notes win over the block note', () => {
  const text = '//notes:block\ndimwishlist:item=100&perks=1#notes:inline\ndimwishlist:item=100&perks=2'
  expect(rolls(text).map((r) => r.notes)).toEqual(['inline', 'block'])
})

test('blank inline notes fall back to the block note', () => {
  const text = '//notes:block\ndimwishlist:item=100&perks=1#notes:   '
  expect(rolls(text).map((r) => r.notes)).toEqual(['block'])
})

test('a blank line keeps the block note', () => {
  const text = '//notes:keep me\n\ndimwishlist:item=100&perks=1'
  expect(rolls(text).map((r) => r.notes)).toEqual(['keep me'])
})

test.each(['title:Second curator', 'description:For raids', '// a comment', 'dimwishlist:item=abc'])(
  'any other line clears the block note: %s',
  (line) => {
    // A section marker, a comment, or a roll line the parser can't read.
    const text = `//notes:first\n${line}\ndimwishlist:item=100&perks=1`
    expect(rolls(text).map((r) => r.notes)).toEqual([''])
  },
)

// Lines it can't read

test.each(['dimwishlist:item=abc&perks=1', 'dimwishlist:perks=1,2', 'wishlist:item=100&perks=1'])(
  'a roll line it cannot read is dropped: %s',
  (line) => {
    expect(rolls(line)).toEqual([])
  },
)

test('text after a roll that is not notes is ignored', () => {
  // #notes without its colon isn't a notes marker; the roll still counts.
  expect(rolls('dimwishlist:item=100&perks=1,2#notes').map((r) => [r.perks, r.notes])).toEqual([[[1, 2], '']])
})

test('empty perk entries are skipped', () => {
  expect(rolls('dimwishlist:item=100&perks=1,,2,').map((r) => r.perks)).toEqual([[1, 2]])
})

// Tags

test('tags split on commas and spaces, in lowercase', () => {
  const parsed = rolls('dimwishlist:item=100&perks=1#notes:good |tags:PvE pve-minor,m+kb')
  expect(parsed.map((r) => [r.notes, r.tags])).toEqual([['good', new Set(['pve', 'pve-minor', 'm+kb'])]])
})

test('tags come from the block note too', () => {
  const parsed = rolls('//notes:raid roll |tags:pve,god-pve\ndimwishlist:item=100&perks=1')
  expect(parsed.map((r) => [r.notes, r.tags])).toEqual([['raid roll', new Set(['pve', 'god-pve'])]])
})

// Line endings

test('CRLF endings and indented lines parse', () => {
  // No note keeps the \r.
  const text =
    '//notes:raid roll\r\n' +
    '  dimwishlist:item=100&perks=1\r\n' +
    '\tdimwishlist:item=200&perks=2#notes:god roll\r\n'
  expect(rolls(text).map((r) => [r.itemHash, r.notes])).toEqual([
    [100, 'raid roll'],
    [200, 'god roll'],
  ])
})

test("a line ends at any break Python's splitlines() knows", () => {
  // As the CLI read a file: a lone \r and U+2028 end a line too, so the
  // second roll's line is a line of its own.
  const text = '//notes:raid roll\rdimwishlist:item=100&perks=1\u2028dimwishlist:item=200&perks=2'
  expect(rolls(text).map((r) => [r.itemHash, r.notes])).toEqual([
    [100, 'raid roll'],
    [200, 'raid roll'],
  ])
})

// Adding a source

test('addSource saves a wishlist keyed by its label', () => {
  expect(addSource(db, 'My List!', 'https://example.com/list.txt')).toBe('')
  expect(db.selectArrays('SELECT key, label, url FROM wishlist_preference ORDER BY rowid').at(-1)).toEqual([
    'my_list',
    'My List!',
    'https://example.com/list.txt',
  ])
})

test('addSource refuses a bad URL or label, or a taken one', () => {
  // The defaults hold the key voltron and its URL.
  const [label, url] = db.selectArray("SELECT label, url FROM wishlist_preference WHERE key = 'voltron'")!
  const count = db.selectValue('SELECT COUNT(*) FROM wishlist_preference')
  expect(addSource(db, 'Other', 'ftp://example.com/list.txt')).toBe('the URL must start with https:// or http://')
  expect(addSource(db, '!!!', 'https://example.com/a.txt')).toBe('the label needs a letter or digit')
  expect(addSource(db, 'Voltron', 'https://example.com/b.txt')).toBe(`${label} already has that name or URL`)
  expect(addSource(db, 'Copy', url as string)).toBe(`${label} already has that name or URL`)
  expect(db.selectValue('SELECT COUNT(*) FROM wishlist_preference')).toBe(count)
})

test('the Preferences tab checks a source by the same rules, without a db', () => {
  // Against the sources it knows of: the defaults and the player's.
  const sources = [{ key: 'voltron', label: 'Voltron', url: 'https://example.com/voltron.txt' }]
  expect(sourceProblem(sources, 'My List!', 'https://example.com/list.txt')).toBe('')
  expect(sourceProblem(sources, 'VOLTRON', 'https://example.com/b.txt')).toBe('Voltron already has that name or URL')
  expect(sourceProblem(sources, '!!!', 'https://example.com/b.txt')).toBe('the label needs a letter or digit')
  expect(sourceProblem([], 'Mine', 'javascript:alert(1)')).toBe('the URL must start with https:// or http://')
})

// Saving

function ingest(text: string): void {
  save(db, 'src', 'Source Label', 'http://x', parseWishlistText(text), 'test-hash')
}

test('each file line persists as one row', () => {
  ingest('dimwishlist:item=100&perks=1,3,4\ndimwishlist:item=100&perks=2,3,5')
  const rows = db.selectArrays('SELECT item_hash, perk1, perk2, perk3, is_trash FROM wishlist_roll ORDER BY roll_id')
  expect(rows).toEqual([
    [100, 1, 3, 4, 0],
    [100, 2, 3, 5, 0],
  ])
})

test("a shorter roll keeps none of the roll before it's perks", () => {
  // The rolls share one prepared statement, which keeps the values bound
  // for the last row.
  ingest('dimwishlist:item=100&perks=1,3,4,5\ndimwishlist:item=100&perks=2')
  const rows = db.selectArrays('SELECT perk1, perk2, perk3, perk4 FROM wishlist_roll ORDER BY roll_id')
  expect(rows).toEqual([
    [1, 3, 4, 5],
    [2, null, null, null],
  ])
})

test('an unknown perk hash becomes NULL in place', () => {
  // Perk 99 isn't a stored plug: its column, perk2, is NULL, and perk3
  // still holds 5.
  ingest('dimwishlist:item=100&perks=1,99,5')
  expect(db.selectArrays('SELECT perk1, perk2, perk3 FROM wishlist_roll')).toEqual([[1, null, 5]])
})

test('a roll for an unknown weapon is dropped', () => {
  // 999 isn't a stored weapon or the wildcard.
  ingest('dimwishlist:item=100&perks=1\ndimwishlist:item=999&perks=1')
  expect(db.selectValues('SELECT item_hash FROM wishlist_roll')).toEqual([100])
})

test('a wildcard roll is kept', () => {
  ingest(`dimwishlist:item=${WILDCARD_ITEM_HASH}&perks=4,5`)
  expect(db.selectArrays('SELECT item_hash, perk1, perk2 FROM wishlist_roll')).toEqual([[WILDCARD_ITEM_HASH, 4, 5]])
})

test('a trash roll is stored as trash', () => {
  ingest('dimtrashlist:item=100&perks=5')
  expect(db.selectValues('SELECT is_trash FROM wishlist_roll')).toEqual([1])
})

test('notes and tags are stored', () => {
  ingest('dimwishlist:item=100&perks=1,4,5#notes:raid roll |tags:pve,god-pve')
  const rows = db.selectObjects(
    'SELECT wn.text AS note, r.tags FROM wishlist_roll r LEFT JOIN wishlist_note wn ON wn.note_id = r.note_id',
  )
  expect(rows.map((r) => [r.note, new Set(String(r.tags).split(','))])).toEqual([
    ['raid roll', new Set(['pve', 'god-pve'])],
  ])
})

test("a new download replaces the source's rolls", () => {
  ingest('dimwishlist:item=100&perks=1')
  ingest('dimwishlist:item=200&perks=1')
  expect(db.selectValues('SELECT item_hash FROM wishlist_roll')).toEqual([200])
})

test('a note is stored once for every roll sharing it', () => {
  // The live lists' 279,316 rolls with notes share 5,481 notes.
  ingest(
    '//notes:raid roll\n' +
      'dimwishlist:item=100&perks=1\n' +
      'dimwishlist:item=100&perks=2\n' +
      'dimwishlist:item=200&perks=3',
  )
  const notes = db.selectValue('SELECT COUNT(*) FROM wishlist_note')
  const noteIds = new Set(db.selectValues('SELECT note_id FROM wishlist_roll'))
  expect([notes, noteIds.size]).toEqual([1, 1])
})

// Downloading: every run downloads each source and saves it, or throws.

const LIST_URL = 'https://example.com/list.txt'

function onlySource(): void {
  // wishlist_preference holding one source, src, in place of the defaults.
  db.exec('DELETE FROM wishlist_preference')
  db.exec("INSERT INTO wishlist_preference VALUES ('src', 'Source Label', ?)", { bind: [LIST_URL] })
}

// Swap the download for one answering body (a Response as it is), or failing
// with it when it's an Error; returns the URLs it was asked for.
function serve(body: string | Response | Error): string[] {
  const asked: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    asked.push(String(url))
    if (body instanceof Error) throw body
    return body instanceof Response ? body : new Response(body)
  })
  return asked
}

function status() {
  return db.selectValue("SELECT status FROM source_status WHERE source = 'wishlist:src'")
}

test('every run downloads each source and saves it fresh', async () => {
  // The CLI kept an unchanged file's rolls without parsing it again; with no
  // stored copy, each run parses the file and replaces the source's rolls,
  // storing the body's SHA-256.
  onlySource()
  const body = 'dimwishlist:item=100&perks=1,4'
  const asked = serve(body)
  await extractWishlists(db)
  await extractWishlists(db)
  expect([asked, status()]).toEqual([[LIST_URL, LIST_URL], 'fresh'])
  expect(db.selectArrays('SELECT item_hash, perk1, perk2 FROM wishlist_roll')).toEqual([[100, 1, 4]])
  expect(db.selectArrays('SELECT key, label, url, content_hash FROM wishlist_source')).toEqual([
    ['src', 'Source Label', LIST_URL, createHash('sha256').update(body).digest('hex')],
  ])
  expect(db.selectValue("SELECT detail FROM source_status WHERE source = 'wishlist:src'")).toBe('')
})

test.each([
  ['unreachable', new TypeError('raw.githubusercontent.com unreachable')],
  ['an error status', new Response('Not Found', { status: 404 })],
])('a failed download throws and saves nothing: %s', async (_, failure) => {
  // There's no stored copy to fall back on: the data build fails, and the
  // last good deploy stays live.
  onlySource()
  serve(failure)
  await expect(extractWishlists(db)).rejects.toThrow()
  expect(db.selectValue('SELECT COUNT(*) FROM wishlist_roll')).toBe(0)
  expect(db.selectValue('SELECT COUNT(*) FROM wishlist_source')).toBe(0)
  expect(status()).toBeUndefined()
})

// A player's own lists: added beside the defaults and downloaded on each
// build; one that fails is listed, and the report still builds.

// source_status's [status, detail] for the source with key.
function statusOf(key: string) {
  return db.selectArray('SELECT status, detail FROM source_status WHERE source = ?', [`wishlist:${key}`])
}

test("a player's list is added after the defaults, and its rolls saved fresh", async () => {
  serve('dimwishlist:item=100&perks=1,4')
  expect(await addWishlist(db, 'My List', LIST_URL)).toBe('')
  expect(db.selectArrays('SELECT key, label, url FROM wishlist_preference ORDER BY rowid').at(-1)).toEqual([
    'my_list',
    'My List',
    LIST_URL,
  ])
  expect(db.selectArrays("SELECT item_hash, perk1, perk2 FROM wishlist_roll WHERE source_key = 'my_list'")).toEqual([
    [100, 1, 4],
  ])
  expect(statusOf('my_list')).toEqual(['fresh', ''])
})

test.each([
  ['unreachable', new TypeError('Failed to fetch'), 'TypeError: Failed to fetch'],
  ['an error status', new Response('Not Found', { status: 404 }), `Error: ${LIST_URL}: HTTP 404`],
])("a player's list that fails to download is listed as failed: %s", async (_, failure, reason) => {
  // With why as the status's detail, and in the report's data sources, with
  // no rolls; the build goes on.
  serve(failure)
  expect(await addWishlist(db, 'My List', LIST_URL)).toBe(reason)
  expect(statusOf('my_list')).toEqual(['failed', reason])
  expect(db.selectValue("SELECT COUNT(*) FROM wishlist_roll WHERE source_key = 'my_list'")).toBe(0)
  const listed = db.selectObjects(SOURCES).find((s) => s.name === 'My List')
  expect([listed?.ok, listed?.status]).toEqual([0, 'Download failed, and no copy is stored'])
})

test("a player's list addSource refuses is left out, and not downloaded", async () => {
  // Its label makes the key of a default: the default keeps its status.
  const label = db.selectValue("SELECT label FROM wishlist_preference WHERE key = 'voltron'")
  const asked = serve('dimwishlist:item=100&perks=1')
  expect(await addWishlist(db, 'Voltron', LIST_URL)).toBe(`${label} already has that name or URL`)
  expect(asked).toEqual([])
  expect(statusOf('voltron')).toBeUndefined()
})
