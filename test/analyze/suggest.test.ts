// Tests for the stat suggestions (src/analyze/prefs/suggest.ts), guessed from
// set-bonus and exotic text. Ported from d2-inventory-report's
// tests/analyze/prefs/test_suggest.py.
import { expect, test } from 'vitest'
import { suggestStats } from '../../src/analyze/prefs/suggest.ts'

test('healing and melee text suggests health then melee', () => {
  const out = suggestStats(
    'Performing a finisher heals you and starts health regeneration.',
    'Your melee hits release a burst.',
  )
  expect(out[0]).toBe('health')
  expect(out).toContain('melee')
})

test('weapon text suggests weapons', () => {
  const out = suggestStats('Bow, Shotgun, or Sword final blows; reload and handling bonus.')
  expect(out[0]).toBe('weapons')
})

test("a grenade launcher isn't the grenade stat", () => {
  const out = suggestStats('Final blows with a Rocket Launcher or Grenade Launcher.')
  expect(out[0]).toBe('weapons')
  expect(out).not.toContain('grenade')
})

test('no text suggests nothing', () => {
  expect(suggestStats('', null)).toEqual([])
})
