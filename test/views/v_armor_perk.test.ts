// Tests for v_armor_perk (schema/views/v_armor_perk.sql): the intrinsic perks
// plugged into each armor copy.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test('armor perks are the plugged intrinsics', () => {
  // The copy's own plug, not the definition's starting one.
  c.addArmorDef(db, 300, { name: 'Heart', setName: '', tier: 6, sockets: [c.INTRINSIC_ADAPTIVE] })
  c.addCopy(db, 'x1', 300, [c.INTRINSIC_AGGRESSIVE])
  const perks = db.selectValues("SELECT perk FROM v_armor_perk WHERE instance_id = 'x1'")
  expect(perks).toEqual(['Aggressive Frame'])
})
