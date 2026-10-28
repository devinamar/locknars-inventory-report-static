// Tests for the report's Weapons page (templates/weapons.html.j2): Roll
// Quality's sections, its cards (one per scored weapon, else per family) with
// their headers, switches and pickers, and each copy's entry: its places and
// scores per side, wishlists, trash, RPM, season, drop source and kills.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import { STAT_KEYS } from '../../build/db.ts'
import * as c from '../helpers.ts'
import { count, index, renderReport, reportPage } from './helpers.ts'

const RPM = Number(Object.entries(STAT_KEYS).find(([, key]) => key === 'rpm')![0])

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

// Copies of the Test Rifle (100), w1, w2, ..., one per trait perk, with their
// weapon_result rows.
function rifleCopies(perks = [c.TRAIT_PERK_A, c.TRAIT_PERK_A], matchCount = 0): void {
  c.addWeaponDef(db, 100, { sockets: [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A] })
  perks.forEach((perk, i) => {
    c.addCopy(db, `w${i + 1}`, 100, [c.INTRINSIC_ADAPTIVE, perk], { gearTier: 5 })
    db.exec('INSERT INTO weapon_result VALUES (?, ?, ?)', { bind: [`w${i + 1}`, matchCount, matchCount] })
  })
}

// d2-perk-popularity scores the Test Rifle on PvE: Kill Clip on 70% of its
// trait column's votes, Rampage on 30% (medium confidence).
function scoreRifle(popularity: { rank?: number; hardCopies?: number } = {}): void {
  c.addPopularity(db, 'Test Rifle', [100], {
    columns: [
      c.popularityColumn('trait1', [
        ['Kill Clip', 0.7],
        ['Rampage', 0.3],
      ]),
    ],
    ...popularity,
  })
}

// The player's own wishlist, the fourth after the three defaults.
function addMyList(url = 'https://example.com/w/mine.txt'): void {
  db.exec("INSERT INTO wishlist_preference VALUES ('mine', 'Mine', ?)", { bind: [url] })
}

// A roll of sourceKey's for the Test Rifle naming perk (none for a roll
// naming no perks), its source stored first.
function addRoll(rollId: number, sourceKey: string, perk: number | null, isTrash = 0): void {
  db.exec("INSERT OR IGNORE INTO wishlist_source (key, label, url) VALUES (?, ?, '')", {
    bind: [sourceKey, sourceKey],
  })
  db.exec('INSERT INTO wishlist_roll (roll_id, source_key, item_hash, perk1, is_trash) VALUES (?, ?, 100, ?, ?)', {
    bind: [rollId, sourceKey, perk, isTrash],
  })
}

function weaponsPage(): string {
  const [html] = renderReport(db)
  return reportPage(html, 'weapons')
}

// Copy k's picker entry.
function entry(page: string, k: number): string {
  return page.split(`<div class="pr" data-k="${k}"`)[1].split('</button>\n<button')[0]
}

test('Roll Quality groups the cards by slot and weapon type', () => {
  // Each section counts its cards and opens them all by the double chevron
  // leading it; a card, closed at first, opens by its name on its picker and
  // the grid it clones (data-g). The Popularity switch leads the page's.
  rifleCopies()
  const page = weaponsPage()
  expect(page).toContain('<h3>Kinetic <span class="num count">1</span></h3></summary>')
  expect(page).toContain('<summary><button type="button" class="expand" aria-expanded="false"')
  expect(page).toContain('aria-controls="fam-100"')
  expect(page).toContain('id="fam-100" hidden')
  expect(page).toContain('<div class="picker" role="radiogroup" aria-label="Test Rifle copies">')
  expect(page).toContain('<div class="rp-main" data-g="100"></div>')
  expect(page).toContain('<span class="copy-count">2 copies</span>')
  expect(page).toContain('href="https://www.light.gg/db/items/100/"')
  expect(page).toContain('<div class="switch side" role="group" aria-label="Popularity">')
})

test('a family whose versions roll different pools is a card per pool', () => {
  // Gun (Pantheon) is the scored weapon for version 100; version 101, which
  // no scored weapon lists, makes a card of the family. Each card's title is
  // the family's, the pool on its own line.
  c.addWeaponDef(db, 100, { name: 'Gun' })
  c.addWeaponDef(db, 101, { name: 'Gun' })
  c.addPopularity(db, 'Gun (Pantheon)', [100], { family: 'Gun' })
  for (const [instanceId, itemHash] of [
    ['a', 100],
    ['b', 101],
  ] as const) {
    c.addCopy(db, instanceId, itemHash)
    db.exec('INSERT INTO weapon_result VALUES (?, 0, 0)', { bind: [instanceId] })
  }
  const page = weaponsPage()
  expect(page).toContain('aria-label="Gun (Pantheon)">')
  expect(page).toContain('aria-label="Gun">')
  expect(page).toContain('<span class="fam-title">Gun</span><span class="fam-pool">(Pantheon)</span>')
  expect(count(page, '<span class="copy-count">1 copy</span>')).toBe(2)
})

