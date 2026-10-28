// Clarity: community-written perk descriptions (DIM shows them as "Community
// Insight"), from github.com/Database-Clarity/Live-Clarity-Database, saved to
// the clarity_note table. The data build downloads dim.json, parses it into
// {perk hash: text} and records Clarity's version (versions.json) as the
// source's detail.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { insertMany } from '../src/db.ts'
import { get } from '../src/http.ts'
import { saveSourceStatus } from '../src/source-status.ts'

const CLARITY_RAW_BASE = 'https://raw.githubusercontent.com/Database-Clarity/Live-Clarity-Database/live'
export const CLARITY_VERSIONS_URL = `${CLARITY_RAW_BASE}/versions.json`
export const CLARITY_DIM_JSON_URL = `${CLARITY_RAW_BASE}/descriptions/dim.json`

// Clarity's icon segments that stand for an inline token of Bungie's text:
// elements and champion types. Its other icons (ammo types, classes, the
// enhanced arrow) are left out.
const ICON_TOKENS = new Map([
  ['kinetic', '[Kinetic]'],
  ['arc', '[Arc]'],
  ['solar', '[Solar]'],
  ['void', '[Void]'],
  ['stasis', '[Stasis]'],
  ['strand', '[Strand]'],
  ['barrier', '[Shield-Piercing]'],
  ['overload', '[Disruption]'],
  ['unstoppable', '[Stagger]'],
])

type Segment = { text?: string; classNames?: string[] }
type Entry = { descriptions?: { en?: { linesContent?: Segment[] }[] } }

// Clarity's published version (versions.json, a flat object) as the CLI wrote
// it with Python's json.dumps: keys sorted, e.g. '{"descriptions": 2.0625}'.
export function versionText(versions: Record<string, unknown>): string {
  const keys = Object.keys(versions).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}: ${JSON.stringify(versions[key])}`).join(', ')}}`
}

// A line segment's text, or for an icon segment the token Bungie's text uses
// for that icon; '' for any other icon.
export function segmentText(segment: Segment): string {
  if (segment.text) return segment.text
  for (const name of segment.classNames ?? []) {
    const token = ICON_TOKENS.get(name)
    if (token) return token
  }
  return ''
}

// One dim.json entry's English description: each line's segments joined as
// written (they carry their own spaces), the lines joined by newlines.
export function parseDescription(entry: Entry): string {
  const lines = (entry.descriptions?.en ?? []).map((block) =>
    (block.linesContent ?? []).map(segmentText).join('').trim(),
  )
  return lines.filter(Boolean).join('\n')
}

// {perk hash: description} for every entry that has English text; a key that
// isn't a perk hash is skipped.
export function parseClarityJson(raw: Record<string, unknown>): Map<number, string> {
  const notes = new Map<number, string>()
  for (const [key, entry] of Object.entries(raw)) {
    const text = /^\d+$/.test(key) ? parseDescription(entry as Entry) : ''
    if (text) notes.set(Number(key), text)
  }
  return notes
}

// Replace the stored descriptions with notes ({plug hash: text}).
export function saveNotes(db: Database, notes: Map<number, string>): void {
  db.exec('DELETE FROM clarity_note')
  insertMany(db, 'INSERT INTO clarity_note VALUES (?, ?)', notes)
}

// Download, parse and save dim.json, with Clarity's version as the detail.
// Throws, saving nothing, when a download fails or dim.json holds no
// descriptions.
export async function extractClarity(db: Database): Promise<void> {
  const version = versionText(await (await get(CLARITY_VERSIONS_URL)).json())
  const notes = parseClarityJson(await (await get(CLARITY_DIM_JSON_URL)).json())
  if (!notes.size) throw new Error("Clarity's dim.json holds no descriptions")
  saveNotes(db, notes)
  saveSourceStatus(db, 'clarity', 'fresh', version)
}
