// Tests for The Aegis's "Set Bonuses" sheet (build/aegis.ts): reading its CSV
// as Python's csv module did, parsing the ranked rows, storing them, and the
// extract that downloads them. The sample is the live export's banner, column
// names and two of its rows, as Google sends them: rows end in \r\n, line
// breaks inside a cell are \n.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  type AegisBonus,
  CSV_URL,
  extractAegis,
  parseCsv,
  parseRow,
  readCsv,
  saveBonuses,
} from '../../build/aegis.ts'
import { createDb } from '../../build/db.ts'

const SHEET =
  'INFO,,,,,,,,,ANALYSIS,,\r\n' +
  '\u{1f5bc}\ufe0f,#,Set,Season,Bonus,Pcs,Tags,Trigger,Effect,Description,#,Tier\r\n' +
  ',,"CODA\nProphecy",29,So Very Thin,4,"ability\nsurvivability",' +
  '"Light weapon kills\nDark or kinetic weapon kills\nalternating weapon kills within ?s",' +
  '"22?% grenade energy\n22?% melee energy\n40% DR for 5s, refreshable on kill",' +
  '"easily the most consistent source of high DR if able to play around swapping ' +
  'polarities, excellent chunk gains too",5,S\r\n' +
  ',9,"Smoke Jumper\nSolo/Fireteam Ops",27,"Ride Together, Die Together",2,survivability,' +
  'orb pickup,40% DR decaying for 3s,"excellent pairing with Attrition Orbs / triple arm orb ' +
  'gen mod setups, a little build-dependent but solid regardless",6,A\r\n'
// Smoke Jumper's row as the CSV reads: its twelve cells.
const ROW = readCsv(SHEET)[3]

// ROW with one cell changed.
function changed(cell: number, value: string): string[] {
  const row = [...ROW]
  row[cell] = value
  return row
}

let db: Database
beforeEach(() => {
  db = createDb()
  return () => db.close()
})
afterEach(() => {
  vi.restoreAllMocks()
})

// Reading the CSV: each case is what Python's csv.reader returns for the same
// text.

test('quoted fields hold commas, line breaks and doubled quotes', () => {
  expect(readCsv('a,"b,c","d\ne","f""g",""\r\n')).toEqual([['a', 'b,c', 'd\ne', 'f"g', '']])
})

test('rows end at line breaks, and an empty line is a row with no fields', () => {
  // A break is \r\n or \n, with any \r's before it, or \r's at the end. A
  // trailing comma leaves an empty field, and the last row needs no break.
  expect(readCsv('a\r\nb\nc\r\r\n\r\nd,\ne')).toEqual([['a'], ['b'], ['c'], [], ['d', ''], ['e']])
  expect(readCsv('a\r')).toEqual([['a']])
  expect(readCsv('')).toEqual([])
})

test('text after a closing quote joins the field, and a quote inside a field is kept', () => {
  expect(readCsv('"ab"cd,e"f"\r\n')).toEqual([['abcd', 'e"f"']])
})

test('an unclosed quote runs to the end', () => {
  expect(readCsv('a,"b\r\nc')).toEqual([['a', 'b\r\nc']])
})

test('text after a lone \\r throws', () => {
  expect(() => readCsv('a\rb')).toThrow('new-line character seen in unquoted field')
})

// The ranked rows.

test('ranked rows parse in sheet order after the two header rows', () => {
  const bonuses = parseCsv(SHEET)
  expect(bonuses.map((b) => [b.setName, b.pieces, b.bonusName, b.season, b.rank, b.grade])).toEqual([
    ['CODA', 4, 'So Very Thin', '29', 5, 'S'],
    ['Smoke Jumper', 2, 'Ride Together, Die Together', '27', 6, 'A'],
  ])
})

test('the set cell splits into set name and source', () => {
  // The source is the cell's second line; a cell without one has none.
  expect(parseCsv(SHEET).map((b) => b.source)).toEqual(['Prophecy', 'Solo/Fireteam Ops'])
  const bonus = parseRow(changed(2, 'Smoke Jumper'))!
  expect([bonus.setName, bonus.source]).toEqual(['Smoke Jumper', ''])
})