test("a card's header gives each side's rank, confidence and Endgame", () => {
  // Scored on PvE only: its rank on the PvE button, a dash on PvP's; the
  // PvE chip in medium's heat, PvP's saying it has no scores; the Endgame
  // badge (60 of its 100 copies from hard content) under its name.
  rifleCopies()
  scoreRifle({ rank: 3, hardCopies: 60 })
  const page = weaponsPage()
  expect(page).toContain(
    '<button type="button" class="side-pve" data-value="pve" aria-pressed="true">' +
      'PvE <span class="num">#3</span></button>',
  )
  expect(page).toContain('aria-pressed="false">PvP <span class="num">—</span></button>')
  expect(page).toContain(
    '<span class="pop-chip heat-mid on-pve" tabindex="0" data-tip="c-pve-100">Medium confidence</span>',
  )
  expect(page).toContain('<span class="pop-chip on-pvp">No PvP scores</span>')
  expect(page).toContain('</h5>\n<span class="endgame"><span class="cert pve" tabindex="0"')
})

test('the picker gives each copy its place and score on each side', () => {
  // w2's Kill Clip is the trait column's favourite (100%, full heat), w1's
  // Rampage 30% against its 70% (43%): w2 leads PvE. PvP has no scores, so
  // no percentage, and the copies keep their instance order there.
  rifleCopies([c.TRAIT_PERK_A, c.TRAIT_PERK_B])
  scoreRifle()
  const page = weaponsPage()
  expect(index(page, '<div class="pr" data-k="2" data-r="1 2">')).toBeLessThan(
    index(page, '<div class="pr" data-k="1" data-r="2 1">'),
  )
  expect(entry(page, 2)).toContain(
    '<span class="copy-n on-pve keep">#1</span><span class="pr-pop on-pve c10">100%</span>' +
      '<span class="copy-n on-pvp">#2</span></span>\n<span class="pr-id">w2</span>',
  )
  expect(entry(page, 1)).toContain(
    '<span class="copy-n on-pve">#2</span><span class="pr-pop on-pve c4">43%</span>' +
      '<span class="copy-n on-pvp keep">#1</span></span>\n<span class="pr-id">w1</span>',
  )
  expect(page).toContain('<button type="button" class="copy-btn" data-q="w1" title="Copy id w1"')
})

test("a copy's entry names the lists it matches as the wishlist switch shows", () => {
  // Voltron (the first list) has a Rampage roll, which w1 completes; Mine has
  // a Kill Clip roll, which no copy does. Each line answers the lists it
  // holds for: w1's Voltron under All lists and Voltron, its No wishlist
  // match under Mine, and Missing wishlist entries under the Aegis lists.
  rifleCopies([c.TRAIT_PERK_A, c.TRAIT_PERK_C], 1)
  addMyList()
  addRoll(1, 'voltron', c.TRAIT_PERK_A)
  addRoll(2, 'mine', c.TRAIT_PERK_B)
  db.exec("INSERT INTO instance_wishlist_match VALUES ('w1', 1)")
  const page = weaponsPage()
  const [w1, w2] = [entry(page, 1), entry(page, 2)]
  expect(w1).toContain(
    '<span data-wl="* voltron"><i class="wl-dot l1" aria-hidden="true"></i>Voltron (Pandapaxxy/Mercules +trash)</span>',
  )
  expect(w1).toContain('<span class="none" data-wl="mine" hidden>No wishlist match</span>')
  expect(w2).toContain('<span class="none" data-wl="* voltron mine">No wishlist match</span>')
  expect(w1).toContain(
    '<span class="none" data-wl="aegis_endgame aegis_shopping" hidden>Missing wishlist entries</span>',
  )
  expect(page).toContain(
    '<article class="card fam" data-side="pve" data-wpn="all dupes listed-* listed-voltron listed-mine Kinetic">',
  )
  expect(page).toContain('<i class="wl-dot l4" aria-hidden="true"></i>Mine</button>')
})

test('a weapon no list covers says so', () => {
  // Dupes shows the rifle, Has wishlist doesn't; each copy is missing
  // entries in every view.
  rifleCopies()
  const page = weaponsPage()
  expect(page).toContain('<article class="card fam" data-side="pve" data-wpn="all dupes Kinetic">')
  expect(entry(page, 1)).toContain(
    '<span class="none" data-wl="* voltron aegis_endgame aegis_shopping">Missing wishlist entries</span>',
  )
})

