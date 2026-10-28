// Tests for v_armor_tuning (schema/views/v_armor_tuning.sql): the stats each
// armor copy's tuning socket can raise.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test('tuning lists the stats the tuning socket can raise', () => {
  // One row per stat a +5 tuning mod raises; Balanced Tuning (+1s) adds none,
  // and a copy without tuning plugs has no rows.
  c.addArmorDef(db, 200, { sockets: [c.TUNING_BALANCED] })
  const options = {
    legendary: [c.TUNING_BALANCED, c.TUNING_HEALTH],
    exotic: [c.TUNING_BALANCED, c.TUNING_HEALTH, c.TUNING_MELEE],
  }
  for (const [instanceId, plugs] of Object.entries(options)) {
    c.addCopy(db, instanceId, 200, [c.TUNING_BALANCED], { reusable: { 0: plugs } })
  }
  c.addCopy(db, 'untuned', 200, [c.TUNING_BALANCED])
  expect(db.selectArrays('SELECT instance_id, stat FROM v_armor_tuning ORDER BY instance_id, stat')).toEqual([
    ['exotic', 'health'],
    ['exotic', 'melee'],
    ['legendary', 'health'],
  ])
})
