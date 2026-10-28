// Tests for the report's Summary page (templates/summary.html.j2): the
// player, the headline counts, the armor to purge by reason and the data
// sources panel.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import { saveSourceStatus } from '../../src/source-status.ts'
import * as c from '../helpers.ts'
import { renderReport, reportPage } from './helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

// A rifle in three copies, two with a wishlist match and one no list covers;
// a set past its cap of 1 in a slot; and two copies of an exotic.
function vault(): void {
  c.addWeaponDef(db, 100, { sockets: [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A] })
  for (const [instanceId, matches, covered] of [
    ['w1', 1, 1],
    ['w2', 1, 1],
    ['w3', 0, 0],
  ] as const) {
    c.addCopy(db, instanceId, 100, [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A], { gearTier: 5 })
    db.exec('INSERT INTO weapon_result VALUES (?, ?, ?)', { bind: [instanceId, matches, covered] })
  }
  c.addPreference(db, 'Test Set', 'F', 1, ['health'])
  c.addArmor(db, 'a1', { health: 30 }, { setName: 'Test Set', score: 90 })
  c.addArmor(db, 'a2', { health: 25 }, { setName: 'Test Set', score: 75 })
  c.addArmor(db, 'e1', { melee: 30 }, { exotic: true, name: 'Test Exotic', score: 80 })
  c.addArmor(db, 'e2', { melee: 20 }, { exotic: true, name: 'Test Exotic', score: 60 })
}

function summaryPage(): string {
  const [html] = renderReport(db)
  return reportPage(html, 'summary')
}

test('the header names the player and its button copies every purge', () => {
  vault()
  const page = summaryPage()
  expect(page).toContain('Name<span>#1234</span>')
  expect(page).toContain('class="dim purge" data-q="id:a2 or id:e2">Copy purge IDs</button>')
})

test('the headline counts', () => {
  // The live vault's are 615 weapons, 499 armor pieces, 79 to review, 224
  // copies with matches, 155 missing entries and 86 to purge.
  vault()
  const page = summaryPage()
  expect(page).toContain('<b class="num">3</b> weapons</span><span><b class="num">4</b> armor pieces')
  expect(page).toContain('<span class="num">1</span> to review')
  for (const [n, fact] of [
    [0, 'true duplicates'],
    [2, 'copies with wishlist matches'],
    [1, 'copies missing wishlist entries'],
  ]) {
    expect(page).toContain(`<dt class="num">${n}</dt><dd>${fact}</dd>`)
  }
  expect(page).toContain('<span class="num purge">2</span> to purge')
})

test('the purge split by reason', () => {
  // Most first; here one each: a piece past its set's cap, an extra exotic
  // copy and a legacy piece.
  vault()
  c.addArmor(db, 'old', { health: 10 }, { setName: 'Old Set', tuning: [], gearTier: null })
  const page = summaryPage()
  const reasons = [...page.matchAll(/<span class="num">(\d+)<\/span><span>([^<]+)<\/span><\/li>/g)]
  expect(reasons.map((m) => [m[1], m[2]])).toEqual([
    ['1', 'Low score'],
    ['1', 'Extra exotic copies'],
    ['1', 'Legacy, before Armor 3.0'],
  ])
})

test.each([
  ['all up to date', 'fresh', 'All 6 up to date', '<span class="status">Up to date</span>'],
  [
    'one stale',
    'stale',
    '1 source has a problem',
    '<span class="status bad">Download failed: the last good copy is used</span>',
  ],
])('the data sources panel says whether every source is up to date: %s', (_, aegis, state, cell) => {
  vault()
  for (const source of ['manifest', 'profile', 'dim', 'clarity', 'perk_popularity']) {
    saveSourceStatus(db, source, 'fresh')
  }
  saveSourceStatus(db, 'aegis', aegis)
  const page = summaryPage()
  expect(page).toContain(state)
  expect(page).toContain(cell)
})
