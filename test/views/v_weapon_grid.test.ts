// Tests for v_weapon_grid (schema/views/v_weapon_grid.sql): each grid's rows,
// what its versions can roll, what players were seen with and what its copies
// have, with their shares, heat and order per side.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

// Gun: barrels Hammer-Forged Rifling and Fluted Barrel, magazines Appended and
// Tactical Mag, first traits Rampage and Kill Clip, second traits Outlaw and
// Subsistence, each in the game's order.
function addGun(itemHash = 100, name = 'Gun') {
  c.addWeaponDef(db, itemHash, { name, sockets: [c.INTRINSIC_ADAPTIVE, null, null, null, null] })
  for (const [i, plugs] of [
    [c.BARREL_PERK_X, c.BARREL_PERK_Y],
    [c.MAG_PERK_P, c.MAG_PERK_Q],
    [c.TRAIT_PERK_A, c.TRAIT_PERK_B],
    [c.TRAIT_PERK_C, c.TRAIT_PERK_D],
  ].entries()) {
    const idx = i + 1
    c.addPlugSet(db, itemHash, idx, itemHash * 10 + idx, plugs.map((p) => [p, 1]))
  }
}

function grid(...columns: string[]) {
  return db.selectArrays(`SELECT ${columns.join(', ')} FROM v_weapon_grid ORDER BY grid_id, col_order, pve_pos`)
}

test("a grid lists the pool, the votes and its copies' perks", () => {
  // Fluted Barrel never drops: the family's 120 barrel votes never saw it.
  // Appended Mag stays, with 50 magazine votes too few to tell. Vanguard's
  // Vindication is voted though the pool has no origin socket, and Firefly is
  // only the copy's. Rampage, at 0.3 of 0.7, isn't quiet; Subsistence and
  // Firefly, unvoted, are.
  addGun()
  c.addPopularity(db, 'Gun', [100], {
    columns: [
      c.popularityColumn('barrel', [['Hammer-Forged Rifling', 0.8]], 120),
      c.popularityColumn('magazine', [['Tactical Mag', 1]]),
      c.popularityColumn('traits', [['Kill Clip + Outlaw', 0.7]]),
      c.popularityColumn('trait1', [
        ['Kill Clip', 0.7],
        ['Rampage', 0.3],
      ]),
      c.popularityColumn('trait2', [['Outlaw', 1]]),
      c.popularityColumn('origin', [["Vanguard's Vindication", 1]]),
    ],
  })
  const sockets = [c.INTRINSIC_ADAPTIVE, c.BARREL_PERK_X, c.MAG_PERK_P, c.TRAIT_PERK_A, c.TRAIT_PERK_E]
  c.addCopy(db, 'a', 100, sockets)
  // Aegis Endgame (the second list) names Kill Clip and Outlaw, and Voltron
  // (the first) Kill Clip; a trash roll's Rampage isn't named.
  db.exec("INSERT INTO wishlist_source (key, label, url) VALUES (?, ?, ''), (?, ?, '')", {
    bind: ['voltron', 'Voltron', 'aegis_endgame', 'Aegis'],
  })
  for (const roll of [
    [1, 'aegis_endgame', c.TRAIT_PERK_B, c.TRAIT_PERK_C, 0],
    [2, 'voltron', c.TRAIT_PERK_B, null, 0],
    [3, 'voltron', c.TRAIT_PERK_A, null, 1],
  ]) {
    db.exec(
      'INSERT INTO wishlist_roll (roll_id, source_key, item_hash, perk1, perk2, is_trash) ' +
        'VALUES (?, ?, 100, ?, ?, ?)',
      { bind: roll },
    )
  }
  const lists = Object.fromEntries(grid('perk', 'lists'))
  expect([lists['Kill Clip'], lists['Outlaw'], lists['Rampage']]).toEqual(['1 2', '2', ''])
  expect(grid('col', 'label', 'perk', 'own', 'pve_heat', 'pve_pos', 'pve_quiet')).toEqual([
    ['barrel', 'Barrel', 'Hammer-Forged Rifling', 0, 10, 1, 0],
    ['magazine', 'Magazine', 'Tactical Mag', 0, 10, 1, 0],
    ['magazine', 'Magazine', 'Appended Mag', 0, 0, 2, 0],
    ['trait1', 'Trait 1', 'Kill Clip', 0, 10, 1, 0],
    ['trait1', 'Trait 1', 'Rampage', 0, 4, 2, 0],
    ['trait2', 'Trait 2', 'Outlaw', 0, 10, 1, 0],
    ['trait2', 'Trait 2', 'Subsistence', 0, 0, 2, 1],
    ['trait2', 'Trait 2', 'Firefly', 1, 0, 3, 1],
    ['origin', 'Origin', "Vanguard's Vindication", 0, 10, 1, 0],
  ])
})

