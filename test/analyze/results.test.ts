// Tests for saving the analysis results (src/analyze/results.ts). Ported
// from d2-inventory-report's tests/analyze/test_results.py.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import { saveArmorRescue, saveArmorScores } from '../../src/analyze/results.ts'
import * as c from '../helpers.ts'

const BUILD = ['health', 'melee', 'grenade']

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

test('saving new scores clears the old rescues', () => {
  // The rescue search runs after the scores are saved and reads the kept
  // pieces, so last run's rescues must already be gone.
  c.addArmor(db, 'a1', { health: 30 }, { score: 100 })
  saveArmorRescue(db, new Map([['a1', [[BUILD, 100]]]]))
  saveArmorScores(db, new Map())
  expect(db.selectValue('SELECT COUNT(*) FROM armor_rescue')).toBe(0)
})

test('whole-number scores are saved as REAL, as the CLI saved its floats', () => {
  // The CLI wrote preferred_score and tuning_gain as Python floats (110.0);
  // here they're whole JS numbers, bound as integers, and the columns' REAL
  // affinity keeps them floats, so SQL prints them as the CLI's did.
  c.addArmor(db, 'a1', { health: 30 })
  const bestStats = [35, 5, 5, 5, 5, 5]
  saveArmorScores(
    db,
    new Map([['a1', { instanceId: 'a1', preferredScore: 110, bestTuning: '', bestStats, tuningGain: 0 }]]),
  )
  expect(
    db.selectArrays(
      'SELECT typeof(preferred_score), typeof(tuning_gain), typeof(best_health), preferred_score || ?, ' +
        'tuning_gain || ? FROM armor_score',
      ['', ''],
    ),
  ).toEqual([['real', 'real', 'integer', '110.0', '0.0']])
})
