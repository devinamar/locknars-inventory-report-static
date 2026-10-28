// Tests for the preference editor's run-time check (src/analyze/prefs/
// editor.ts): what it keeps, and what it fills in where the CLI's editor
// prompted, as if the player took every default. Ported from
// d2-inventory-report's tests/analyze/prefs/test_editor.py; the tests from
// "Filling in" on are the site's own.
import { expect, test } from 'vitest'
import { normalize } from '../../src/analyze/aegis-rankings.ts'
import { ensurePreferences, formatExoticEffect, formatSetBonus } from '../../src/analyze/prefs/editor.ts'
import { type AegisBonus, fullPriority } from '../../src/models.ts'
import { makeArmor, makeArmorInst, pref } from './helpers.ts'

// An AegisBonus, '' or none for anything not given.
function bonus(setName: string, pieces: number, fields: Partial<AegisBonus> = {}): AegisBonus {
  const empty = { bonus_name: 'x', source: '', season: '', tags: [], trigger: '', effect: '', analysis: '' }
  return { set_name: setName, pieces, ...empty, rank: 0, grade: '', ...fields }
}

// The aegis argument for bonuses: {normalized set name: [AegisBonus]}.
function aegisOf(...bonuses: AegisBonus[]): Map<string, AegisBonus[]> {
  return Map.groupBy(bonuses, (b) => normalize(b.set_name))
}

test('saved grade and rank survive a different aegis ranking', () => {
  const prefs = new Map([['Ferropotent', pref(['health'], { grade: 'D', rank: 2 })]])
  const aegis = aegisOf(bonus('Ferropotent', 2, { rank: 26, grade: 'B' }))
  const [result, changed] = ensurePreferences(new Set(['Ferropotent']), new Set(), [], prefs, aegis)
  expect([result.get('Ferropotent')!.grade, result.get('Ferropotent')!.rank, changed]).toEqual(['D', 2, false])
})

test('a set the game recapitalized is saved under its new name', () => {
  // Bungie renamed 'Aion Renewal' to 'AION Renewal' between patches. Nothing
  // is asked, but the run saves the new name.
  const prefs = new Map([['Aion Renewal', pref(['health'], { grade: 'D', rank: 1 })]])
  const [result, changed] = ensurePreferences(new Set(['AION Renewal']), new Set(), [], prefs, new Map())
  expect([[...result.keys()], result.get('AION Renewal')!.grade, changed]).toEqual([['AION Renewal'], 'D', true])
})

test('the full priority is the picks then the rest in order', () => {
  // What the CLI's editor showed after the picks Weapons and Health:
  // [Wep] > [Hlt] > Mel > Gre > Sup > Cls.
  expect(fullPriority(pref(['weapons', 'health']))).toEqual([
    'weapons',
    'health',
    'melee',
    'grenade',
    'super_stat',
    'class_stat',
  ])
})

// Filling in

test('the text the picks are suggested from is what the editor showed', () => {
  // A set's bonuses and its Aegis lines, each on one line, the Aegis ones in
  // ASCII; an exotic's effect. As d2-inventory-report's editor printed them.
  const aegis = aegisOf(
    bonus('Ferropotent', 2, {
      bonus_name: 'Rapid Repair',
      trigger: 'orb\npickup',
      effect: 'heal 40%—fast',
      analysis: 'great “value”',
      rank: 26,
      grade: 'B',
    }),
  )
  const bonusMap = new Map([
    ['Ferropotent', { twoPieceBonus: 'Rapid Repair: Picking up an orb\n heals you.', fourPieceBonus: '' }],
  ])
  expect(formatSetBonus('Ferropotent', aegis, bonusMap)).toBe(
    '  2pc: Rapid Repair: Picking up an orb heals you.\n  4pc: (unknown)\n' +
      '  Aegis #26 [B] 2pc Rapid Repair: orb pickup -> heal 40%?fast | great ?value?',
  )
  expect(formatSetBonus('Unknown', aegis, bonusMap)).toBe('  (set bonus descriptions not available)')
  const effects = new Map([
    ['X', { name: 'Spirit', description: 'Dodge\n  grants   melee energy.' }],
    ['Y', { name: '', description: 'desc' }],
    ['Z', { name: 'Name', description: '' }],
  ])
  expect(['X', 'Y', 'Z', 'W'].map((name) => formatExoticEffect(name, effects))).toEqual([
    '  Effect: Spirit\n  Dodge grants melee energy.',
    '  Effect:\n  desc',
    '  Effect: Name',
    '  (exotic effect description not available)',
  ])
})

