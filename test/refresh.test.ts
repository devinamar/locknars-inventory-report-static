// Tests for when the page asks Bungie again by itself (src/refresh.ts): two
// minutes after the last check while it's in view, never while it's hidden
// (the player is likely in the game) or while a refresh runs, and at once on
// coming back into view after that long; and how its status says when it
// last checked.
import { expect, test } from 'vitest'
import { REFRESH_EVERY, ago, refreshDue } from '../src/refresh.ts'

const MINUTE = 60_000
// When the last check ended.
const CHECKED = Date.parse('2026-10-28T10:00:00Z')

test('in view, a check is due two minutes after the last', () => {
  // Also after a reload that showed a new report, which hands the page the
  // check it just made: the data was just fetched.
  expect(REFRESH_EVERY).toBe(2 * MINUTE)
  expect(refreshDue(CHECKED + 2 * MINUTE - 1, CHECKED, true, false)).toBe(false)
  expect(refreshDue(CHECKED + 2 * MINUTE, CHECKED, true, false)).toBe(true)
})

test('never while the page is hidden, nor while a refresh runs', () => {
  // A second refresh at once would ask Bungie twice, and could build twice.
  for (const later of [2 * MINUTE, 3 * 60 * MINUTE]) {
    expect(refreshDue(CHECKED + later, CHECKED, false, false)).toBe(false)
    expect(refreshDue(CHECKED + later, CHECKED, true, true)).toBe(false)
  }
})

test('back in view, at once if the last check is two minutes old or more', () => {
  // The page looks again as it comes into view: after an hour in the game
  // it asks at once; a minute away, it waits out the rest.
  expect(refreshDue(CHECKED + 60 * MINUTE, CHECKED, true, false)).toBe(true)
  expect(refreshDue(CHECKED + MINUTE, CHECKED, true, false)).toBe(false)
})

test('the status says how long ago the last check was', () => {
  const times = [0, MINUTE - 1, MINUTE, 60 * MINUTE - 1, 60 * MINUTE, 150 * MINUTE]
  expect(times.map(ago)).toEqual(['just now', 'just now', '1 min ago', '59 min ago', '1 h ago', '2 h ago'])
})
