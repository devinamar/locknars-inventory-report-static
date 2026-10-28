// Tests for the armor preferences' store (src/analyze/prefs/store.ts):
// lookups by name, and the order preferences are saved and loaded in. Ported
// from d2-inventory-report's tests/analyze/prefs/test_store.py.
import { expect, test } from 'vitest'
import { ciGet, loadPreferences, savePreferences } from '../../src/analyze/prefs/store.ts'
import { testDb } from '../helpers.ts'
import { pref } from './helpers.ts'

test('a name is found whatever its case', () => {
  const prefs = new Map([['Aion Renewal', pref(['melee'])]])
  expect(ciGet(prefs, 'AION RENEWAL')).toEqual(['Aion Renewal', prefs.get('Aion Renewal')])
  expect(ciGet(prefs, 'Techsec')).toEqual([null, null])
})

test('an exact name wins over another case', () => {
  const prefs = new Map([
    ['bushido', pref(['health'])],
    ['Bushido', pref(['melee'])],
  ])
  const [key, value] = ciGet(prefs, 'Bushido')
  expect(key).toBe('Bushido')
  expect(value).toBe(prefs.get('Bushido'))
})

test('saved preferences load with sets by grade and rank then exotics', () => {
  const db = testDb()
  const prefs = new Map([
    ['Heart', pref(['super_stat'], { isExotic: true })],
    ['Bushido', pref(['melee'], { grade: 'A', rank: 1 })],
  ])
  savePreferences(db, prefs)
  expect([...prefs.keys()]).toEqual(['Bushido', 'Heart']) // sets first, exotics after
  expect(loadPreferences(db)).toEqual(prefs)

  prefs.set('Techsec', pref(['grenade', 'health'], { grade: 'S', rank: 0 }))
  savePreferences(db, prefs)
  expect([...loadPreferences(db).keys()]).toEqual(['Techsec', 'Bushido', 'Heart'])
  db.close()
})
