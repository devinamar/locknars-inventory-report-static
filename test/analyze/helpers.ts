// Factories for the analysis tests, ported from d2-inventory-report's
// tests/conftest.py (make_armor, make_armor_inst) and the dataclass defaults
// its tests leaned on: armor, its copies, stats and preferences built in
// memory, with no database.
import {
  ARMOR_STAT_NAMES,
  type Armor,
  type ArmorInstance,
  type ArmorPreference,
  type ArmorStats,
  emptyPreference,
} from '../../src/models.ts'

// An Armor: the Test Helm of the Bushido set unless armor says otherwise.
export function makeArmor(armor: Partial<Armor> = {}): Armor {
  return { name: 'Test Helm', setName: 'Bushido', setBonus: null, isExotic: false, exoticEffect: null, ...armor }
}

// A copy of armor: all-zero stats, no gear tier (legacy) and no tuning
// socket unless inst says otherwise.
export function makeArmorInst(
  armor: Armor,
  instanceId = 'armor_1',
  inst: Partial<Omit<ArmorInstance, 'armor' | 'instanceId'>> = {},
): ArmorInstance {
  return { instanceId, armor, stats: armorStats(), gearTier: null, tuningStats: [], ...inst }
}

// ArmorStats from values in stat order, 0 for each stat left out (as the
// CLI's ArmorStats(*values)).
export function armorStats(...values: number[]): ArmorStats {
  return Object.fromEntries(ARMOR_STAT_NAMES.map((s, i) => [s, values[i] ?? 0])) as ArmorStats
}

// An ArmorPreference picking stats, in order (as the CLI's
// ArmorPreference(*stats, ...)); fields sets the rest.
export function pref(stats: string[] = [], fields: Partial<ArmorPreference> = {}): ArmorPreference {
  const [stat1 = null, stat2 = null, stat3 = null] = stats
  return { ...emptyPreference(), stat1, stat2, stat3, ...fields }
}
