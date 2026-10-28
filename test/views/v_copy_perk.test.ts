// Tests for v_copy_perk (schema/views/v_copy_perk.sql): each copy's perks per
// socket, with the column each is scored in.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test("a copy's trait sockets are numbered in socket order", () => {
  c.addWeaponDef(db, 100)
  c.addCopy(db, 'a', 100, c.WEAPON_SOCKETS, { reusable: { 3: [c.TRAIT_PERK_A, c.TRAIT_PERK_B] } })
  expect(db.selectArrays('SELECT socket_idx, col, perk FROM v_copy_perk ORDER BY socket_idx, position')).toEqual([
    [1, 'barrel', 'Hammer-Forged Rifling'],
    [2, 'magazine', 'Appended Mag'],
    [3, 'trait1', 'Rampage'],
    [3, 'trait1', 'Kill Clip'],
    [4, 'trait2', 'Outlaw'],
    [5, 'origin', "Vanguard's Vindication"],
  ])
})
