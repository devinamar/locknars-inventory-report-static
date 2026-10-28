// Tests for the report's Exotics page (templates/exotics.html.j2): each exotic
// with copies to purge.
import { expect, test } from 'vitest'
import * as c from '../helpers.ts'
import { renderReport, reportPage } from './helpers.ts'

test('exotic tiles show no tuning', () => {
  // A Tier 5 exotic can tune any stat, so tuning doesn't tell its copies
  // apart.
  const db = c.testDb()
  c.addArmor(db, 'e1', { melee: 30 }, { exotic: true, name: 'Test Exotic', score: 80 })
  c.addArmor(db, 'e2', { melee: 20 }, { exotic: true, name: 'Test Exotic', score: 60 })
  const [html] = renderReport(db)
  const page = reportPage(html, 'exotics')
  expect(page).toContain('Test Exotic')
  expect(page).not.toContain('class="tuned')
  db.close()
})
