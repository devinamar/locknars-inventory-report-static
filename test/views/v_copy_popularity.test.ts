// Tests for v_copy_popularity (schema/views/v_copy_popularity.sql): each
// copy's score per side, how close its roll is to what players run, and its
// rank on its card.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

const GUN_COLUMNS = [
  c.popularityColumn('barrel', [
    ['Fluted Barrel', 0.5],
    ['Hammer-Forged Rifling', 0.25],
  ]),
  c.popularityColumn('magazine', [['Tactical Mag', 1]]),
  c.popularityColumn('traits', [
    ['Kill Clip + Outlaw', 0.8],
    ['Rampage + Outlaw', 0.4],
  ]),
  c.popularityColumn('trait1', [
    ['Kill Clip', 0.8],
    ['Rampage', 0.2],
  ]),
  c.popularityColumn('trait2', [['Outlaw', 1]]),
]

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

function scores() {
  return db.selectArrays(
    'SELECT instance_id, side, round(score, 4), slots, rank FROM v_copy_popularity ORDER BY side, rank',
  )
}

function addResult(instanceId: string, matchCount: number) {
  db.exec('INSERT INTO weapon_result VALUES (?, ?, 1)', { bind: [instanceId, matchCount] })
}

test('a copy scores its best perk per slot with its traits as one pair', () => {
  // a: Hammer-Forged Rifling, half the top barrel's share; Appended Mag,
  // unvoted in a scored column; Rampage + Outlaw, half the top pair's. b can
  // switch to Kill Clip, making the top pair. The origin has no scores, so it
  // isn't a slot; on PvP nothing is scored.
  c.addWeaponDef(db, 100, { name: 'Gun' })
  c.addPopularity(db, 'Gun', [100], { columns: GUN_COLUMNS })
  c.addCopy(db, 'a', 100, c.WEAPON_SOCKETS)
  c.addCopy(db, 'b', 100, c.WEAPON_SOCKETS, { reusable: { 3: [c.TRAIT_PERK_A, c.TRAIT_PERK_B] } })
  expect(scores()).toEqual([
    ['b', 'pve', 0.5, 3, 1],
    ['a', 'pve', 0.3333, 3, 2],
    ['a', 'pvp', null, 0, 1],
    ['b', 'pvp', null, 0, 2],
  ])
  expect(
    db.selectArrays(
      'SELECT instance_id, pair, pair_share, pair_rank FROM v_copy_popularity ' +
        "WHERE side = 'pve' ORDER BY instance_id",
    ),
  ).toEqual([
    ['a', 'Rampage + Outlaw', 0.4, 2],
    ['b', 'Kill Clip + Outlaw', 0.8, 1],
  ])
})

test('without pair scores, each trait column is a slot', () => {
  // Rampage is a quarter of the top first trait, Outlaw the top second.
  c.addWeaponDef(db, 100, { name: 'Gun' })
  c.addPopularity(db, 'Gun', [100], { columns: GUN_COLUMNS.slice(3) })
  c.addCopy(db, 'a', 100, c.WEAPON_SOCKETS)
  expect(scores()[0]).toEqual(['a', 'pve', 0.625, 2, 1])
})

test('copies tied on score rank by wishlist matches, gear tier, then id', () => {
  // No scores at all: every copy ties, so z's wishlist match puts it first,
  // then the higher gear tier, then the lower id.
  c.addWeaponDef(db, 100, { name: 'Gun' })
  for (const [instanceId, gearTier, matchCount] of [
    ['x', 3, 0],
    ['y', 5, 0],
    ['z', 1, 1],
    ['w', 3, 0],
  ] as const) {
    c.addCopy(db, instanceId, 100, c.WEAPON_SOCKETS, { gearTier })
    addResult(instanceId, matchCount)
  }
  const ranked = scores()
    .filter((r) => r[1] === 'pve')
    .map((r) => r[0])
  expect(ranked).toEqual(['z', 'y', 'w', 'x'])
})
