// The Aegis's set-bonus rankings, which the preference editor shows beside each
// set for reference, read from the aegis_bonus table build/aegis.ts fills.
// Names are compared after normalizing (case, punctuation, a trailing " Set"),
// since manifest names drift from the sheet's spelling ('Iron Panoply Set').
// Ported from d2-inventory-report's analyze/aegis_rankings.py.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { type AegisBonus } from '../models.ts'

// The line breaks Python's str.splitlines() splits on (as in src/wishlists.ts).
const LINE_BREAK = /\r\n|[\n\v\f\r\x1c-\x1e\x85\u2028\u2029]/

// Fold a set name for matching: lowercase, drop trailing ' Set',
// collapse punctuation/whitespace runs to single spaces.
export function normalize(name: string): string {
  const n = name.toLowerCase().trim().replace(/\s+set$/, '')
  return n.replace(/[^a-z0-9]+/g, ' ').trim()
}

// text's lines as Python's str.splitlines() gives them: no trailing empty
// line, and none at all for ''.
function splitlines(text: string): string[] {
  const lines = text.split(LINE_BREAK)
  if (lines.at(-1) === '') lines.pop()
  return lines
}

// [AegisBonus] in rank order.
export function loadAegisBonuses(db: Database): AegisBonus[] {
  return db.selectObjects('SELECT * FROM aegis_bonus ORDER BY rank').map((r: any) => ({
    set_name: r.set_name,
    pieces: r.pieces,
    bonus_name: r.bonus_name,
    source: r.source,
    season: r.season,
    tags: splitlines(r.tags),
    trigger: r.trigger_text,
    effect: r.effect,
    analysis: r.analysis,
    rank: r.rank,
    grade: r.grade,
  }))
}

// {normalized set name: [AegisBonus] in rank order}: the aegis argument
// of the lookups below.
export function load(db: Database): Map<string, AegisBonus[]> {
  const bySet = new Map<string, AegisBonus[]>()
  for (const b of loadAegisBonuses(db)) {
    const key = normalize(b.set_name)
    if (!bySet.has(key)) bySet.set(key, [])
    bySet.get(key)!.push(b)
  }
  return bySet
}

// The set's [AegisBonus] in rank order (2pc and 4pc are ranked
// independently); [] when the set is absent from the sheet.
export function getAegisBonuses(aegis: Map<string, AegisBonus[]>, setName: string | null): AegisBonus[] {
  if (!setName) return []
  return aegis.get(normalize(setName)) ?? []
}

// The set's best-ranked AegisBonus (its first appearance on the sheet), or
// null when the sheet doesn't list the set (older sets without a bonus,
// PvP-only ornament sets, or sets newer than the sheet).
export function getAegisRanking(aegis: Map<string, AegisBonus[]>, setName: string | null): AegisBonus | null {
  return getAegisBonuses(aegis, setName)[0] ?? null
}
