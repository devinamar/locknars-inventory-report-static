// Tests for the perk grids (templates/grids.html.j2): one template per grid
// with its rows' heat, places, shares, wishlists and copies per side, its pair
// lines with their verdicts and copies, and details lines, then the tooltip
// blocks and the icon and ring rules.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'
import { count, renderReport } from './helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

// Gun rolls Rampage or Kill Clip, then Outlaw or Subsistence; it is scored on
// PvE only, Endgame there (60 of its 100 copies from hard content). Its copy
// has Firefly, which it can't roll, and Voltron (the first list) names Kill
// Clip. traits is its trait pair column's pairs.
function addGun(traits: [string, number][] = [['Kill Clip + Outlaw', 0.7]]): void {
  c.addWeaponDef(db, 100, { name: 'Gun', sockets: [c.INTRINSIC_ADAPTIVE, null, null] })
  c.addPlugSet(db, 100, 1, 901, [
    [c.TRAIT_PERK_A, 1],
    [c.TRAIT_PERK_B, 1],
  ])
  c.addPlugSet(db, 100, 2, 902, [
    [c.TRAIT_PERK_C, 1],
    [c.TRAIT_PERK_D, 1],
  ])
  c.addPopularity(db, 'Gun', [100], {
    hardCopies: 60,
    columns: [
      c.popularityColumn('traits', traits, 120),
      c.popularityColumn(
        'trait1',
        [
          ['Kill Clip', 0.7],
          ['Rampage', 0.3],
        ],
        120,
      ),
      c.popularityColumn('trait2', [['Outlaw', 1.0]], 120),
    ],
  })
  c.addCopy(db, 'a', 100, [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A, c.TRAIT_PERK_E])
  db.exec("INSERT INTO wishlist_source (key, label, url) VALUES ('voltron', 'Voltron', '')")
  db.exec(
    "INSERT INTO wishlist_roll (roll_id, source_key, item_hash, perk1, is_trash) VALUES (1, 'voltron', 100, ?, 0)",
    { bind: [c.TRAIT_PERK_B] },
  )
}

// The part of the report after its pages: the grids and their tooltips.
function grids(): string {
  const [html] = renderReport(db)
  return html.split('</main>')[1]
}

// Gun's grid template.
function gunGrid(): string {
  return grids().split('<template id="g100">')[1].split('</template>')[0]
}

test("a grid's rows carry both sides' heat, places, shares and lists", () => {
  // PvP has no scores: no heat or share there, the game's order, and its
  // traits recede. The copy (1 on its card) has Rampage, and Firefly, which
  // only it has.
  addGun()
  const template = gunGrid()
  expect(template).toContain('<div class="pc" data-col="trait1">')
  expect(template).toContain('<span class="conf on-pvp">no scores</span>')
  expect(template).toContain(
    '<li class="pk a10 bn qb" data-tip="p1002" data-r="1 2" data-a="70%" data-l="1"><span>Kill Clip</span></li>',
  )
  expect(template).toContain(
    '<li class="pk a4 bn qb" data-tip="p1001" data-r="2 1" data-a="30%" data-o="1"><span>Rampage</span></li>',
  )
  expect(template).toContain('class="pk a0 bn qa qb own" data-tip="p1005" data-r="3 3" data-a="—" data-o="1">')
})

test("a grid holds its pairs' lines and each scored side's details", () => {
  // Kill Clip + Outlaw, the top pair, is desired; Rampage + Firefly, which
  // the copy makes and players weren't seen with, is undesirable on PvE,
  // where the pairs' confidence is high. PvP has no pair scores.
  addGun()
  const template = gunGrid()
  expect(template).toContain('<path data-a="p1002" data-b="p1003" data-pve="1 1.0 0.7 g"></path>')
  expect(template).toContain('<path data-a="p1001" data-b="p1005" data-pve="0 0 0 b" data-c="1"></path>')
  expect(template).toContain(
    '<p class="pop-meta on-pve"><span><b>Hard content:</b> 60 copies, 60 effective votes' +
      '</span><span><b>Margin of error:</b> up to ±5 points</span>',
  )
  expect(template).not.toContain('on-pvp"><span><b>Hard content')
  expect(template).not.toContain('light.gg')
})

