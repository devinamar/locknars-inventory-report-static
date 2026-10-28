// Tests for the report's Markdown copy (templates/report.md.j2), written so an
// LLM can review the analysis: every section explains itself, and the lists
// match the HTML's.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import { STAT_KEYS } from '../../build/db.ts'
import * as c from '../helpers.ts'
import { count, renderReport } from './helpers.ts'

const RPM = Number(Object.entries(STAT_KEYS).find(([, key]) => key === 'rpm')![0])

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

// Two rifle copies; a set past its cap of 1 with one piece kept for a build;
// a set with nothing flagged, which only the Markdown lists; a duplicated
// exotic; and the player's own wishlist.
function vault(): void {
  c.addWeaponDef(db, 100, { sockets: [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A] })
  c.addPopularity(db, 'Test Rifle', [100], {
    players: 120,
    hardCopies: 60,
    columns: [
      c.popularityColumn('barrel', [['Fluted Barrel', 0.6]], 110),
      c.popularityColumn('traits', [['Rampage + Outlaw', 0.5]], 40),
      c.popularityColumn('trait1', [['Rampage', 0.7]], 40),
    ],
  })
  for (const instanceId of ['w1', 'w2']) {
    c.addCopy(db, instanceId, 100, [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A], { gearTier: 5 })
    db.exec('INSERT INTO weapon_result VALUES (?, 0, 0)', { bind: [instanceId] })
  }
  c.addPreference(db, 'Test Set', 'F', 1, ['health'])
  c.addArmor(db, 'a1', { health: 30 }, { setName: 'Test Set', score: 90 })
  c.addArmor(db, 'a2', { health: 25 }, { setName: 'Test Set', tuning: ['melee'], score: 75 })
  c.addArmor(db, 'a4', { melee: 20 }, { setName: 'Test Set', tuning: ['melee'], score: 60 })
  c.addArmor(db, 'k1', { grenade: 30 }, { setName: 'Kept Set', slot: 'Gauntlets', score: 90 })
  c.addArmor(db, 'e1', { melee: 30 }, { exotic: true, name: 'Test Exotic', score: 80 })
  c.addArmor(db, 'e2', { melee: 20 }, { exotic: true, name: 'Test Exotic', score: 60 })
  db.exec("INSERT INTO armor_rescue VALUES ('a4', 'health', 'melee', 'grenade', 100)")
  db.exec("INSERT INTO wishlist_preference VALUES ('mine', 'Mine', 'https://example.com/w/mine.txt')")
}

test('every section explains itself', () => {
  // Summary, Data sources, True duplicates, Roll Quality, Popular, Armor
  // sets, Builds, Exotics and Preferences each say what they show, how it
  // was derived and how to read it.
  vault()
  const [, md] = renderReport(db)
  expect(md.startsWith('# Name#1234: Destiny 2 Inventory Report')).toBe(true)
  for (const heading of ['**What this shows.**', '**How it was derived.**', '**Reading it.**']) {
    expect(count(md, heading)).toBe(9)
  }
})

test('Popular lists every scored weapon with its picks and pairs', () => {
  // The Test Rifle's weakest column (its traits, 40 votes) makes it medium;
  // 60 of its 120 copies came from hard content, so it is an Endgame pick.
  vault()
  const [, md] = renderReport(db)
  expect(md).toContain('### PvE (1 weapons)')
  expect(md).toContain(
    '| 1 | Test Rifle | Auto Rifle | 120 | medium | yes | Barrel Fluted Barrel 60% · ' +
      'Trait 1 Rampage 70% | Rampage + Outlaw 50% |',
  )
})

test('the lists cover copies, purges, sets and preferences', () => {
  vault()
  const [, md] = renderReport(db)
  expect(md).toContain(
    '1. `id:w1`: PvE 100% (#1), gear tier 5, missing wishlist entries, not locked\n' +
      '   - Trait 1: Rampage (PvE 70% #1)\n',
  )
  expect(md).toContain('Purge `id:e2`')
  expect(md).toContain('#### Kept Set')
  expect(md).toContain('| F | Test Set | health ×3 |')
  expect(md).toContain('| Mine | mine | https://example.com/w/mine.txt |')
})

