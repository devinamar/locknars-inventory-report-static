// Tests for v_gear_tier (schema/views/v_gear_tier.sql): the pip image for
// each gear tier, from the manifest's item constants.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test('each gear tier gets its pip image', () => {
  // The first path is tier 1's; an empty path gives no row.
  db.exec('INSERT INTO DestinyInventoryItemConstantsDefinition (hash, gearTierOverlayImagePaths) VALUES (1, ?)', {
    bind: [JSON.stringify(['/t1.png', '', '/t3.png'])],
  })
  expect(db.selectArrays('SELECT tier, url FROM v_gear_tier ORDER BY tier')).toEqual([
    [1, 'https://www.bungie.net/t1.png'],
    [3, 'https://www.bungie.net/t3.png'],
  ])
})
