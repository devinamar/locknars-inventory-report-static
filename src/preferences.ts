// The player's armor preferences outside their storage (src/saved.ts): written
// into the database over the shared defaults before each build's analysis,
// read back after it, edited in the report's Preferences tab
// (src/preferences-tab.ts), and checked when a backup file brings them in.
// Saved as armor_preference rows (PreferenceRow); store.ts's Prefs for the
// analysis and the editing.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { GRADE_ORDER } from './analyze/armor-grades.ts'
import { ciGet, loadPreferences, type Prefs, savePreferences } from './analyze/prefs/store.ts'
import { ARMOR_STAT_NAMES, type ArmorPreference } from './models.ts'
import { type PreferenceRow, type Saved } from './saved.ts'
import { sourceKey, sourceProblem, type WishlistSource } from './wishlists.ts'

// rows as Prefs, in their order.
export function toPrefs(rows: PreferenceRow[]): Prefs {
  return new Map(
    rows.map(({ name, is_exotic, stat_1, stat_2, stat_3, grade, rank }) => [
      name,
      { stat1: stat_1, stat2: stat_2, stat3: stat_3, grade, rank, isExotic: Boolean(is_exotic) },
    ]),
  )
}

// prefs as rows, in their order.
export function toRows(prefs: Prefs): PreferenceRow[] {
  return [...prefs].map(([name, p]) => ({
    name,
    is_exotic: Number(p.isExotic),
    stat_1: p.stat1,
    stat_2: p.stat2,
    stat_3: p.stat3,
    grade: p.grade,
    rank: p.rank,
  }))
}

// Write the player's rows over the shared database's defaults, as the CLI
// kept a player's preferences over its defaults: a row replaces the default of
// its name (compared ignoring case), and a default the player never saved
// stays. Grades are renumbered, so a default new to a grade joins it in order.
export function applyPreferences(db: Database, rows: PreferenceRow[]): void {
  if (!rows.length) return
  const prefs = loadPreferences(db)
  for (const [name, pref] of toPrefs(rows)) {
    const [taken] = ciGet(prefs, name)
    if (taken !== null) prefs.delete(taken)
    prefs.set(name, pref)
  }
  savePreferences(db, prefs)
}

// The preferences a build ended with, the analysis's filled in, in their
// order: sets by grade and rank, then exotics by name.
export function preferenceRows(db: Database): PreferenceRow[] {
  return toRows(loadPreferences(db))
}

// pref with stat (null for None) as its pick i (0 to 2), the picks kept in
// priority order with no stat twice and no gap: None ends the picks, as in the
// CLI's editor, and a stat already picked elsewhere trades places with the
// pick it replaces.
export function withPick(pref: ArmorPreference, i: number, stat: string | null): ArmorPreference {
  const picks = [pref.stat1, pref.stat2, pref.stat3]
  if (stat === null) picks.fill(null, i)
  else {
    const j = picks.indexOf(stat)
    if (j >= 0) picks[j] = picks[i]
    picks[i] = stat
  }
  const [stat1 = null, stat2 = null, stat3 = null] = picks.filter((s) => s !== null)
  return { ...pref, stat1, stat2, stat3 }
}

// Backup files

const FILE_KEYS = ['preferences', 'version', 'wishlists']
const ROW_KEYS = ['grade', 'is_exotic', 'name', 'rank', 'stat_1', 'stat_2', 'stat_3']
const WISHLIST_KEYS = ['key', 'label', 'url']

// True for an object with exactly keys (sorted), and no others.
function hasKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return (
    !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === keys.join()
  )
}

// Why row isn't a preference the editor could have saved, or ''.
function rowProblem(row: Record<string, unknown>): string {
  const { name, is_exotic, grade, rank } = row
  if (typeof name !== 'string' || !name.trim()) return 'a preference has no name'
  const picks = [row.stat_1, row.stat_2, row.stat_3]
  const chosen = picks.filter((s) => s !== null)
  const unknown = chosen.find((s) => !(ARMOR_STAT_NAMES as readonly unknown[]).includes(s))
  if (is_exotic !== 0 && is_exotic !== 1) return `${name}'s is_exotic isn't 0 or 1`
  if (unknown !== undefined) return `${name} picks ${JSON.stringify(unknown)}, which isn't one of the six stats`
  if (new Set(chosen).size < chosen.length) return `${name} picks a stat twice`
  if (picks.some((s, i) => s !== null && i > 0 && picks[i - 1] === null)) return `${name} picks a stat after None`
  if (typeof grade !== 'string' || (grade && !GRADE_ORDER.includes(grade))) {
    return `${name}'s grade ${JSON.stringify(grade)} isn't S to F, or '' for none`
  }
  if (is_exotic && grade) return `${name} is an exotic, which has no grade`
  if (!Number.isInteger(rank) || (rank as number) < 0) return `${name}'s rank isn't a whole number from 0 up`
  return ''
}

// The settings in a backup file (text, as the Preferences tab's Export writes
// it: { version: 1, preferences, wishlists }), checked strictly, since a file
// can hold anything: each preference an armor_preference row with known stats
// and grade, no name twice (ignoring case); each wishlist one sourceProblem
// lets in beside defaults (the wishlists every report uses) and the file's
// earlier ones, under the key its label makes. Throws why for the first thing
// that's off, and nothing is taken.
export function parseBackup(text: string, defaults: WishlistSource[] = []): Saved {
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    throw new Error("the file isn't a backup: it isn't JSON")
  }
  if (!hasKeys(file, FILE_KEYS)) {
    throw new Error("the file isn't a backup: it should hold exactly version, preferences and wishlists")
  }
  if (file.version !== 1) throw new Error(`the file's version is ${JSON.stringify(file.version)}, and only 1 is known`)
  if (!Array.isArray(file.preferences) || !Array.isArray(file.wishlists)) {
    throw new Error("the file's preferences and wishlists should each be a list")
  }
  const names = new Set<string>()
  for (const [i, row] of file.preferences.entries()) {
    if (!hasKeys(row, ROW_KEYS)) throw new Error(`preference ${i + 1} should hold exactly ${ROW_KEYS.join(', ')}`)
    const problem = rowProblem(row)
    if (problem) throw new Error(problem)
    const name = (row.name as string).toLowerCase()
    if (names.has(name)) throw new Error(`${row.name} is in the file twice`)
    names.add(name)
  }
  const wishlists: WishlistSource[] = []
  for (const [i, w] of file.wishlists.entries()) {
    if (!hasKeys(w, WISHLIST_KEYS) || WISHLIST_KEYS.some((k) => typeof w[k] !== 'string')) {
      throw new Error(`wishlist ${i + 1} should hold exactly a key, a label and a url, each text`)
    }
    const { key, label, url } = w as WishlistSource
    const problem = sourceProblem([...defaults, ...wishlists], label, url)
    if (problem) throw new Error(`wishlist ${label}: ${problem}`)
    if (key !== sourceKey(label)) throw new Error(`wishlist ${label}'s key should be ${sourceKey(label)}`)
    wishlists.push({ key, label, url })
  }
  return { preferences: file.preferences as PreferenceRow[], wishlists }
}
