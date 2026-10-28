// Tests for v_weapon_pool (schema/views/v_weapon_pool.sql): the perks each
// weapon definition can roll in each perk socket, from its socket's plug set or
// the inline list of a socket naming none, with the column each is scored in.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test('pool lists what each socket can roll', () => {
  c.addWeaponDef(db, 100, { sockets: [c.INTRINSIC_ADAPTIVE, c.TRAIT_PERK_A] })
  // Rampage is listed twice; either entry rolling makes it rollable. The
  // masterwork isn't a perk.
  c.addPlugSet(db, 100, 1, 900, [
    [c.TRAIT_PERK_A, 0],
    [c.TRAIT_PERK_B, 0],
    [c.MW_PLUG_FULL, 1],
    [c.TRAIT_PERK_A, 1],
  ])
  expect(db.selectArrays('SELECT socket_idx, kind, perk, can_roll FROM v_weapon_pool ORDER BY perk')).toEqual([
    [1, 'trait', 'Kill Clip', 0],
    [1, 'trait', 'Rampage', 1],
  ])
})

test('a socket without a random roll lists the plugs it can switch to', () => {
  // Like A Sudden Death (Adept)'s origin socket, whose 4 origin traits come
  // from the set it can switch to; 5,828 of the live pool's 102,565 rows come
  // from such a set.
  c.addWeaponDef(db, 100, { sockets: [c.INTRINSIC_ADAPTIVE, c.ORIGIN_PERK] })
  c.addPlugSet(db, 100, 1, 901, [[c.ORIGIN_PERK, 1]], 'reusablePlugSetHash')
  expect(db.selectArrays('SELECT socket_idx, kind, perk FROM v_weapon_pool')).toEqual([
    [1, 'origin', "Vanguard's Vindication"],
  ])
})

test('a socket naming no plug set rolls its inline list', () => {
  // Like Mint Retrograde's origin socket, whose options are listed only
  // inline; the masterwork in the list isn't a perk.
  c.addWeaponDef(db, 100, { sockets: [c.INTRINSIC_ADAPTIVE, c.ORIGIN_PERK] })
  c.addInlinePlugs(db, 100, 1, [c.ORIGIN_PERK, c.MW_PLUG_FULL])
  expect(db.selectArrays('SELECT socket_idx, kind, col, perk, can_roll, position FROM v_weapon_pool')).toEqual([
    [1, 'origin', 'origin', "Vanguard's Vindication", 1, 0],
  ])
})

test('trait columns are numbered in socket order', () => {
  // Two versions place their traits at different sockets (3 and 4, then 2 and
  // 3), as Drang's do; each one's first trait socket is trait1.
  for (const [itemHash, first] of [
    [100, 3],
    [101, 2],
  ]) {
    c.addWeaponDef(db, itemHash, { sockets: [c.INTRINSIC_ADAPTIVE, null, null, null, null] })
    c.addPlugSet(db, itemHash, first, itemHash * 10, [[c.TRAIT_PERK_A, 1]])
    c.addPlugSet(db, itemHash, first + 1, itemHash * 10 + 1, [[c.TRAIT_PERK_C, 1]])
  }
  c.addPlugSet(db, 100, 1, 2000, [[c.BARREL_PERK_X, 1]])
  const rows = db.selectArrays(
    'SELECT item_hash, socket_idx, col, perk FROM v_weapon_pool ORDER BY item_hash, socket_idx',
  )
  expect(rows).toEqual([
    [100, 1, 'barrel', 'Hammer-Forged Rifling'],
    [100, 3, 'trait1', 'Rampage'],
    [100, 4, 'trait2', 'Outlaw'],
    [101, 2, 'trait1', 'Rampage'],
    [101, 3, 'trait2', 'Outlaw'],
  ])
})
