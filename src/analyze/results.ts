// Saves the analysis results, one group of tables per analysis (the tables in
// schema/results/). Each save replaces its tables, since every run
// recomputes everything. The CLI saved each group in one transaction;
// insertMany opens its own, one per table, so a failure partway leaves the
// tables before it saved (the next run recomputes them all).
// Ported from d2-inventory-report's analyze/results.py.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { insertMany } from '../db.ts'
import { type ArmorScore, type InstanceWishlistScore, type WeaponInstance } from '../models.ts'

// A rescued piece's builds: [[stat names], new min] each.
export type Rescued = Map<string, [string[], number][]>

// Replace weapon_result and instance_wishlist_match: one result row per
// copy in weapons, one match row per roll it matched. scores is
// {instanceId: InstanceWishlistScore}, empty when no wishlist is stored.
export function saveWeaponResults(
  db: Database,
  weapons: WeaponInstance[],
  scores: Map<string, InstanceWishlistScore>,
): void {
  const noScore: InstanceWishlistScore = { matchCount: 0, hasWishlist: false, matchedRollIds: [] }
  const resultRows: [string, number, number][] = []
  const matchRows: [string, number][] = []
  for (const inst of weapons) {
    const score = scores.get(inst.instanceId) ?? noScore
    resultRows.push([inst.instanceId, score.matchCount, Number(score.hasWishlist)])
    for (const rollId of score.matchedRollIds) matchRows.push([inst.instanceId, rollId])
  }
  db.exec('DELETE FROM instance_wishlist_match')
  db.exec('DELETE FROM weapon_result')
  insertMany(db, 'INSERT INTO weapon_result VALUES (?, ?, ?)', resultRows)
  insertMany(db, 'INSERT INTO instance_wishlist_match VALUES (?, ?)', matchRows)
}

// Replace weapon_pruning with flagged: [[instanceId, reason, keeperId]].
export function saveWeaponPruning(db: Database, flagged: [string, string, string | null][]): void {
  db.exec('DELETE FROM weapon_pruning')
  insertMany(db, 'INSERT INTO weapon_pruning VALUES (?, ?, ?)', flagged)
}

// Replace armor_score with one row per ArmorScore ({instanceId:
// ArmorScore}). Legacy pieces have no score unless exotic; they are
// always flagged. The scores are whole numbers more often than not, bound as
// integers; the columns' REAL affinity stores them as the CLI's floats.
export function saveArmorScores(db: Database, scores: Map<string, ArmorScore>): void {
  const rows = [...scores.values()].map((score) => [
    score.instanceId,
    score.preferredScore,
    score.bestTuning,
    score.tuningGain,
    ...score.bestStats,
  ])
  db.exec('DELETE FROM armor_score')
  insertMany(db, 'INSERT INTO armor_score VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', rows)
}

// Replace armor_rescue with one row per rescued piece and three-stat build
// it takes to 100: rescued is {instanceId: [[stat names], new min]}.
export function saveArmorRescue(db: Database, rescued: Rescued): void {
  const rows = [...rescued].flatMap(([instanceId, builds]) =>
    builds.map(([stats, newMin]) => [instanceId, ...stats, newMin]),
  )
  db.exec('DELETE FROM armor_rescue')
  insertMany(db, 'INSERT INTO armor_rescue VALUES (?, ?, ?, ?, ?)', rows)
}