test('a new set takes the suggested picks and its Aegis grade, last in the grade', () => {
  // The picks come from its bonuses and The Aegis's lines (the reload
  // speed), the grade from its best-ranked bonus; new sets go in name order.
  const aegis = aegisOf(
    bonus('Ferropotent', 2, { effect: 'Weapon reload speed', rank: 26, grade: 'B' }),
    bonus('Ferropotent', 4, { rank: 61, grade: 'C' }),
    bonus('Techsec', 2, { rank: 30, grade: 'B' }),
  )
  const setBonus = {
    twoPieceBonus: 'Rapid Repair: Picking up an orb heals you.',
    fourPieceBonus: 'Built From Scratch: Melee hits grant armor charge.',
  }
  const pieces = [
    makeArmorInst(makeArmor({ setName: 'Techsec' }), 't1', { gearTier: 5 }),
    makeArmorInst(makeArmor({ setName: 'Ferropotent', setBonus }), 'f1', { gearTier: 5 }),
  ]
  const prefs = new Map([['Bushido', pref(['health'], { grade: 'B', rank: 1 })]])
  const [result, changed] = ensurePreferences(new Set(['Techsec', 'Ferropotent']), new Set(), pieces, prefs, aegis)
  expect(result.get('Ferropotent')).toEqual(pref(['weapons', 'health', 'melee'], { grade: 'B', rank: 2 }))
  expect(result.get('Techsec')).toEqual(pref([], { grade: 'B', rank: 3 }))
  expect(result.get('Bushido')!.rank).toBe(1)
  expect(changed).toBe(true)
})

test("a new set the Aegis sheet doesn't list stays unclassified", () => {
  const setBonus = { twoPieceBonus: 'Tech: Grenade kills grant grenade energy.', fourPieceBonus: '' }
  const pieces = [makeArmorInst(makeArmor({ setName: 'Techsec', setBonus }), 't1', { gearTier: 5 })]
  const [result, changed] = ensurePreferences(new Set(['Techsec']), new Set(), pieces, new Map(), new Map())
  expect(result.get('Techsec')).toEqual(pref(['grenade'], { grade: '', rank: 0 }))
  expect(changed).toBe(true)
})

test('a set without a grade takes its Aegis grade, last, and keeps its picks', () => {
  // One the sheet doesn't list keeps no grade.
  const prefs = new Map([
    ['Bushido', pref([], { grade: 'B', rank: 1 })],
    ['Ferropotent', pref(['melee'])],
    ['Techsec', pref(['grenade'])],
  ])
  const aegis = aegisOf(bonus('Ferropotent', 2, { rank: 26, grade: 'B' }))
  const [result, changed] = ensurePreferences(new Set(['Ferropotent', 'Techsec']), new Set(), [], prefs, aegis)
  expect(result.get('Ferropotent')).toEqual(pref(['melee'], { grade: 'B', rank: 2 }))
  expect(result.get('Techsec')).toEqual(pref(['grenade']))
  expect(changed).toBe(true)
})

test('a new exotic takes the picks its effect suggests', () => {
  const exoticEffect = { name: 'Burning Fists', description: 'Melee kills grant bonus melee damage.' }
  const armor = makeArmor({ name: 'Wormgod Caress', isExotic: true, exoticEffect })
  const pieces = [makeArmorInst(armor, 'x1', { gearTier: 5 })]
  const [result, changed] = ensurePreferences(new Set(), new Set(['Wormgod Caress']), pieces, new Map(), new Map())
  expect(result.get('Wormgod Caress')).toEqual(pref(['melee'], { isExotic: true }))
  expect(changed).toBe(true)
})
