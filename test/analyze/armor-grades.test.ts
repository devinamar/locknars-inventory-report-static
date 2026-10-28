// Tests for the armor set grades (src/analyze/armor-grades.ts), read from
// the armor_grade view's file. Ported from d2-inventory-report's
// tests/analyze/test_armor_grades.py.
import { expect, test } from 'vitest'
import { GRADES, GRADE_ORDER, capSummary } from '../../src/analyze/armor-grades.ts'
import { testDb } from '../helpers.ts'

test("grades are the view's rows best first without unclassified", () => {
  const db = testDb()
  const rows = db.selectArrays("SELECT grade, label, slot_cap FROM armor_grade WHERE grade != '' ORDER BY position")
  db.close()
  expect(GRADES).toEqual(rows.map(([code, label, slotCap]) => ({ code, label, slotCap })))
  expect(GRADE_ORDER).toEqual(['S', 'A', 'B', 'C', 'D', 'E', 'F'])
})

test('cap summary groups grades that share a cap', () => {
  expect(capSummary()).toBe('S 4, A/B 2, C/D/E/F 1')
})
