// Armor set grades, best first: each grade's code, label and slotCap, how
// many copies of each slot a set of that grade keeps, per class. Their only
// source is the armor_grade view (schema/app/armor_grade.sql); they're read
// from its file's rows of VALUES once, with no SQLite: the preference editor
// needs no database, and a module that imports this one runs no SQL as it
// loads (Safari can load it before SQLite's wasm is ready).
// Ported from d2-inventory-report's analyze/armor_grades.py.
import gradesSql from '../../schema/app/armor_grade.sql?raw'

export type Grade = Readonly<{
  code: string
  label: string
  slotCap: number // copies of each slot the set keeps, per class
}>

// The grades S to F from armor_grade.sql's rows, ('S', 'Best-in-class', 4, 1)
// for grade, label, slot_cap and position, in position order; Unclassified
// (code '') is left out.
function readGrades(): Grade[] {
  return [...gradesSql.matchAll(/\('([^']*)', '([^']*)', (\d+), (\d+)\)/g)]
    .sort((a, b) => Number(a[4]) - Number(b[4]))
    .filter(([, code]) => code)
    .map(([, code, label, slotCap]) => ({ code, label, slotCap: Number(slotCap) }))
}

export const GRADES = readGrades()
export const GRADE_ORDER = GRADES.map((g) => g.code) // best first
export const GRADE_LABELS: Record<string, string> = Object.fromEntries(GRADES.map((g) => [g.code, g.label]))

// Caps as prose, grouping grades that share a cap: 'S 4, A/B 2, C/D/E/F 1'.
export function capSummary(): string {
  const groups: [string[], number][] = []
  for (const g of GRADES) {
    const last = groups.at(-1)
    if (last && last[1] === g.slotCap) last[0].push(g.code)
    else groups.push([[g.code], g.slotCap])
  }
  return groups.map(([codes, cap]) => `${codes.join('/')} ${cap}`).join(', ')
}
