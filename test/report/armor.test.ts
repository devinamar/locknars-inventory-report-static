// Tests for the report's Armor sets page (templates/armor.html.j2): each set
// with a piece to purge or kept for a build, its pieces' scores, badges and
// tuning, and the queries and chevrons that act on them.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'
import { renderReport, reportPage } from './helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

// A set past its cap of 1: a2 scores lower, a3 is an exact copy of a1, and
// a4 is past the cap but kept for a build. A second set has nothing
// flagged.
function vault(): void {
  c.addPreference(db, 'Test Set', 'F', 1, ['health'])
  c.addArmor(db, 'a1', { health: 30 }, { setName: 'Test Set', score: 90 })
  c.addArmor(db, 'a2', { health: 25 }, { setName: 'Test Set', tuning: ['melee'], score: 75 })
  c.addArmor(db, 'a3', { health: 30 }, { setName: 'Test Set', score: 90 })
  c.addArmor(db, 'a4', { melee: 20 }, { setName: 'Test Set', tuning: ['melee'], score: 60 })
  c.addArmor(db, 'k1', { grenade: 30 }, { setName: 'Kept Set', slot: 'Gauntlets', score: 90 })
  db.exec("UPDATE armor_score SET tuning_gain = 10 WHERE instance_id = 'a1'")
  db.exec("INSERT INTO armor_rescue VALUES ('a4', 'health', 'melee', 'grenade', 100)")
}

function armorPage(): string {
  vault()
  const [html] = renderReport(db)
  return reportPage(html, 'armor')
}

test("a set's pieces show their scores and badges", () => {
  // Purge for one past the cap, Dupe for an exact copy, Keep with the build
  // it's kept for; stats show as their icons.
  const page = armorPage()
  expect(page).toContain('<span class="score">75</span>\n<span class="chip">Purge</span>')
  expect(page).toContain('<span class="score">90</span>\n<span class="chip">Dupe</span>')
  expect(page).toContain('<span class="chip keep">Keep:<img src="https://www.bungie.net/img/health.png"')
  expect(page).toContain('alt="health" width="20" height="20">30</span>')
})

test('the tuning stats are boxed and the gain shown', () => {
  // a1 tunes health, boxed; a2 tunes melee, which it lacks: boxed, greyed.
  const page = armorPage()
  expect(page).toContain('<span class="tuned" title="health"><img')
  expect(page).toContain('<span class="tuned zero" title="melee"><img')
  expect(page).toContain('+10 from tuning')
})

test('sets and classes roll up and each set has its purge query', () => {
  // A set card, open at first, closes by its name; a class's sets roll up or
  // down together by the double chevron leading its count.
  const page = armorPage()
  expect(page).toContain('aria-expanded="true" aria-controls="set-a1"')
  expect(page).toContain('id="set-a1">')
  expect(page).toContain(
    '<span><button type="button" class="expand" aria-expanded="true" aria-label="Collapse all"',
  )
  expect(page).toContain('Test Set')
  expect(page).toContain('data-q="id:a3 or id:a2">Copy purge IDs</button>')
})

test('a set with nothing flagged is left out', () => {
  // Only the Markdown lists it.
  const page = armorPage()
  expect(page).not.toContain('Kept Set')
  expect(page).not.toContain('alt="grenade" width="20" height="20">30')
})