test('tags split one per line and multiline text is kept', () => {
  const coda = parseCsv(SHEET)[0]
  expect(coda.tags).toEqual(['ability', 'survivability'])
  expect(coda.trigger).toBe('Light weapon kills\nDark or kinetic weapon kills\nalternating weapon kills within ?s')
  expect(coda.effect).toBe('22?% grenade energy\n22?% melee energy\n40% DR for 5s, refreshable on kill')
  expect(coda.analysis).toMatch(/^easily the most consistent source of high DR/)
})

test.each([
  ['short row', ROW.slice(0, 11)],
  ['no set name', changed(2, '')],
  ['pieces not a number', changed(5, 'two')],
  ['no rank', changed(10, '?')],
  ['grade not S to F', changed(11, 'S+')],
  ['no grade', changed(11, '')],
])('a row is skipped unless complete and graded: %s', (_, row) => {
  expect(parseRow(row)).toBeNull()
})

test('cells are trimmed', () => {
  expect(parseRow(ROW.map((cell) => `  ${cell} `))).toEqual(parseRow(ROW))
})

// Storing the rankings.

// An AegisBonus, '' or none for anything not given.
function bonus(setName: string, pieces: number, bonusName: string, fields: Partial<AegisBonus> = {}): AegisBonus {
  const empty = { source: '', season: '', tags: [], trigger: '', effect: '', analysis: '', rank: 0, grade: '' }
  return { setName, pieces, bonusName, ...empty, ...fields }
}

const BONUSES = [
  bonus('Ferropotent', 2, 'Rapid Repair', { tags: ['survivability'], rank: 26, grade: 'B' }),
  bonus('Ferropotent', 4, 'Built From Scratch', { trigger: 'a\nb', rank: 61, grade: 'C' }),
  bonus('Iron Panoply', 4, 'Panoply', { source: 'Iron Banner', rank: 19, grade: 'B' }),
]

// The stored rankings in rank order, read back as the CLI's
// load_aegis_bonuses read them: tags one per line.
function load(): Record<string, unknown>[] {
  const rows = db.selectObjects(
    'SELECT set_name AS setName, pieces, bonus_name AS bonusName, source, season, tags, ' +
      'trigger_text AS trigger, effect, analysis, rank, grade FROM aegis_bonus ORDER BY rank',
  )
  return rows.map((r) => ({ ...r, tags: r.tags ? String(r.tags).split('\n') : [] }))
}

test('bonuses round trip', () => {
  saveBonuses(db, BONUSES)
  expect(load()).toEqual(BONUSES.toSorted((a, b) => a.rank - b.rank))
})

test('save replaces the previous copy', () => {
  saveBonuses(db, BONUSES)
  saveBonuses(db, BONUSES.slice(2))
  expect(load().map((b) => b.setName)).toEqual(['Iron Panoply'])
})

// The download: a failed or empty one throws and saves nothing.

// The sheet's banner and column names with no ranked row under them.
const EMPTY_SHEET =
  'INFO,,,,,,,,,ANALYSIS,,\r\n' + '\u{1f5bc}\ufe0f,#,Set,Season,Bonus,Pcs,Tags,Trigger,Effect,Description,#,Tier\r\n'

test.each([
  ['fails', new Response('', { status: 503, statusText: 'Service Unavailable' }), `${CSV_URL}: HTTP 503`],
  ['empty', new Response(EMPTY_SHEET, { headers: { 'Content-Type': 'text/csv' } }), 'parsed empty'],
])('a failed or empty download throws and saves nothing: %s', async (_, response, error) => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
  await expect(extractAegis(db)).rejects.toThrow(error)
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([CSV_URL])
  // No rankings stored, and no status.
  expect(db.selectValue('SELECT count(*) FROM aegis_bonus')).toBe(0)
  expect(db.selectValues("SELECT status FROM source_status WHERE source = 'aegis'")).toEqual([])
})
