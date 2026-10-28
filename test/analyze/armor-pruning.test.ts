// Tests for armor pruning's code side (src/analyze/armor-pruning.ts): each
// piece's score (tuning variants, masterwork, the preferred score) and the
// rescue search over the saved scores and v_armor_reach. The views that flag
// pieces are tested in test/views/. Ported from d2-inventory-report's
// tests/analyze/test_armor_pruning.py.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import {
  applyMwToZeros,
  bestVariantForPrefs,
  computeArmorScores,
  tripleRescue,
  tuningVariants,
} from '../../src/analyze/armor-pruning.ts'
import { ARMOR_STAT_NAMES } from '../../src/models.ts'
import * as c from '../helpers.ts'
import { armorStats, makeArmor, makeArmorInst, pref } from './helpers.ts'

const BASE = [30, 25, 20, 0, 0, 0]
const GRENADE_FIRST = ['grenade', 'health', 'melee', 'super_stat', 'class_stat', 'weapons']

// Scoring: masterwork, tuning variants and the preferred score

test('masterwork adds 5 to each zero stat', () => {
  expect(applyMwToZeros([30, 0, 20, 0, 5, 0])).toEqual([30, 5, 20, 5, 5, 5])
})

test('the untuned variant comes first', () => {
  const variants = tuningVariants(BASE, ['grenade'])
  expect(variants[0]).toEqual([[30, 25, 20, 5, 5, 5], ''])
})

test('a legendary raises only its tuning stat', () => {
  // +5 Wep from each of the three stats of at least 5, after the untuned one.
  const variants = tuningVariants(BASE, ['weapons'])
  expect(variants.map(([, label]) => label)).toEqual(['', '+5 Wep / -5 Hlt', '+5 Wep / -5 Mel', '+5 Wep / -5 Gre'])
})

test('an exotic raises any stat', () => {
  // 3 donors of at least 5, 5 targets each, plus the untuned variant.
  const variants = tuningVariants(BASE, ARMOR_STAT_NAMES)
  expect(variants).toHaveLength(16)
})

test("a stat below 5 can't give up points", () => {
  // Health and melee can donate; grenade=3 can't: 2 donors x 5 targets + 1.
  const variants = tuningVariants([30, 25, 3, 0, 0, 0], ARMOR_STAT_NAMES)
  expect(variants).toHaveLength(11)
})

test('without a tuning socket only the untuned variant', () => {
  expect(tuningVariants(BASE, [])).toEqual([[[30, 25, 20, 5, 5, 5], '']])
})

test('a tuning swap moves 5 points and masterwork fills the zeros', () => {
  // +5 Gre / -5 Hlt: health 30 -> 25, grenade 20 -> 25.
  const variants = new Map(tuningVariants(BASE, ['grenade']).map(([stats, label]) => [label, stats]))
  expect(variants.get('+5 Gre / -5 Hlt')).toEqual([25, 25, 25, 5, 5, 5])
})

test('a grenade-first piece picks the grenade tune', () => {
  const [best, label] = bestVariantForPrefs(BASE, GRENADE_FIRST, 1, ['grenade'])
  expect(best[2]).toBe(25)
  expect(label).toContain('+5 Gre')
})

test("another tuning stat can't raise the pick", () => {
  // A Weapons-tuned piece can't raise grenade, and every swap lowers the
  // total, so it stays untuned.
  const [best, label] = bestVariantForPrefs(BASE, GRENADE_FIRST, 1, ['weapons'])
  expect([best, label]).toEqual([[30, 25, 20, 5, 5, 5], ''])
})

test('without picks the first stat is still raised', () => {
  // With no picks the first stat of the priority counts: +5 Hlt from melee.
  const priority = ['health', 'melee', 'grenade', 'super_stat', 'class_stat', 'weapons']
  const [best] = bestVariantForPrefs(BASE, priority, 0, ['health'])
  expect(best[0]).toBe(35)
})

test('a piece without tuning keeps its spread', () => {
  // No tuning socket: only the masterwork applies.
  const [best, label] = bestVariantForPrefs(BASE, GRENADE_FIRST, 1, [])
  expect([best, label]).toEqual([[30, 25, 20, 5, 5, 5], ''])
})

