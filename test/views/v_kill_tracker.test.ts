// Tests for v_kill_tracker (schema/views/v_kill_tracker.sql): the kill
// trackers on each weapon copy and the count each keeps.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test('kill tracker counts each tracker and marks the plugged one', () => {
  // Each tracker with what it counts, as DIM reads its objective, and the
  // objective's badge. The origin perk's objective isn't a tracker's, so it's
  // left out.
  c.addWeaponDef(db, 100)
  const objectives: Record<number, [number, number][]> = {
    [c.KILL_TRACKER]: [[c.ENEMIES_DEFEATED, 46]],
    [c.CRUCIBLE_TRACKER]: [[c.OPPONENTS_DEFEATED, 12]],
    [c.ORIGIN_PERK]: [[c.ENEMIES_DEFEATED, 5]],
  }
  c.addCopy(db, 'w1', 100, [...c.WEAPON_SOCKETS, c.KILL_TRACKER], { objectives })
  const rows = db.selectArrays(
    'SELECT tracker, kind, description, kills, is_plugged, icon FROM v_kill_tracker ' +
      "WHERE instance_id = 'w1' ORDER BY tracker",
  )
  const icons = 'https://www.bungie.net/common/destiny2_content/icons/'
  expect(rows).toEqual([
    [
      'Crucible Tracker',
      'PvP',
      'Crucible Opponents Defeated',
      12,
      0,
      icons + '66317c523dd68205dcc753c7563d5068.png',
    ],
    ['Kill Tracker', 'PvE', 'Enemies Defeated', 46, 1, icons + '31c848643d47d317a9b971214a988d22.png'],
  ])
})
