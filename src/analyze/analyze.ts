// Analyze phase: each function reads the stored inventory, runs its analyses
// and saves every result the report shows: weapon_result and weapon_pruning
// for weapons; armor_score and armor_rescue for armor, from which the
// v_armor_pruning view works out the pieces to dismantle.
// Ported from d2-inventory-report's analyze/analyze.py, without its progress
// lines for the terminal (the report shows the same counts) or its
// --edit-armor-prefs mode, which waits for the web editor.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { type ArmorInstance, type InstanceWishlistScore } from '../models.ts'
import { load as loadAegis } from './aegis-rankings.ts'
import { computeArmorScores, tripleRescue } from './armor-pruning.ts'
import { loadArmor, loadBelowLegendary, loadWeapons } from './inventory.ts'
import { ensurePreferences as fillPreferences } from './prefs/editor.ts'
import { loadPreferences, type Prefs, savePreferences } from './prefs/store.ts'
import { saveArmorRescue, saveArmorScores, saveWeaponPruning, saveWeaponResults } from './results.ts'
import { findExactDuplicates } from './weapon-pruning.ts'
import { loadAll, PlugCatalog, scoreAllInstances } from './wishlists/scorer.ts'

// Score every Legendary and Exotic copy against the stored wishlists
// (wishlists/scorer.ts) and save the scores, then flag every true duplicate
// (weapon-pruning.ts), whose keeper the saved scores help pick, and every
// copy below Legendary.
export function analyzeWeapons(db: Database): void {
  const weaponInstances = loadWeapons(db)
  const rollsBySource = loadAll(db)
  const scores = rollsBySource.size
    ? scoreAllInstances(weaponInstances, rollsBySource, new PlugCatalog(db))
    : new Map<string, InstanceWishlistScore>()
  saveWeaponResults(db, weaponInstances, scores)
  saveWeaponPruning(db, [
    ...loadBelowLegendary(db).map((id): [string, string, null] => [id, 'below_legendary', null]),
    ...findExactDuplicates(db).map(([id, keeperId]): [string, string, string] => [id, 'exact_duplicate', keeperId]),
  ])
}

// The stored preferences, after filling in (see prefs/editor.ts) any set or
// exotic without one that you own an Armor 3.0 piece of (any gear tier), and
// any exotic without one that you own two or more copies of; saved when
// anything changed.
export function ensurePreferences(db: Database, armorInstances: ArmorInstance[]): Prefs {
  const prefs = loadPreferences(db)
  const setsNeeded = new Set(
    armorInstances
      .filter((inst) => inst.armor.setName && inst.gearTier && !inst.armor.isExotic)
      .map((inst) => inst.armor.setName),
  )
  // Exotics group by name ignoring case, as v_armor_pruning groups them;
  // each is filled in under its first copy's name.
  const exoticCopies = new Map<string, ArmorInstance[]>()
  for (const inst of armorInstances) {
    if (!inst.armor.isExotic) continue
    const key = inst.armor.name.toLowerCase()
    if (!exoticCopies.has(key)) exoticCopies.set(key, [])
    exoticCopies.get(key)!.push(inst)
  }
  const exoticsNeeded = new Set(
    [...exoticCopies.values()]
      .filter((copies) => copies.length > 1 || copies.some((inst) => inst.gearTier))
      .map((copies) => copies[0].armor.name),
  )
  if (!setsNeeded.size && !exoticsNeeded.size) return prefs
  const [filled, changed] = fillPreferences(setsNeeded, exoticsNeeded, armorInstances, prefs, loadAegis(db))
  if (changed) savePreferences(db, filled)
  return filled
}

// Make sure every new set and exotic has preferences (filled in when
// missing), then save the armor scores and the pieces rescued for
// three-stat builds.
export function analyzeArmor(db: Database): void {
  const armorInstances = loadArmor(db)
  const prefs = ensurePreferences(db, armorInstances)
  saveArmorScores(db, computeArmorScores(armorInstances, prefs))
  saveArmorRescue(db, tripleRescue(db))
}
