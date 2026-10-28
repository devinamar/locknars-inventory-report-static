// The Aegis's endgame analysis spreadsheet ranks every armor set bonus, S to F;
// the app keeps the rankings for reference beside the armor preferences, in
// the aegis_bonus table. The data build fetches the "Set Bonuses" tab as CSV
// through Google Sheets' public export and saves each ranked row.
// Sheet: https://docs.google.com/spreadsheets/d/1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY/
// Video: https://www.youtube.com/watch?v=4yRRkyEa6Ic
import { type Database } from '@sqlite.org/sqlite-wasm'
import { insertMany } from '../src/db.ts'
import { get } from '../src/http.ts'
import { saveSourceStatus } from '../src/source-status.ts'

const SHEET_ID = '1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY'
const SET_BONUSES_GID = 1665223292
export const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SET_BONUSES_GID}`

// One ranked set bonus from the sheet. A set's 2pc and 4pc bonuses are ranked
// independently. Saved as an aegis_bonus row.
export type AegisBonus = {
  setName: string // sheet spelling
  pieces: number // 2 or 4
  bonusName: string
  source: string // activity / location the set drops from
  season: string
  tags: string[] // ['survivability', 'damage', ...]
  trigger: string // cells may embed newlines
  effect: string
  analysis: string
  rank: number // 1 = best bonus overall
  grade: string // 'S'..'F'
}

// Row 1 is the section banner (INFO / ANALYSIS), row 2 the column names:
// icon, #, Set (name + newline + source), Season, Bonus, Pcs, Tags,
// Trigger, Effect, Description, # (rank), Tier (S to F; the app calls it the
// grade).
const HEADER_ROWS = 2
const COLUMNS = 12
const GRADES = new Set('SABCDEF')

// CSV text's rows, as Python's csv.reader read the sheet for the CLI (its
// default dialect, over the text in a StringIO). Fields split on commas. A
// field that starts with a double quote runs to its closing quote, holding
// commas and line breaks, with "" for each " in it; anything after the
// closing quote joins the field as written, and a quote inside an unquoted
// field is kept. An unclosed quote runs to the end of the text. A row ends at
// a line break outside quotes (\n, or \r's then \n or the end), and an empty
// line is a row with no fields; text after a lone \r throws, as it does in
// Python.
export function readCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let start = true // at the start of a field
  let quoted = false // inside a quoted field
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') field += text[++i]
      else quoted = false
    } else if (c === '"' && start) {
      quoted = true
      start = false
    } else if (c === ',') {
      row.push(field)
      field = ''
      start = true
    } else if (c === '\r' || c === '\n') {
      if (row.length || !start) row.push(field)
      rows.push(row)
      row = []
      field = ''
      start = true
      if (c === '\r') {
        while (text[i + 1] === '\r') i++
        if (text[i + 1] === '\n') i++
        else if (i + 1 < text.length) throw new Error('new-line character seen in unquoted field')
      }
    } else {
      field += c
      start = false
    }
  }
  // The last row, when the text doesn't end with a line break.
  if (row.length || !start) rows.push([...row, field])
  return rows
}

// One sheet row as an AegisBonus, or null if it isn't a ranked bonus.
export function parseRow(row: string[]): AegisBonus | null {
  if (row.length < COLUMNS) return null
  const cells = row.slice(0, COLUMNS).map((cell) => cell.trim())
  const [, , setCell, season, bonusName, pieces, tags, trigger, effect, analysis, rank, grade] = cells
  const [setName, ...source] = setCell.split('\n')
  if (!setName || !/^\d+$/.test(pieces) || !/^\d+$/.test(rank) || !GRADES.has(grade)) return null
  return {
    setName: setName.trim(),
    pieces: Number(pieces),
    bonusName,
    source: source.join('\n').trim(),
    season,
    tags: tags
      .split('\n')
      .map((tag) => tag.trim())
      .filter(Boolean),
    trigger,
    effect,
    analysis,
    rank: Number(rank),
    grade,
  }
}

// The sheet's ranked bonuses in sheet order; blank or malformed rows are
// skipped.
export function parseCsv(text: string): AegisBonus[] {
  return readCsv(text)
    .slice(HEADER_ROWS)
    .map(parseRow)
    .filter((bonus) => bonus !== null)
}

// Replace the stored rankings with bonuses.
export function saveBonuses(db: Database, bonuses: AegisBonus[]): void {
  db.exec('DELETE FROM aegis_bonus')
  insertMany(
    db,
    'INSERT OR REPLACE INTO aegis_bonus VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    bonuses.map((b) => [
      b.setName,
      b.pieces,
      b.bonusName,
      b.source,
      b.season,
      b.tags.join('\n'),
      b.trigger,
      b.effect,
      b.analysis,
      b.rank,
      b.grade,
    ]),
  )
}

// Download and save the rankings. Throws, saving nothing, when the download
// fails or the sheet holds no ranked bonus.
export async function extractAegis(db: Database): Promise<void> {
  const bonuses = parseCsv(await (await get(CSV_URL)).text())
  if (!bonuses.length) throw new Error("The Aegis's set-bonus sheet parsed empty")
  saveBonuses(db, bonuses)
  saveSourceStatus(db, 'aegis', 'fresh')
}
