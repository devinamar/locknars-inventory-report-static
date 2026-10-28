// Tests for The Aegis's set-bonus rankings (src/analyze/aegis-rankings.ts),
// read from what build/aegis.ts stored. Set names match after normalizing: 4
// of the live vault's 52 sets are named "... Set", which the sheet leaves off.
// Ported from d2-inventory-report's tests/analyze/test_aegis_rankings.py.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import { type AegisBonus, saveBonuses } from '../../build/aegis.ts'
import { getAegisBonuses, getAegisRanking, load } from '../../src/analyze/aegis-rankings.ts'
import { testDb } from '../helpers.ts'

// An AegisBonus as the data build saves it, '' or none for anything not given.
function bonus(setName: string, pieces: number, bonusName: string, fields: Partial<AegisBonus> = {}): AegisBonus {
  const empty = { source: '', season: '', tags: [], trigger: '', effect: '', analysis: '', rank: 0, grade: '' }
  return { setName, pieces, bonusName, ...empty, ...fields }
}

const BONUSES = [
  bonus('Ferropotent', 2, 'Rapid Repair', { tags: ['survivability'], rank: 26, grade: 'B' }),
  bonus('Ferropotent', 4, 'Built From Scratch', { trigger: 'a\nb', rank: 61, grade: 'C' }),
  bonus('Iron Panoply', 4, 'Panoply', { source: 'Iron Banner', rank: 19, grade: 'B' }),
]

let db: Database
beforeEach(() => {
  db = testDb()
  return () => db.close()
})

test('set takes its best ranked bonus', () => {
  saveBonuses(db, BONUSES)

  const aegisData = load(db)
  const ranking = getAegisRanking(aegisData, 'Ferropotent')!
  expect([ranking.grade, ranking.rank, ranking.pieces]).toEqual(['B', 26, 2])
  expect(getAegisRanking(aegisData, 'Iron Panoply Set')!.rank).toBe(19)
  expect(getAegisRanking(aegisData, 'Unknown')).toBeNull()
  expect(getAegisBonuses(aegisData, 'ferropotent').map((b) => b.pieces)).toEqual([2, 4])
})

test('a bonus loads with every field under the CLI name', () => {
  // The report's templates read the CLI's field names; tags are one per line.
  saveBonuses(db, [...BONUSES, bonus('Techsec', 2, 'Tech', { tags: ['ability', 'damage'], rank: 3, grade: 'S' })])
  const aegisData = load(db)
  expect(getAegisBonuses(aegisData, 'Ferropotent')).toEqual([
    {
      set_name: 'Ferropotent',
      pieces: 2,
      bonus_name: 'Rapid Repair',
      source: '',
      season: '',
      tags: ['survivability'],
      trigger: '',
      effect: '',
      analysis: '',
      rank: 26,
      grade: 'B',
    },
    expect.objectContaining({ pieces: 4, tags: [], trigger: 'a\nb', rank: 61, grade: 'C' }),
  ])
  expect(getAegisRanking(aegisData, 'Techsec')!.tags).toEqual(['ability', 'damage'])
  expect(getAegisRanking(aegisData, 'Iron Panoply')!.source).toBe('Iron Banner')
})