test("a card names its RPM, season and source, and each copy's kills and trash", () => {
  // Voltron's only roll for the rifle trashes it whole, naming no perks, so
  // no list covers it; w1 fits that roll. Without scores the copies keep
  // their instance order.
  db.exec("INSERT INTO DestinyCollectibleDefinition VALUES (9, 'Source: Exotic Archive at the Tower')")
  c.addWeaponDef(db, 100, { traitIds: '["releases.v970.core"]', collectibleHash: 9, ammoType: 1 })
  for (const instanceId of ['w1', 'w2']) {
    c.addCopy(db, instanceId, 100, [...c.WEAPON_SOCKETS, c.KILL_TRACKER], {
      stats: { [RPM]: 140 },
      objectives: { [c.KILL_TRACKER]: [[c.ENEMIES_DEFEATED, 1745]] },
      gearTier: 5,
    })
  }
  db.exec("INSERT INTO weapon_result VALUES ('w1', 0, 1)")
  db.exec("INSERT INTO weapon_result VALUES ('w2', 0, 1)")
  db.exec("INSERT INTO wishlist_source (key, label, url) VALUES ('voltron', 'V', '')")
  db.exec("INSERT INTO wishlist_roll (roll_id, source_key, item_hash, is_trash) VALUES (1, 'voltron', 100, 1)")
  db.exec("INSERT INTO instance_wishlist_match VALUES ('w1', 1)")
  const [, md] = renderReport(db)
  expect(md).toContain(
    'Auto Rifle, primary ammo, Adaptive Frame, Kinetic, 140 RPM, S28 Monument of Triumph, ' +
      'Source: Exotic Archive at the Tower. DIM: `',
  )
  expect(md).toContain(
    '1. `id:w1`: gear tier 5, missing wishlist entries, ' +
      'trash in Voltron (Pandapaxxy/Mercules +trash), 1,745 PvE kills, not locked',
  )
  expect(md).toContain('2. `id:w2`: gear tier 5, missing wishlist entries, 1,745 PvE kills, not locked')
})

test("a copy's perks carry their shares, marks and the favourites it lacks", () => {
  // w1 rolls Rampage and Outlaw. It completes Mine's Rampage roll, not its
  // Outlaw and Kill Clip roll. Players favour Kill Clip and Kill Clip +
  // Outlaw on PvE.
  const sockets = [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A, c.TRAIT_PERK_C]
  c.addWeaponDef(db, 100, { sockets })
  c.addPopularity(db, 'Test Rifle', [100], {
    columns: [
      c.popularityColumn('traits', [
        ['Kill Clip + Outlaw', 0.6],
        ['Rampage + Outlaw', 0.3],
      ]),
      c.popularityColumn('trait1', [
        ['Kill Clip', 0.7],
        ['Rampage', 0.3],
      ]),
      c.popularityColumn('trait2', [['Outlaw', 1.0]]),
    ],
  })
  c.addCopy(db, 'w1', 100, sockets)
  db.exec("INSERT INTO weapon_result VALUES ('w1', 1, 1)")
  db.exec("INSERT INTO wishlist_preference VALUES ('mine', 'Mine', '')")
  db.exec("INSERT INTO wishlist_source (key, label, url) VALUES ('mine', 'Mine', '')")
  for (const roll of [
    [1, c.TRAIT_PERK_A, null],
    [2, c.TRAIT_PERK_C, c.TRAIT_PERK_B],
  ]) {
    db.exec("INSERT INTO wishlist_roll (roll_id, source_key, item_hash, perk1, perk2) VALUES (?, 'mine', 100, ?, ?)", {
      bind: roll,
    })
  }
  db.exec("INSERT INTO instance_wishlist_match VALUES ('w1', 1)")
  const [, md] = renderReport(db)
  expect(md).toContain(
    '1. `id:w1`: PvE 50% (#1), gear tier none, wishlist rolls completed: 1 Mine, not locked\n' +
      '   - Trait 1: Rampage ★ (PvE 30% #2); PvE favourite Kill Clip 70%\n' +
      '   - Trait 2: Outlaw ☆ (PvE 100% #1)\n' +
      '   - Trait pair: PvE Rampage + Outlaw 30% #2 (favourite Kill Clip + Outlaw 60%)\n',
  )
})
