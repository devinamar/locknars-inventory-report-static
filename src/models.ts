// The shapes every phase shares: weapons, armor, DIM tags, wishlist rolls,
// Aegis rankings, armor preferences, and the analysis results the db stores.
// Ported from d2-inventory-report's models.py: its dataclasses are types here
// and their methods standalone functions.

// One perk socket on a weapon copy and the names of every perk the copy can
// equip in it, in the game's order (v_weapon_roll).
export type PerkSocket = {
  kind: string // 'barrel', 'magazine', 'stock', 'grip', 'trait', 'origin' or 'intrinsic'
  perks: string[] // perk names
}

// One weapon copy in your vault, as wishlist scoring reads it.
export type WeaponInstance = {
  instanceId: string
  itemHash: number
  roll: PerkSocket[] // in socket order: barrel, magazine, traits, origin, ...
}

// Armor stat names in canonical order (matches armorStatsTuple())
export const ARMOR_STAT_NAMES = ['health', 'melee', 'grenade', 'super_stat', 'class_stat', 'weapons'] as const

export type ArmorStatName = (typeof ARMOR_STAT_NAMES)[number]

export const ARMOR_STAT_SHORT = ['Hlt', 'Mel', 'Gre', 'Sup', 'Cls', 'Wep'] as const

// Canonical internal-name -> short-label map (single source for reports + prefs UI)
export const ARMOR_STAT_SHORT_MAP: Record<string, string> = Object.fromEntries(
  ARMOR_STAT_NAMES.map((name, i) => [name, ARMOR_STAT_SHORT[i]]),
)

// The six armor stats, in canonical order: health, melee, grenade, super,
// class, weapons.
export type ArmorStats = Record<ArmorStatName, number>

export function armorStatsTotal(stats: ArmorStats): number {
  return armorStatsTuple(stats).reduce((a, b) => a + b, 0)
}

export function armorStatsTuple(stats: ArmorStats): number[] {
  return ARMOR_STAT_NAMES.map((s) => stats[s])
}

// An armor set's 2-piece and 4-piece bonuses, each perk's name and text.
export type ArmorSetBonus = {
  twoPieceBonus: string
  fourPieceBonus: string
}

// An exotic armor piece's intrinsic perk (its build-defining effect).
export type ExoticEffect = {
  name: string
  description: string
}

// An armor definition; each copy carries one, built from its row.
export type Armor = {
  name: string
  setName: string
  setBonus: ArmorSetBonus | null
  isExotic: boolean
  exoticEffect: ExoticEffect | null
}

// One armor copy in your vault, as the armor analysis reads it.
export type ArmorInstance = {
  instanceId: string
  armor: Armor
  stats: ArmorStats
  gearTier: number | null
  tuningStats: string[] // the stats its tuning socket can raise, in stat order; [] for none
}

// A user-supplied tag and/or notes for one item, fetched from DIM.
export type DIMAnnotation = {
  tag: string | null
  notes: string | null
}

// DIM's wildcard item hash: the roll applies to any weapon that can roll its
// perks. Stored as-is; the scorer checks these rolls against every copy.
export const WILDCARD_ITEM_HASH = -69420

// One wishlist roll for one weapon, stored as one wishlist_roll row. perks
// are plug hashes in DIM's column order (barrel, magazine, trait 1, trait 2,
// plus up to two extras); empty for a line naming no perks, which fits any
// roll of the weapon. rollId is the row id once stored, which copies'
// matches refer to.
export type WishlistRoll = {
  itemHash: number
  rollId: number
  perks: number[] // plug hashes in file order
  tags: Set<string> // {'pve', 'pvp', ...}
  isTrash: boolean
}

// One ranked set bonus from The Aegis's "Set Bonuses" sheet. A set's 2pc
// and 4pc bonuses are ranked independently. Persisted as an aegis_bonus row.
// Its fields keep the CLI's names, which the report's templates read.
export type AegisBonus = Readonly<{
  set_name: string // sheet spelling
  pieces: number // 2 or 4
  bonus_name: string
  source: string // activity / location the set drops from
  season: string
  tags: string[] // ['survivability', 'damage', ...]
  trigger: string // cells may embed newlines
  effect: string
  analysis: string
  rank: number // 1 = best bonus overall
  grade: string // 'S'..'F'
}>

// Stat picks for one armor set or exotic, plus a set's grade and its rank
// within the grade (1 comes first). Only the 1-3 explicit picks are
// stored; fullPriority() expands them to all six stats.
export type ArmorPreference = {
  stat1: string | null
  stat2: string | null
  stat3: string | null
  grade: string // 'S'..'F'; '' for an exotic or a set not yet classified
  rank: number // 1 = first within the grade
  isExotic: boolean
}

// A preference with no stat picks and no grade: the dataclass's defaults.
export function emptyPreference(): ArmorPreference {
  return { stat1: null, stat2: null, stat3: null, grade: '', rank: 0, isExotic: false }
}

// Return only the explicitly-picked stats, in priority order (0-3 entries).
export function picks(pref: ArmorPreference): string[] {
  return [pref.stat1, pref.stat2, pref.stat3].filter((s): s is string => !!s)
}

// Count of stats the user explicitly picked (0-3).
export function specified(pref: ArmorPreference): number {
  return picks(pref).length
}

// All six stats in priority order: the picks, then the rest in canonical
// order.
export function fullPriority(pref: ArmorPreference): string[] {
  const chosen = picks(pref)
  return [...chosen, ...ARMOR_STAT_NAMES.filter((s) => !chosen.includes(s))]
}

// One copy's wishlist score. matchCount is how many non-trash wishlist
// rolls (from every source) the copy can equip; higher ranks higher.
// hasWishlist is false when no source covers the weapon at all.
// matchedRollIds are the wishlist_roll rows it matched, trash included,
// which the report groups by source.
export type InstanceWishlistScore = {
  matchCount: number
  hasWishlist: boolean
  matchedRollIds: number[]
}

// Per-piece score used to rank inside (class, slot, set) pruning buckets
// and persisted to armor_score. Every exotic and every Armor 3.0 piece has
// one; legacy Legendary pieces are always flagged and have none.
export type ArmorScore = {
  instanceId: string
  preferredScore: number // 3*stat[pref1] + 2*stat[pref2] + stat[pref3] (ranking key)
  bestTuning: string // variant label that maximises preferredScore
  bestStats: number[] // that variant's stats, masterwork included
  tuningGain: number // what bestTuning adds to the untuned piece's score
}