test('scores weigh the picks 3 2 1 on the best variant', () => {
  // Health first: +5 Hlt / -5 Gre gives 35 / 25 / 15.
  const armor = makeArmor({ setName: 'Test Set' })
  const piece = makeArmorInst(armor, 'p', { stats: armorStats(...BASE), tuningStats: ['health'], gearTier: 5 })
  const prefs = new Map([['Test Set', pref(['health', 'melee', 'grenade'])]])
  const score = computeArmorScores([piece], prefs).get('p')!
  expect([score.preferredScore, score.bestTuning]).toEqual([3 * 35 + 2 * 25 + 15, '+5 Hlt / -5 Gre'])
  // Untuned it scores 3 * 30 + 2 * 25 + 20: the swap adds 10.
  expect(score.tuningGain).toBe(10)
})

test("without picks the score is the best variant's total", () => {
  const armor = makeArmor({ setName: 'Test Set' })
  const piece = makeArmorInst(armor, 'p', { stats: armorStats(...BASE), tuningStats: ['health'], gearTier: 5 })
  const score = computeArmorScores([piece], new Map()).get('p')!
  expect([score.preferredScore, score.tuningGain]).toEqual([90, 0])
})

test('every gear tier and exotic is scored but not legacy', () => {
  // A Tier 3 piece has no tuning socket: it scores its masterworked stats.
  const stats = armorStats(...BASE)
  const pieces = [
    makeArmorInst(makeArmor(), 'legacy', { stats }),
    makeArmorInst(makeArmor({ name: 'Exo', isExotic: true }), 'exotic', { stats }),
    makeArmorInst(makeArmor(), 'tier3', { stats, gearTier: 3 }),
    makeArmorInst(makeArmor(), 'tier5', { stats, tuningStats: ['health'], gearTier: 5 }),
  ]
  const scores = computeArmorScores(pieces, new Map())
  expect(new Set(scores.keys())).toEqual(new Set(['exotic', 'tier3', 'tier5']))
  const tier3 = scores.get('tier3')!
  expect([tier3.bestStats, tier3.bestTuning]).toEqual([[30, 25, 20, 5, 5, 5], ''])
})

test('an exotic scores untuned', () => {
  // Its socket can raise any stat, but tuning is left out of an exotic's score.
  const exotic = makeArmor({ name: 'Exo', isExotic: true })
  const piece = makeArmorInst(exotic, 'exotic', {
    stats: armorStats(...BASE),
    tuningStats: [...ARMOR_STAT_NAMES],
    gearTier: 5,
  })
  const prefs = new Map([['Exo', pref(['health', 'melee', 'grenade'])]])
  const score = computeArmorScores([piece], prefs).get('exotic')!
  expect([score.preferredScore, score.bestTuning, score.tuningGain]).toEqual([160, '', 0])
})

// Rescue: base pieces take health / melee / grenade to 95 each; capped pieces
// can lift it to 100.

const SLOTS = ['Helmet', 'Gauntlets', 'Chest Armor', 'Leg Armor', 'Class Armor']
const BUILD = ['health', 'melee', 'grenade']

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

// Each of BUILD's stats at value.
function buildStats(value: number): Record<string, number> {
  return Object.fromEntries(BUILD.map((stat) => [stat, value]))
}

// One kept piece per slot with 19 in each of the build's stats.
function basePieces(): void {
  for (const slot of SLOTS) c.addArmor(db, `base ${slot}`, buildStats(19), { setName: 'Base', slot, score: 100 })
}

// A piece its set caps: the set keeps a better-scored copy in the slot that
// rolls none of the build's stats.
function addCapped(instanceId: string, setName: string, slot: string, stats: Record<string, number>): void {
  const keeper = { super_stat: 30, class_stat: 30 }
  c.addArmor(db, `${instanceId} keeper`, keeper, { setName, slot, score: 200 })
  c.addArmor(db, instanceId, stats, { setName, slot, score: 10 })
}

test('the better set wins over a higher minimum', () => {
  c.addPreference(db, 'Better Set', 'C', 3)
  c.addPreference(db, 'Worse Set', 'D', 1)
  basePieces()
  addCapped('higher', 'Worse Set', 'Helmet', buildStats(25)) // lowest 101
  addCapped('better', 'Better Set', 'Helmet', buildStats(24)) // lowest 100
  expect(tripleRescue(db)).toEqual(new Map([['better', [[BUILD, 100]]]]))
})

test('two pieces from different slots when one is not enough', () => {
  c.addPreference(db, 'Test Set', 'F')
  basePieces()
  addCapped('helm', 'Test Set', 'Helmet', buildStats(22))
  addCapped('arms', 'Test Set', 'Gauntlets', buildStats(22))
  expect(tripleRescue(db)).toEqual(
    new Map([
      ['helm', [[BUILD, 101]]],
      ['arms', [[BUILD, 101]]],
    ]),
  )
})
