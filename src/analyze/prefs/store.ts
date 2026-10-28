// Armor preferences: their order, lookups and table (armor_preference). Each
// set has stat picks, an S-F grade and a rank within the grade (1 first); each
// exotic has stat picks only. Armor pruning follows them as saved, and only the
// editor changes them; the data build adds the default ones.
// Ported from d2-inventory-report's analyze/prefs/store.py.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { type ArmorInstance, type ArmorPreference, type ArmorSetBonus, type ExoticEffect } from '../../models.ts'
import { GRADE_ORDER } from '../armor-grades.ts'

// {name: ArmorPreference}, in insertion order like the CLI's dict.
export type Prefs = Map<string, ArmorPreference>

// Position of each grade in GRADE_ORDER (S = 0); unclassified sets sort after F.
const GRADE_INDEX = new Map(GRADE_ORDER.map((g, i) => [g, i]))

// Strings in Python's order, by character code (not locale).
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// Order: sets by grade, then by place in the grade; exotics after them.

// [[name, pref]] for the sets in grade, first place first.
export function gradeMembers(prefs: Prefs, grade: string, exclude: string | null = null): [string, ArmorPreference][] {
  const members = [...prefs].filter(([n, p]) => !p.isExotic && p.grade === grade && n !== exclude)
  return members.sort(([an, a], [bn, b]) => a.rank - b.rank || compare(an.toLowerCase(), bn.toLowerCase()))
}

// Number [[name, pref]] 1..n in list order.
export function setRanks(members: [string, ArmorPreference][]): void {
  members.forEach(([, pref], i) => (pref.rank = i + 1))
}

// Close the gaps in a grade's ranks, keeping its order.
export function renumberGrade(prefs: Prefs, grade: string): void {
  setRanks(gradeMembers(prefs, grade))
}

// Sets in grade order (S to F, unclassified last) and rank, then exotics,
// each by name within ties.
export function sortedPrefs(prefs: Prefs): Prefs {
  const gradeIndex = (p: ArmorPreference) => GRADE_INDEX.get(p.grade) ?? GRADE_INDEX.size
  return new Map(
    [...prefs].sort(
      ([an, a], [bn, b]) =>
        Number(a.isExotic) - Number(b.isExotic) ||
        gradeIndex(a) - gradeIndex(b) ||
        a.rank - b.rank ||
        compare(an.toLowerCase(), bn.toLowerCase()),
    ),
  )
}

// The stored preferences, {name: ArmorPreference}, in sortedPrefs order.
export function loadPreferences(db: Database): Prefs {
  return sortedPrefs(
    new Map(
      db.selectObjects('SELECT * FROM armor_preference').map((r: any) => [
        r.name,
        {
          stat1: r.stat_1,
          stat2: r.stat_2,
          stat3: r.stat_3,
          grade: r.grade,
          rank: r.rank,
          isExotic: Boolean(r.is_exotic),
        },
      ]),
    ),
  )
}

// Editing: lookups and the maps the editor's screens show.

// [storedKey, value] for a name, ignoring case, or [null, null]. Item
// names change capitalization between patches ('Aion Renewal' vs
// 'AION Renewal').
export function ciGet(prefs: Prefs, key: string): [string, ArmorPreference] | [null, null] {
  if (prefs.has(key)) return [key, prefs.get(key)!]
  const keyLower = key.toLowerCase()
  for (const [k, v] of prefs) if (k.toLowerCase() === keyLower) return [k, v]
  return [null, null]
}

// {setName: ArmorSetBonus} from the armor copies, built once so the
// editor's screens don't rescan every copy on each redraw.
export function buildSetBonusMap(armorInstances: ArmorInstance[]): Map<string, ArmorSetBonus> {
  const bonusMap = new Map<string, ArmorSetBonus>()
  for (const inst of armorInstances) {
    const sb = inst.armor.setBonus
    if (sb && !bonusMap.has(inst.armor.setName)) bonusMap.set(inst.armor.setName, sb)
  }
  return bonusMap
}

// Text on one line: whitespace runs as single spaces, none at the ends (as
// Python's ' '.join(text.split())).
export function oneLine(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(' ')
}

// [twoPcText, fourPcText] for a set, each on one line; '' when unknown.
export function setBonusText(setName: string, bonusMap?: Map<string, ArmorSetBonus>): [string, string] {
  const sb = bonusMap?.get(setName)
  if (sb) return [oneLine(sb.twoPieceBonus), oneLine(sb.fourPieceBonus)]
  return ['', '']
}

// {exotic name: ExoticEffect} from the armor copies.
export function buildExoticEffectMap(armorInstances: ArmorInstance[]): Map<string, ExoticEffect> {
  const effectMap = new Map<string, ExoticEffect>()
  for (const { armor } of armorInstances) {
    if (armor.isExotic && armor.exoticEffect && !effectMap.has(armor.name)) {
      effectMap.set(armor.name, armor.exoticEffect)
    }
  }
  return effectMap
}

// Put the set at 1-based position in grade, then renumber that grade and the
// one it left.
export function insertIntoGrade(prefs: Prefs, name: string, grade: string, position: number): void {
  const pref = prefs.get(name)!
  const oldGrade = pref.grade
  const members = gradeMembers(prefs, grade, name)
  position = Math.max(1, Math.min(members.length + 1, position))
  members.splice(position - 1, 0, [name, pref])
  pref.grade = grade
  setRanks(members)
  if (oldGrade && oldGrade !== grade) renumberGrade(prefs, oldGrade)
}

// Replace the stored preferences with prefs. Renumbers each grade and
// reorders prefs in place (see sortedPrefs). The player's own data, so the
// delete and the inserts are one transaction.
export function savePreferences(db: Database, prefs: Prefs): void {
  for (const grade of GRADE_ORDER) renumberGrade(prefs, grade)
  const ordered = sortedPrefs(prefs)
  db.transaction(() => {
    db.exec('DELETE FROM armor_preference')
    for (const [name, pref] of ordered) {
      db.exec(
        'INSERT INTO armor_preference (name, is_exotic, stat_1, stat_2, stat_3, grade, rank) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?)',
        { bind: [name, Number(pref.isExotic), pref.stat1, pref.stat2, pref.stat3, pref.grade, pref.rank] },
      )
    }
  })
  prefs.clear()
  for (const [name, pref] of ordered) prefs.set(name, pref)
}

// Lookups during scoring and reporting.

// The preference an armor piece follows: its own for an exotic, its set's
// otherwise.
export function prefName(inst: ArmorInstance): string {
  return inst.armor.isExotic ? inst.armor.name : inst.armor.setName
}

// The ArmorPreference stored under name (case-insensitive), or null.
export function getPref(prefs: Prefs, name: string): ArmorPreference | null {
  return ciGet(prefs, name)[1]
}
