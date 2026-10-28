// Tests for v_popularity_side (schema/views/v_popularity_side.sql): the two
// sides, each with its Endgame badge's icon and its hard content.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test("each side has its activity mode's icon and its hard content", () => {
  // Raid (mode 4) badges PvE and Trials of Osiris (84) PvP; the hard
  // categories keep the published order, the others are left out.
  db.exec('INSERT INTO DestinyActivityModeDefinition VALUES (?, ?, ?, ?), (?, ?, ?, ?)', {
    bind: [1, 4, 'Raid', '/raid.png', 2, 84, 'Trials of Osiris', '/trials.png'],
  })
  c.addPopularityFile(db, [
    ['raid_master', 'Master raid', 'pve', true],
    ['raid', 'Raid', 'pve', false],
    ['gm', 'Grandmaster Vanguard Alert', 'pve', true],
    ['trials', 'Trials of Osiris', 'pvp', true],
  ])
  expect(db.selectArrays('SELECT side, label, icon, hard FROM v_popularity_side')).toEqual([
    ['pve', 'PvE', 'https://www.bungie.net/raid.png', 'Master raid, Grandmaster Vanguard Alert'],
    ['pvp', 'PvP', 'https://www.bungie.net/trials.png', 'Trials of Osiris'],
  ])
})
