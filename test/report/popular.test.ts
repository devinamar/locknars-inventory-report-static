// Tests for the report's Popular page (templates/popular.html.j2): the side
// switch, the toolbar's filters, and each scored weapon's row, which opens its
// grid.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'
import { renderReport, reportPage } from './helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

function popularPage(): string {
  const [html] = renderReport(db)
  return reportPage(html, 'popular')
}

// Gun (Pantheon), one trait pool of Gun, rank 3 on PvE, Endgame there, its
// trait column scored; Rifle rank 1 on PvP. The vault holds a Gun.
function addScored(): void {
  c.addWeaponDef(db, 100, { name: 'Gun', ammoType: 2 })
  c.addWeaponDef(db, 200, { name: 'Rifle', ammoType: 1 })
  c.addPopularity(db, 'Gun (Pantheon)', [100], {
    family: 'Gun',
    rank: 3,
    hardCopies: 60,
    columns: [c.popularityColumn('trait1', [['Rampage', 0.7]], 40)],
  })
  c.addPopularity(db, 'Rifle', [200], { side: 'pvp' })
  c.addCopy(db, 'a', 100)
}

test("the side switch counts each side's weapons and the toolbar offers their kinds", () => {
  addScored()
  const page = popularPage()
  expect(page).toContain(
    '<button type="button" class="side-pve" data-value="pve" aria-pressed="true">' +
      'PvE <span class="num">1</span></button>',
  )
  expect(page).toContain('<option>Auto Rifle</option>')
  expect(page).toContain('<button type="button" data-value="Kinetic Weapons" aria-pressed="false">Kinetic</button>')
  expect(page).toContain('data-value="special" aria-pressed="false"><img src=')
  expect(page).toContain('<div class="switch flip" role="group" aria-label="Vault">')
})

test('a row names its pool, badges and most picked, and opens its grid', () => {
  addScored()
  const page = popularPage()
  const pve = page.split('<div class="pops" data-side="pve">')[1].split('</article>')[0]
  expect(pve).toContain(
    '<article class="card pop-row" data-n="gun (pantheon)" data-type="Auto Rifle" ' +
      'data-slot="Kinetic Weapons" data-ammo="special" data-element="Kinetic" data-owned="">',
  )
  expect(pve).toContain('<span class="pop-rank">#3</span>')
  expect(pve).toContain('<span class="fam-title">Gun<img class="ammo"')
  expect(pve).toContain('<span class="fam-pool">(Pantheon)</span>')
  expect(pve).toContain('<span class="cert pve" tabindex="0" data-tip="e-pve-100">')
  expect(pve).toContain('<i class="tp" data-tip="p1001"></i>')
  expect(pve).toContain('class="pop-chip heat-mid" tabindex="0" data-tip="c-pve-100">Medium confidence')
  expect(pve).toContain('<div class="pop-body" id="pv-pve-100" data-g="100" hidden></div>')
  expect(page).toContain('<div class="pops" data-side="pvp" hidden>')
})

test("the Element filter offers the scored weapons' elements and each row names its", () => {
  // Gun's versions are Arc (the one it's shown as) and Kinetic, as reissues
  // changed some weapons' elements; Rifle is Strand. The filter, after Ammo,
  // offers just those three, All first, in the game's order (Kinetic before
  // Arc) with the manifest's icons. Gun's row names both its elements in that
  // order, under its name, for the filter to match either.
  db.exec("UPDATE DestinyDamageTypeDefinition SET icon = '/' || lower(name) || '.png'")
  c.addWeaponDef(db, 100, { name: 'Gun', damageType: 2 })
  c.addWeaponDef(db, 101, { name: 'Gun' })
  c.addWeaponDef(db, 200, { name: 'Rifle', damageType: 7 })
  c.addPopularity(db, 'Gun', [100, 101])
  c.addPopularity(db, 'Rifle', [200], { rank: 2 })
  const page = popularPage()
  const icon = (name: string) => `https://www.bungie.net/${name.toLowerCase()}.png`
  const button = (name: string) =>
    `<button type="button" data-value="${name}" aria-pressed="false"><img src="${icon(name)}" alt="">${name}</button>`
  expect(page).toContain(
    'aria-label="Ammo" data-filter="ammo"><button type="button" data-value="" aria-pressed="true">All</button></div>\n' +
      '<div class="switch multi" role="group" aria-label="Element" data-filter="element">' +
      '<button type="button" data-value="" aria-pressed="true">All</button>' +
      ['Kinetic', 'Arc', 'Strand'].map(button).join('') +
      '</div>\n<div class="switch flip" role="group" aria-label="Vault">',
  )
  const badge = (name: string) => `<span class="element"><img src="${icon(name)}" alt="" loading="lazy">${name}</span>`
  const gun = page.split('data-n="gun"')[1].split('</article>')[0]
  expect(gun).toMatch(/^ data-type="Auto Rifle" data-slot="Kinetic Weapons" data-ammo="" data-element="Kinetic Arc">/)
  expect(gun).toContain(`</h5>\n<span class="elements">${badge('Kinetic')}${badge('Arc')}</span>\n<span class="sub2">`)
  expect(page).toContain(`<span class="elements">${badge('Strand')}</span>`)
})

test('a weapon you have a card for goes to it', () => {
  // The vault's Gun is on a Roll Quality card, so its row goes there; no copy
  // of Rifle is, so its row has no button.
  addScored()
  const page = popularPage()
  const pve = page.split('<div class="pops" data-side="pve">')[1].split('</article>')[0]
  const pvp = page.split('<div class="pops" data-side="pvp"')[1].split('</article>')[0]
  expect(pve).toContain(
    '<div class="fam-links"><a class="lgg" href="https://www.light.gg/db/items/100/" ' +
      'target="_blank" rel="noopener">light.gg</a>' +
      '<button type="button" class="goto" data-goto="100">My Copies</button></div>',
  )
  expect(pvp).not.toContain('class="goto"')
})

test('without scores the page says so', () => {
  c.addWeaponDef(db, 100)
  c.addCopy(db, 'a', 100)
  const page = popularPage()
  expect(page).toContain('No scores are stored yet')
})