test('a copy a list trashes says so', () => {
  // Like Voltron's 50 lines trashing a whole weapon (item=-<hash>), which
  // fit every copy; none names a weapon in the live vault today. All lists
  // names every list trashing it, the list's own view just it.
  rifleCopies()
  addRoll(1, 'voltron', null, 1)
  db.exec("INSERT INTO instance_wishlist_match VALUES ('w1', 1)")
  db.exec("INSERT INTO instance_wishlist_match VALUES ('w2', 1)")
  const page = weaponsPage()
  const label = 'Voltron (Pandapaxxy/Mercules +trash)'
  expect(count(page, `<span class="trash" data-wl="*">Trash in ${label}</span>`)).toBe(2)
  expect(count(page, `<span class="trash" data-wl="voltron" hidden>Trash in ${label}</span>`)).toBe(2)
})

test("a card shows its RPM, season and source, or each copy's when they differ", () => {
  // The Test Rifle's copies are Monument of Triumph drops (v970.core, as 151
  // of the live vault's copies are) from the Exotic Archive, at 140 RPM, so
  // its card names them once: the season and source under its name, the RPM
  // under its element and frame. A Sudden Death's copies are an Episode:
  // Heresy drop and a Lawless reissue (its own item hash), here at different
  // RPM too, as Hawthorne's Field-Forged Shotgun's are (80 and 95): each
  // copy names its own.
  db.exec("INSERT INTO DestinyCollectibleDefinition VALUES (9, 'Source: Exotic Archive at the Tower')")
  c.addWeaponDef(db, 100, { traitIds: '["releases.v970.core"]', collectibleHash: 9 })
  c.addWeaponDef(db, 200, { name: 'A Sudden Death', traitIds: '["releases.v820.season"]' })
  c.addWeaponDef(db, 201, { name: 'A Sudden Death', traitIds: '["releases.v950.core"]' })
  for (const [instanceId, itemHash, rpm] of [
    ['w1', 100, 140],
    ['w2', 100, 140],
    ['s1', 200, 80],
    ['s2', 201, 95],
  ] as const) {
    c.addCopy(db, instanceId, itemHash, c.WEAPON_SOCKETS, { stats: { [RPM]: rpm } })
    db.exec('INSERT INTO weapon_result VALUES (?, 0, 0)', { bind: [instanceId] })
  }
  const page = weaponsPage()
  expect(page).toContain(
    '<span class="fam-name"><span class="fam-title">Test Rifle</span><span class="origin">' +
      '<span title="Released 2025-12-02">S28 Monument of Triumph</span>' +
      '<span>Source: Exotic Archive at the Tower</span></span></span>',
  )
  expect(page).toContain('<span class="rpm">RPM: 140</span>\n</span>')
  for (const text of [
    'RPM: 140',
    'S28 Monument of Triumph',
    '<span class="rpm">RPM: 80</span>',
    'S26 Episode: Heresy',
  ]) {
    expect(count(page, text)).toBe(1)
  }
})

test("each copy shows its plugged tracker's kills as DIM does", () => {
  // The count of the tracker plugged into the tracker socket, behind the
  // badge of what it counts. w1's Kill Tracker is plugged, so its Crucible
  // Tracker's 28 doesn't show; w2's Crucible Tracker is plugged, as on one of
  // the live vault's exotics.
  c.addWeaponDef(db, 100)
  const objectives = {
    [c.KILL_TRACKER]: [[c.ENEMIES_DEFEATED, 1745]] as [number, number][],
    [c.CRUCIBLE_TRACKER]: [[c.OPPONENTS_DEFEATED, 28]] as [number, number][],
  }
  for (const [instanceId, plugged] of [
    ['w1', c.KILL_TRACKER],
    ['w2', c.CRUCIBLE_TRACKER],
  ] as const) {
    c.addCopy(db, instanceId, 100, [...c.WEAPON_SOCKETS, plugged], { objectives })
    db.exec('INSERT INTO weapon_result VALUES (?, 0, 0)', { bind: [instanceId] })
  }
  const page = weaponsPage()
  const badges = 'https://www.bungie.net/common/destiny2_content/icons/'
  expect(page).toContain(
    '<span class="kill" title="PvE kills (Kill Tracker)">' +
      `<img src="${badges}31c848643d47d317a9b971214a988d22.png" alt="PvE" loading="lazy">1,745</span>`,
  )
  expect(page).toContain(
    '<span class="kill" title="PvP kills (Crucible Tracker)">' +
      `<img src="${badges}66317c523dd68205dcc753c7563d5068.png" alt="PvP" loading="lazy">28</span>`,
  )
  expect(count(page, '<span class="kill"')).toBe(2)
})

