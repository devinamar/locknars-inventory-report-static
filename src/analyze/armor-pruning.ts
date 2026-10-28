// Armor pruning: scores every Armor 3.0 piece and exotic against its
// preference (saved to armor_score), then finds the capped pieces a three-stat
// build needs (armor_rescue). Which pieces go, and why, is the v_armor_pruning view
// over those two tables and the set grades. Armor 3.0 is the armor with gear
// tiers, set bonuses and tuning; earlier armor is legacy.
// Ported from d2-inventory-report's analyze/armor_pruning.py.
import { type Database } from '@sqlite.org/sqlite-wasm'
import {
  ARMOR_STAT_NAMES,
  ARMOR_STAT_SHORT,
  type ArmorInstance,
  type ArmorPreference,
  type ArmorScore,
  armorStatsTuple,
  emptyPreference,
  fullPriority,
  picks,
  specified,
} from '../models.ts'
import { capSummary } from './armor-grades.ts'
import { getPref, prefName, type Prefs } from './prefs/store.ts'
import { type Rescued } from './results.ts'

// Why a piece is flagged, in report order: code -> [title, explanation]. The
// codes are v_armor_pruning's reasons; the single source for their labels in
// both report formats.
export const PRUNE_REASONS: Record<string, [string, string]> = {
  cap_tier: [
    'Low score',
    `Past its set's per-slot cap for its grade (${capSummary()} copies per ` +
      'slot): the set keeps its best-scoring copies in each slot and class.',
  ],
  exotic_dupe: [
    'Extra exotic copies',
    'Each exotic keeps its best copy on its stat picks; an exotic class item keeps one per perk pair.',
  ],
  legacy: ['Legacy, before Armor 3.0', 'From before Armor 3.0: no gear tier, set bonus or tuning.'],
  equal_same_set: [
    'Duplicate stats and Tuning',
    'The same stats and tuning stat as an older copy of the set, which stays.',
  ],
}

// Position of each stat in an ArmorStats tuple.
const STAT_INDEX: Record<string, number> = Object.fromEntries(ARMOR_STAT_NAMES.map((name, i) => [name, i]))

// Numbers added up, as Python's sum().
function sum(values: number[]): number {
  return values.reduce((n, v) => n + v, 0)
}

// Lists of numbers compared as Python compares tuples: by their first
// difference, else the shorter first.
function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  return a.length - b.length
}

// Scoring: an ArmorScore for each piece, the ranking key when pruning.

// A stat spread the piece can reach: its six stats and the tuning swap that
// makes it ('' for none).
export type Variant = [number[], string]

// Masterwork on Armor 3.0: +5 to each stat that is 0 (a piece of any gear
// tier drops with three of them); the other stats are unchanged.
export function applyMwToZeros(base: number[]): number[] {
  return base.map((v) => (v === 0 ? v + 5 : v))
}

// Every stat spread the piece can reach, as [stats, label]: untuned first,
// then each swap its tuning socket offers, +5 to one of tuningStats and -5
// from another stat of at least 5. Masterwork is applied after the swap, so
// tuning and masterwork never both raise the same zero.
export function tuningVariants(base: number[], tuningStats: readonly string[]): Variant[] {
  const variants: Variant[] = [[applyMwToZeros(base), '']]
  const targets = tuningStats.map((stat) => STAT_INDEX[stat])
  for (let donor = 0; donor < 6; donor++) {
    if (base[donor] < 5) continue
    for (const target of targets) {
      if (target === donor) continue
      const tuned = [...base]
      tuned[donor] -= 5
      tuned[target] += 5
      variants.push([applyMwToZeros(tuned), `+5 ${ARMOR_STAT_SHORT[target]} / -5 ${ARMOR_STAT_SHORT[donor]}`])
    }
  }
  return variants
}

// [stats, label] of the variant that does best on the priority stats,
// compared in priority order (at least the top stat), then by total; the
// first of equals.
export function bestVariantForPrefs(
  base: number[],
  priority: string[],
  specified: number,
  tuningStats: readonly string[],
): Variant {
  const picked = priority.slice(0, Math.max(specified, 1)).map((stat) => STAT_INDEX[stat])
  const key = ([stats]: Variant) => [...picked.map((i) => stats[i]), sum(stats)]
  return tuningVariants(base, tuningStats).reduce((best, v) => (compare(key(v), key(best)) > 0 ? v : best))
}

// The preference stored under name (case-insensitive), else one with no
// grade and no stat picks.
export function prefOrDefault(prefs: Prefs, name: string): ArmorPreference {
  return getPref(prefs, name) ?? emptyPreference()
}

// preferredScore = 3*stat[pref1] + 2*stat[pref2] + 1*stat[pref3].
export const PREFERRED_STAT_WEIGHTS = [3, 2, 1]

// The score of a stat spread under pref (see PREFERRED_STAT_WEIGHTS);
// without stat picks, the stat total.
export function weightedScore(stats: number[], pref: ArmorPreference): number {
  if (specified(pref) <= 0) return sum(stats)
  return sum(picks(pref).map((stat, i) => PREFERRED_STAT_WEIGHTS[i] * stats[STAT_INDEX[stat]]))
}

// One piece's ArmorScore under pref, from its best variant. tuningGain is
// what that variant's tuning swap adds to the untuned piece's score. An
// exotic scores untuned: a Tier 5 exotic can tune any stat, so tuning
// doesn't tell its copies apart.
export function computeArmorScore(inst: ArmorInstance, pref: ArmorPreference): ArmorScore {
  const base = armorStatsTuple(inst.stats)
  const tuningStats = inst.armor.isExotic ? [] : inst.tuningStats
  const [bestStats, label] = bestVariantForPrefs(base, fullPriority(pref), specified(pref), tuningStats)
  const preferredScore = weightedScore(bestStats, pref)
  return {
    instanceId: inst.instanceId,
    preferredScore,
    bestTuning: label,
    bestStats,
    tuningGain: preferredScore - weightedScore(applyMwToZeros(base), pref),
  }
}

