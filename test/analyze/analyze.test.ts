// Tests for the analysis steps (src/analyze/analyze.ts): which sets and
// exotics a run checks for a preference before scoring. Ported from
// d2-inventory-report's tests/analyze/test_analyze.py, where the editor that
// asked about those without one was a stand-in recording what it was given
// (every piece, and no Aegis rankings); here each one checked, and no other,
// gets a preference filled in from those.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import { ensurePreferences } from '../../src/analyze/analyze.ts'
import { type Armor } from '../../src/models.ts'
import { testDb } from '../helpers.ts'
import { makeArmor, makeArmorInst } from './helpers.ts'

let db: Database
beforeEach(() => {
  db = testDb()
  return () => db.close()
})

// An armor copy; no gear tier means legacy, from before Armor 3.0.
function piece(instanceId: string, name: string, gearTier: number | null, armor: Partial<Armor> = {}) {
  return makeArmorInst(makeArmor({ name, setName: '', ...armor }), instanceId, { gearTier })
}

test('every Armor 3.0 set and exotic is checked for a preference', () => {
  // An Armor 3.0 piece of any gear tier brings in its set or exotic, and so
  // do two copies of an exotic of any tier, grouped ignoring case. A legacy
  // piece brings in nothing. With no preferences stored and no Aegis
  // rankings, each is saved unclassified, with the picks its pieces' text
  // suggests (none without text).
  db.exec('DELETE FROM armor_preference')
  const setBonus = { twoPieceBonus: 'Bushido: Finishers heal you.', fourPieceBonus: '' }
  const exoticEffect = { name: 'Mask', description: 'Melee kills grant melee energy.' }
  const pieces = [
    piece('a1', 'Shrewd Survivor Cloak', 2, { setName: 'Shrewd Survivor' }),
    piece('a2', 'Bushido Helm', 5, { setName: 'Bushido', setBonus }),
    piece('a3', 'Frumious Vest', null, { setName: 'Frumious' }),
    piece('x1', 'Solipsism', 5, { isExotic: true }),
    piece('x2', 'Cenotaph Mask', null, { isExotic: true, exoticEffect }),
    piece('x3', 'CENOTAPH MASK', null, { isExotic: true }),
    piece('x4', 'Apotheosis Veil', null, { isExotic: true }),
  ]
  const prefs = ensurePreferences(db, pieces)
  const rows = [
    ['Bushido', 0, 'health', null, null, '', 0],
    ['Shrewd Survivor', 0, null, null, null, '', 0],
    ['Cenotaph Mask', 1, 'melee', null, null, '', 0],
    ['Solipsism', 1, null, null, null, '', 0],
  ]
  const saved = db.selectArrays(
    'SELECT name, is_exotic, stat_1, stat_2, stat_3, grade, rank FROM armor_preference ORDER BY rowid',
  )
  expect(saved).toEqual(rows)
  expect([...prefs.keys()]).toEqual(rows.map(([name]) => name))
})