test('a card names its ammo by its name, and its element then frame', () => {
  // Luna's Howl's header: its primary ammo badge right after its name; Solar,
  // then Precision Frame with its icon, stacked beside it.
  c.addWeaponDef(db, 100, { ammoType: 1, sockets: [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A] })
  for (const instanceId of ['w1', 'w2']) {
    c.addCopy(db, instanceId, 100, [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A], { damageType: 3 })
    db.exec('INSERT INTO weapon_result VALUES (?, 0, 0)', { bind: [instanceId] })
  }
  const page = weaponsPage()
  expect(page).toContain(
    'Test Rifle<img class="ammo" src="https://www.bungie.net/img/destiny_content/ammo_types/primary.png" ' +
      'alt="Primary ammo" title="Primary ammo" loading="lazy"></span>',
  )
  expect(page).toContain('<span class="fam-stats">\n<span class="element">')
  expect(page).toContain(
    '<span class="frame"><img src="https://www.bungie.net/img/adaptive.png" alt="" loading="lazy">' +
      'Adaptive Frame</span>',
  )
})

test('copies that differ in element each name theirs', () => {
  // Ergo Sum's copies roll different elements: the header leaves it out and
  // each copy's entry names its own.
  c.addWeaponDef(db, 100, { sockets: [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A] })
  for (const [instanceId, element] of [
    ['w1', 3],
    ['w2', 2],
  ] as const) {
    c.addCopy(db, instanceId, 100, [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A], { damageType: element })
    db.exec('INSERT INTO weapon_result VALUES (?, 0, 0)', { bind: [instanceId] })
  }
  const page = weaponsPage()
  expect(page).toContain('<span class="fam-stats">\n<span class="frame">')
  expect(entry(page, 1)).toContain('>Solar</span>')
  expect(entry(page, 2)).toContain('>Arc</span>')
})

test("the Element switch offers the cards' elements and each card names its copies'", () => {
  // The Test Rifle's copies are Solar and Arc (rolled, not its own Kinetic),
  // the Solo Rifle's its own Kinetic. The switch, a weapons switch after the
  // Weapons row, offers just those three, All first, in the game's order with
  // the manifest's icons; each card names its copies' elements among its
  // switch values, so the Test Rifle shows for either of its own.
  db.exec("UPDATE DestinyDamageTypeDefinition SET icon = '/' || lower(name) || '.png'")
  c.addWeaponDef(db, 100)
  c.addWeaponDef(db, 200, { name: 'Solo Rifle' })
  for (const [instanceId, itemHash, element] of [
    ['w1', 100, 3],
    ['w2', 100, 2],
    ['s1', 200, null],
  ] as const) {
    c.addCopy(db, instanceId, itemHash, c.WEAPON_SOCKETS, { damageType: element })
    db.exec('INSERT INTO weapon_result VALUES (?, 0, 0)', { bind: [instanceId] })
  }
  const page = weaponsPage()
  const button = (name: string) =>
    `<button type="button" data-value="${name}" aria-pressed="false">` +
    `<img src="https://www.bungie.net/${name.toLowerCase()}.png" alt="">${name}</button>\n`
  expect(page).toContain(
    'Has wishlist</button>\n</div>\n</div>\n<div class="switch-row">\n<span class="label">Element</span>\n' +
      '<div class="switch multi" role="group" aria-label="Element" data-key="wpn">\n' +
      '<button type="button" data-value="all" aria-pressed="true">All</button>\n' +
      ['Kinetic', 'Arc', 'Solar'].map(button).join('') +
      '</div>\n</div>',
  )
  expect(page).toContain('<article class="card fam" data-side="pve" data-wpn="all dupes Solar Arc">')
  expect(page).toContain('<article class="card fam" data-side="pve" data-wpn="all Kinetic">')
})

test("a true duplicate goes to its keeper's card", () => {
  // w2 duplicates w1, which is kept: its tile's button opens the Test
  // Rifle's card (named after its version, 100) at w1, now its only copy.
  rifleCopies()
  db.exec("INSERT INTO weapon_pruning VALUES ('w2', 'exact_duplicate', 'w1')")
  const page = weaponsPage()
  expect(page).toContain('<button type="button" class="goto" data-goto="100" data-k="1">My Copies</button>')
})

test("a copy's DIM note is escaped as the CLI escapes it", () => {
  // Third-party text: MarkupSafe's entities for the quotes, the slash as is.
  rifleCopies()
  db.exec("INSERT INTO item_dim VALUES ('w1', 'keep', ?)", { bind: [`Roll "A/B" isn't <best> & co`] })
  const page = weaponsPage()
  expect(page).toContain(
    '<span class="notes">DIM Note: Roll &#34;A/B&#34; isn&#39;t &lt;best&gt; &amp; co</span>',
  )
})
