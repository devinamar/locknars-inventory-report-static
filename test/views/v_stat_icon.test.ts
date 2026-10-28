// Tests for v_stat_icon (schema/views/v_stat_icon.sql): the icon of each stat
// the app names.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import * as c from '../helpers.ts'

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test('a stat icon is a full URL', () => {
  const rpm = db.selectValue("SELECT icon FROM v_stat_icon WHERE key = 'rpm'")
  expect(rpm).toBe('https://www.bungie.net/img/rpm.png')
})
