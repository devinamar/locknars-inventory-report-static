// Tests for the report's Builds page (templates/builds.html.j2): per class,
// the three-stat builds the kept armor covers, the ones it leaves short, and
// the pieces kept past their cap for a build. The live vault shows all three:
// the Warlock covers 16 builds, the Titan and Hunter none, and 2 pieces are
// kept for builds.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'
import { renderReport, reportPage } from './helpers.ts'

const SLOTS = ['Helmet', 'Gauntlets', 'Chest Armor', 'Leg Armor', 'Class Armor']

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

function buildsPage(): string {
  const [html] = renderReport(db)
  return reportPage(html, 'builds')
}

test('a class lists its short builds', () => {
  // 20 in health, melee and grenade in every slot covers that build, at 100
  // each; the other 19 fall short, each card with its three totals.
  for (const slot of SLOTS) {
    c.addArmor(db, slot, { health: 20, melee: 20, grenade: 20 }, { setName: 'Test Set', slot, score: 100 })
  }
  const page = buildsPage()
  expect(page).toContain(
    '<span class="num keep">1</span> of 20 builds covered · <span class="num purge">19</span> short',
  )
  expect(page).toContain('<h3>health · melee · super_stat</h3><span class="short-by">Short by 100</span>')
})

test('a class no build covers says why', () => {
  c.addArmor(db, 't1', { health: 30 }, { armorClass: 'Titan', score: 100 })
  const page = buildsPage()
  expect(page).toContain(
    'No build reaches 100: the Titan has 1 Legendary piece, not enough to add up to 100 in three stats.',
  )
})

test('pieces kept for a build are listed', () => {
  // With the build they're kept for and the lowest of its three totals.
  c.addPreference(db, 'Test Set', 'F')
  c.addArmor(db, 'a1', { health: 30 }, { setName: 'Test Set', score: 100 })
  db.exec("INSERT INTO armor_rescue VALUES ('a1', 'health', 'melee', 'grenade', 100)")
  const page = buildsPage()
  expect(page).toContain('<h2>Kept for builds</h2>')
  expect(page).toContain('<h3>health · melee · grenade</h3><span class="num keep">lowest 100</span>')
  expect(page).toContain('<li><b>Test Set Helmet</b><span>Helmet · Test Set, grade F</span></li>')
})