// {instanceId: ArmorScore} for every Armor 3.0 piece and every exotic,
// each under the preference it follows (its set's, or the exotic's own).
// A piece below gear tier 5 has no tuning socket, so it scores untuned.
export function computeArmorScores(allInstances: ArmorInstance[], prefs: Prefs): Map<string, ArmorScore> {
  const scores = new Map<string, ArmorScore>()
  for (const inst of allInstances) {
    if (!inst.gearTier && !inst.armor.isExotic) continue // legacy: always dropped, no score
    scores.set(inst.instanceId, computeArmorScore(inst, prefOrDefault(prefs, prefName(inst))))
  }
  return scores
}

// Rescue: the capped pieces a three-stat build needs.

export const TRIPLE_THRESHOLD = 100 // what each stat of a three-stat build should reach

// The capped pieces, lowest itemInstanceId first, with what the rescue ranks
// them by: their set grade's position (1 best) and rank in it, and their score.
const CAPPED = `
SELECT a.*, g.position AS grade_position, p.rank, s.preferred_score
FROM v_armor_pruning f
JOIN v_armor a ON a.instance_id = f.instance_id
JOIN armor_score s ON s.instance_id = f.instance_id
LEFT JOIN armor_preference p ON p.name = a.set_name COLLATE NOCASE
JOIN armor_grade g ON g.grade = COALESCE(p.grade, '')
WHERE f.reason = 'cap_tier'
ORDER BY a.instance_id
`

// A CAPPED row.
type Piece = Record<string, any>

// Higher for a better set: its grade, then its rank within the grade.
// Sets without a rank come after the ranked ones of their grade.
function setRank(piece: Piece): number[] {
  return [-piece.grade_position, -(piece.rank || Infinity)]
}

// How far the kept pieces take one class's three-stat build (v_armor_reach):
// its totals, and each slot's best values.
type Reach = { armorClass: string; build: string[]; totals: number[]; perSlot: Map<string, number[]> }

// The reach of every class's three-stat build, in the view's order.
function loadReach(db: Database): Reach[] {
  const reach = new Map<string, Reach>()
  for (const r of db.selectObjects('SELECT * FROM v_armor_reach') as Piece[]) {
    const key = JSON.stringify([r.armor_class, r.stat_1, r.stat_2, r.stat_3])
    if (!reach.has(key)) {
      const totals = [r.total_1, r.total_2, r.total_3]
      reach.set(key, { armorClass: r.armor_class, build: [r.stat_1, r.stat_2, r.stat_3], totals, perSlot: new Map() })
    }
    reach.get(key)!.perSlot.set(r.slot, [r.value_1, r.value_2, r.value_3])
  }
  return [...reach.values()]
}

// itertools.combinations(items, size) for a size of 1 or 2, in its order.
function combinations<T>(items: T[], size: number): T[][] {
  if (size === 1) return items.map((x) => [x])
  return items.flatMap((x, i) => items.slice(i + 1).map((y) => [x, y]))
}

// Stage 4: for each class and three-stat build the kept pieces can't take
// to TRIPLE_THRESHOLD in every stat, keep the capped piece that can, else
// the two from different slots: the better set first (a pair counts its better
// set), then the higher new minimum, then the higher scores, then the lower
// itemInstanceId. Raw stats, as the reach. Returns {instanceId: [[stat
// names], new min]}; reads the saved scores, so it runs after them.
export function tripleRescue(db: Database): Rescued {
  const capped = db.selectObjects(CAPPED) as Piece[]
  const rescued: Rescued = new Map()
  for (const { armorClass, build, totals, perSlot } of loadReach(db)) {
    if (Math.min(...totals) >= TRIPLE_THRESHOLD) continue
    // The class's capped pieces that beat their slot's best for this
    // build, each with what it adds to each stat.
    const gains: [Piece, number[]][] = []
    for (const piece of capped) {
      if (piece.armor_class !== armorClass) continue
      const values = build.map((stat) => piece[stat] as number)
      const best = perSlot.get(piece.slot) ?? [0, 0, 0]
      if (compare([Math.min(...values), sum(values)], [Math.min(...best), sum(best)]) > 0) {
        gains.push([piece, values.map((v, i) => v - best[i])])
      }
    }
    for (const size of [1, 2]) {
      let choice: { key: number[]; newMin: number; combo: [Piece, number[]][] } | null = null
      for (const combo of combinations(gains, size)) {
        if (new Set(combo.map(([piece]) => piece.slot)).size < size) continue
        const newMin = Math.min(...totals.map((t, i) => t + sum(combo.map(([, gain]) => gain[i]))))
        if (newMin < TRIPLE_THRESHOLD) continue
        const rank = combo.map(([piece]) => setRank(piece)).reduce((a, b) => (compare(b, a) > 0 ? b : a))
        const key = [...rank, newMin, sum(combo.map(([piece]) => piece.preferred_score))]
        if (choice === null || compare(key, choice.key) > 0) choice = { key, newMin, combo }
      }
      if (choice) {
        for (const [piece] of choice.combo) {
          if (!rescued.has(piece.instance_id)) rescued.set(piece.instance_id, [])
          rescued.get(piece.instance_id)!.push([build, choice.newMin])
        }
        break
      }
    }
  }
  return rescued
}
