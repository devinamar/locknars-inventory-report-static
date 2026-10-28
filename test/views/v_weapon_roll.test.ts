// Tests for v_weapon_roll (schema/views/v_weapon_roll.sql): the perks each
// weapon copy can equip in each perk socket, read from rows written the way the
// profile extract writes them.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

const SOCKETS = c.WEAPON_SOCKETS

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

// [[socket index, kind, [perk names in order]]] from v_weapon_roll.
function roll(instanceId: string) {
  const rows = db.selectArrays(
    'SELECT socket_idx, kind, perk FROM v_weapon_roll WHERE instance_id = ? ORDER BY socket_idx, position',
    [instanceId],
  )
  const sockets = Map.groupBy(rows, ([idx, kind]) => `${idx} ${kind}`)
  return [...sockets.values()].map((socket) => [socket[0][0], socket[0][1], socket.map(([, , perk]) => perk)])
}

test('roll lists each perk socket and its options', () => {
  c.addWeaponDef(db, 100)
  const reusable = {
    1: [c.BARREL_PERK_X, c.BARREL_PERK_Y],
    2: [c.MAG_PERK_P, c.MAG_PERK_Q],
    3: [c.TRAIT_PERK_A, c.TRAIT_PERK_B],
    4: [c.TRAIT_PERK_C, c.TRAIT_PERK_D],
  }
  c.addCopy(db, 'w1', 100, SOCKETS, { reusable })
  // The intrinsic offers no choice and the masterwork isn't a perk.
  expect(roll('w1')).toEqual([
    [1, 'barrel', ['Hammer-Forged Rifling', 'Fluted Barrel']],
    [2, 'magazine', ['Appended Mag', 'Tactical Mag']],
    [3, 'trait', ['Rampage', 'Kill Clip']],
    [4, 'trait', ['Outlaw', 'Subsistence']],
    [5, 'origin', ["Vanguard's Vindication"]],
  ])
})

test('switchable intrinsic is a perk socket', () => {
  // Ergo Sum: each copy can switch its intrinsic.
  c.addWeaponDef(db, 100)
  const reusable = { 0: [c.INTRINSIC_ADAPTIVE, c.INTRINSIC_AGGRESSIVE] }
  c.addCopy(db, 'w1', 100, SOCKETS.slice(0, 1), { reusable })
  expect(roll('w1')).toEqual([[0, 'intrinsic', ['Adaptive Frame', 'Aggressive Frame']]])
})

test("perks follow the game's order", () => {
  // The plugged perk keeps its place in the game's list; one the list leaves
  // out comes first.
  c.addWeaponDef(db, 100)
  c.addCopy(db, 'listed', 100, SOCKETS.slice(0, 4), { reusable: { 3: [c.TRAIT_PERK_B, c.TRAIT_PERK_A] } })
  c.addCopy(db, 'unlisted', 100, SOCKETS.slice(0, 4), { reusable: { 3: [c.TRAIT_PERK_B, c.TRAIT_PERK_C] } })
  expect(roll('listed').at(-1)).toEqual([3, 'trait', ['Kill Clip', 'Rampage']])
  expect(roll('unlisted').at(-1)).toEqual([3, 'trait', ['Rampage', 'Kill Clip', 'Outlaw']])
})

test('options of another category are left out', () => {
  c.addWeaponDef(db, 100)
  c.addCopy(db, 'w1', 100, SOCKETS.slice(0, 4), { reusable: { 3: [c.TRAIT_PERK_A, c.BARREL_PERK_X] } })
  expect(roll('w1').at(-1)).toEqual([3, 'trait', ['Rampage']])
})

test('empty socket has no perks', () => {
  c.addWeaponDef(db, 100)
  c.addCopy(db, 'w1', 100, [null, null, null, c.TRAIT_PERK_A])
  expect(roll('w1')).toEqual([[3, 'trait', ['Rampage']]])
})