test("a side without scores keeps the game's order and no heat", () => {
  // Nothing is scored on PvP: the rows keep the game's order, with no share or
  // heat, and every trait recedes.
  addGun()
  c.addPopularity(db, 'Gun', [100], {
    columns: [
      c.popularityColumn('trait1', [
        ['Kill Clip', 0.7],
        ['Rampage', 0.3],
      ]),
    ],
  })
  const rows = grid('perk', 'pvp_share', 'pvp_heat', 'pvp_pos', 'pvp_quiet')
  expect(rows.filter((r) => ['Rampage', 'Kill Clip', 'Hammer-Forged Rifling'].includes(r[0] as string))).toEqual([
    ['Hammer-Forged Rifling', null, null, 1, 0],
    ['Kill Clip', null, null, 2, 1],
    ['Rampage', null, null, 1, 1],
  ])
})

test('a perk another pool of the family was seen with stays', () => {
  // Gun (Raid) never voted Fluted Barrel, but Gun (Pantheon) did: it drops
  // somewhere in the family, so it stays on both.
  addGun(100, 'Gun')
  addGun(101, 'Gun')
  const barrel: [string, number][] = [['Hammer-Forged Rifling', 0.8]]
  c.addPopularity(db, 'Gun (Raid)', [100], {
    family: 'Gun',
    columns: [c.popularityColumn('barrel', barrel, 120)],
  })
  c.addPopularity(db, 'Gun (Pantheon)', [101], {
    family: 'Gun',
    columns: [c.popularityColumn('barrel', [['Fluted Barrel', 0.6]], 20)],
  })
  const rows = grid('grid_id', 'perk')
  expect(
    rows.filter((r) => r[0] === 100 && ['Hammer-Forged Rifling', 'Fluted Barrel'].includes(r[1] as string)),
  ).toEqual([
    [100, 'Hammer-Forged Rifling'],
    [100, 'Fluted Barrel'],
  ])
})

test("a perk only the set's later block lists hides on fewer votes", () => {
  // Each gun's barrel set lists Hammer-Forged Rifling and Fluted Barrel, their
  // enhanced copies, then Full Choke and its enhanced copy, as Adamantite's
  // lists a shotgun's barrels after its own. Gun's 50 barrel votes saw only
  // Hammer-Forged Rifling: too few to drop Fluted Barrel, but enough for Full
  // Choke. Rifle, with 20 votes, keeps all three.
  for (const [hash, name] of [
    [2101, 'Hammer-Forged Rifling'],
    [2102, 'Fluted Barrel'],
    [2003, 'Full Choke'],
    [2103, 'Full Choke'],
  ]) {
    db.exec(
      'INSERT INTO DestinyInventoryItemDefinition ' +
        '(hash, name, description, icon, plugCategoryIdentifier, investmentStats) ' +
        "VALUES (?, ?, '', '', 'barrels', '[]')",
      { bind: [hash, name] },
    )
  }
  for (const [itemHash, name, votes] of [
    [100, 'Gun', 50],
    [200, 'Rifle', 20],
  ] as const) {
    c.addWeaponDef(db, itemHash, { name, sockets: [c.INTRINSIC_ADAPTIVE, null] })
    const barrels = [c.BARREL_PERK_X, c.BARREL_PERK_Y, 2101, 2102, 2003, 2103]
    c.addPlugSet(db, itemHash, 1, itemHash * 10 + 1, barrels.map((h) => [h, 1]))
    const seen: [string, number][] = [['Hammer-Forged Rifling', 1]]
    c.addPopularity(db, name, [itemHash], { columns: [c.popularityColumn('barrel', seen, votes)] })
  }
  expect(grid('grid_id', 'perk')).toEqual([
    [100, 'Hammer-Forged Rifling'],
    [100, 'Fluted Barrel'],
    [200, 'Hammer-Forged Rifling'],
    [200, 'Fluted Barrel'],
    [200, 'Full Choke'],
  ])
})

test('a card no scored weapon lists gets a grid of its own', () => {
  // Rifle isn't scored: its grid is its pool, named after its version, with no
  // scores on either side.
  addGun(200, 'Rifle')
  c.addCopy(db, 'r', 200, [c.INTRINSIC_ADAPTIVE, c.BARREL_PERK_X])
  const rows = grid('grid_id', 'col', 'perk', 'pve_rel', 'pvp_rel')
  expect(rows.slice(0, 2)).toEqual([
    [200, 'barrel', 'Hammer-Forged Rifling', null, null],
    [200, 'barrel', 'Fluted Barrel', null, null],
  ])
  expect(rows).toHaveLength(8)
})