test("a pair's line prints its rel and share as the CLI does, a REAL with its point", () => {
  // Every pair's share rounds to 0.0 (a REAL), so its rel, share against the
  // top pair's, is the integer 0: Python printed 0 and 0.0.
  addGun([
    ['Kill Clip + Outlaw', 0.0],
    ['Rampage + Outlaw', 0.0],
  ])
  const template = gunGrid()
  expect(template).toContain('<path data-a="p1002" data-b="p1003" data-pve="1 0 0.0 g"></path>')
  expect(template).toContain('<path data-a="p1001" data-b="p1003" data-pve="2 0 0.0 g"></path>')
})

test("a copy's completed roll marks its perks and its pair", () => {
  // The copy completes Mine's roll naming Rampage and Firefly (Mine is the
  // fourth list): both rows name it as the copy's hit, and the pair line
  // names the list; a trash roll of Voltron's naming them marks it too.
  addGun()
  db.exec("INSERT INTO wishlist_preference VALUES ('mine', 'Mine', '')")
  db.exec("INSERT INTO wishlist_source (key, label, url) VALUES ('mine', 'Mine', '')")
  for (const roll of [
    [2, 'mine', c.TRAIT_PERK_A, c.TRAIT_PERK_E, 0],
    [3, 'voltron', c.TRAIT_PERK_A, c.TRAIT_PERK_E, 1],
  ]) {
    db.exec(
      'INSERT INTO wishlist_roll (roll_id, source_key, item_hash, perk1, perk2, is_trash) VALUES (?, ?, 100, ?, ?, ?)',
      { bind: roll },
    )
  }
  db.exec("INSERT INTO instance_wishlist_match VALUES ('a', 2)")
  const template = gunGrid()
  expect(template).toContain('data-tip="p1001" data-r="2 1" data-a="30%" data-l="4" data-o="1" data-h="1:4">')
  expect(template).toContain('data-c="1" data-w="4" data-t="1"></path>')
})

test("a fixed roll's details say it has nothing to pick", () => {
  // Gun is scored with no perk columns, as a fixed-roll exotic like Truth is.
  c.addWeaponDef(db, 100, { name: 'Gun', sockets: [c.INTRINSIC_ADAPTIVE, null] })
  c.addPlugSet(db, 100, 1, 901, [[c.BARREL_PERK_X, 1]])
  c.addPopularity(db, 'Gun', [100])
  c.addCopy(db, 'a', 100)
  const template = gunGrid()
  expect(template).toContain(
    '<span><b>Margin of error:</b> None: a fixed roll, nothing to pick</span>' +
      '<span><b>Normal content:</b> 100 copies, 100 effective votes</span>' +
      '<span><b>Last observed:</b> 23 Oct 2026</span>',
  )
})

test("tooltips cover the perks and each scored weapon's confidence and badge", () => {
  addGun()
  const html = grids()
  expect(html).toContain('<div id="tip-p1002"><b>Kill Clip</b>')
  expect(html).toContain('<div id="tip-c-pve-100"><b>PvE #1 · High confidence</b>')
  expect(html).toContain('120 effective votes in every column')
  expect(html).toContain('<div id="tip-e-pve-100"><b>PvE Endgame</b><p>60% of its PvE copies (60 of 100)')
  expect(html).toContain('Shown from 30% and 50 copies.')
  expect(html).not.toContain('tip-c-pvp-100')
})

test('each perk has its icon and every mix of lists its ring', () => {
  // Three default lists make seven mixes.
  addGun()
  const html = grids()
  expect(html).toContain('[data-tip="p1002"] { --i: url("https://www.bungie.net/img/killclip.png"); }')
  expect(count(html, '{ --tint: ')).toBe(7)
  expect(html).toContain('<span class="wl-name l1">Voltron (Pandapaxxy/Mercules +trash)</span>')
})
