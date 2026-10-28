// Armor set grades, best first: each grade's code, label and slotCap, how
// many copies of each slot a set of that grade keeps, per class. Their only
// source is the armor_grade view (schema/app/armor_grade.sql); they're read
// from its file once, so the preference editor needs no database.
// Ported from d2-inventory-report's analyze/armor_grades.py.
import gradesSql from '../../schema/app/armor_grade.sql?raw'
import { openDb } from '../db.ts'

export type Grade = Readonly<{
  code: string
  label: string
  slotCap: number // copies of each slot the set keeps, per class
}>

// The grades S to F from armor_grade.sql, run in an in-memory database;
// Unclassified (code '') is left out.
function readGrades(): Grade[] {
  const db = openDb()
  try {
    db.exec(gradesSql)
    const rows = db.selectArrays("SELECT grade, label, slot_cap FROM armor_grade WHERE grade != '' ORDER BY position")
    return rows.map(([code, label, slotCap]) => ({ code, label, slotCap }) as Grade)
  } finally {
    db.close()
  }
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
