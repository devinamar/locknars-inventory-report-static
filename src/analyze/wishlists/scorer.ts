// Wishlist scoring: a copy's score (matchCount) is how many non-trash
// wishlist rolls it can equip. A roll fits when each of its perks sits in a
// socket of the right kind on the copy, with the two trait perks in different
// trait sockets. Perks match by name, so reissued weapons with new perk hashes
// still match. Wildcard rolls (DIM's item=-69420) are checked against every
// copy, and a roll naming no perks (any roll of the weapon, or with
// item=-<hash> trash the whole weapon) fits every copy of its weapon. Matched
// trash rolls are recorded but don't add to the score.
// Ported from d2-inventory-report's analyze/wishlists/scorer.py.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { type InstanceWishlistScore, type WeaponInstance, WILDCARD_ITEM_HASH, type WishlistRoll } from '../../models.ts'

// The perk kinds a roll is matched on. Origin traits, intrinsics and
// masterworks aren't.
export const SCORED_KINDS = ['barrel', 'magazine', 'stock', 'grip', 'trait']

// {itemHash: [WishlistRoll]}, one source's rolls by weapon.
export type RollsByItem = Map<number, WishlistRoll[]>

// A roll's perks as names by kind: {kind: [name, ...]}.
export type RollByKind = Record<string, string[]>

// Load: the stored wishlist rolls and the plugs they name.

// {itemHash: [WishlistRoll]} for one source, in file order. A roll's perks
// are its non-null perk1..perk6, in file order.
export function loadWishlist(db: Database, sourceKey: string): RollsByItem {
  const rollsByItem: RollsByItem = new Map()
  const rows = db.selectArrays(
    'SELECT roll_id, item_hash, tags, is_trash, perk1, perk2, perk3, perk4, perk5, perk6 ' +
      'FROM wishlist_roll WHERE source_key = ? ORDER BY roll_id',
    [sourceKey],
  ) as [number, number, string, number, ...(number | null)[]][]
  for (const [rollId, itemHash, tags, isTrash, ...perks] of rows) {
    if (!rollsByItem.has(itemHash)) rollsByItem.set(itemHash, [])
    rollsByItem.get(itemHash)!.push({
      itemHash,
      rollId,
      perks: perks.filter((h) => h !== null),
      tags: new Set(tags.split(',').filter(Boolean)),
      isTrash: Boolean(isTrash),
    })
  }
  return rollsByItem
}

// {sourceKey: {itemHash: [WishlistRoll]}} for every source with rolls.
export function loadAll(db: Database): Map<string, RollsByItem> {
  const rollsBySource = new Map<string, RollsByItem>()
  for (const sourceKey of db.selectValues('SELECT key FROM wishlist_source ORDER BY key') as string[]) {
    const rollsByItem = loadWishlist(db, sourceKey)
    if (rollsByItem.size) rollsBySource.set(sourceKey, rollsByItem)
  }
  return rollsBySource
}

// Every plug's name and kind (v_plug) in memory, for fast lookups by plug
// hash during wishlist scoring. Unknown hashes give ''.
export class PlugCatalog {
  plugs: Map<number, { name: string; kind: string | null }>

  constructor(db: Database) {
    const rows = db.selectArrays('SELECT hash, name, kind FROM v_plug') as [number, string, string | null][]
    this.plugs = new Map(rows.map(([hash, name, kind]) => [hash, { name, kind }]))
  }

  getPlugName(plugHash: number): string {
    return this.plugs.get(plugHash)?.name ?? ''
  }

  getPlugKind(plugHash: number): string {
    return this.plugs.get(plugHash)?.kind ?? ''
  }
}

// Scoring: which rolls each copy can equip.

// Convert a wishlist roll's perks into {kind: [name, ...]}: {} for a roll
// naming no perks, which every copy fits. Returns null when the roll names
// perks but none it can match (unknown hashes, or only origin traits,
// catalysts and masterworks).
export function classifyRoll(roll: WishlistRoll, plugs: PlugCatalog): RollByKind | null {
  if (!roll.perks.length) return {}
  const byKind: RollByKind = {}
  for (const ph of roll.perks) {
    const name = plugs.getPlugName(ph)
    const kind = plugs.getPlugKind(ph)
    if (name && SCORED_KINDS.includes(kind)) (byKind[kind] ??= []).push(name)
  }
  return Object.keys(byKind).length ? byKind : null
}

// Per-kind list of per-socket name sets for one copy.
// {trait: [{socket 1 names}, {socket 2 names}], barrel: [{names}], magazine: [{names}]}
export function copyPools(instance: WeaponInstance): Record<string, Set<string>[]> {
  const pools: Record<string, Set<string>[]> = {}
  for (const socket of instance.roll) {
    if (SCORED_KINDS.includes(socket.kind)) (pools[socket.kind] ??= []).push(new Set(socket.perks))
  }
  return pools
}

// True when wanted[i], wanted[i + 1], ... each sit in a different socket
// not in used.
function fits(wanted: string[], sockets: Set<string>[], used: number[] = []): boolean {
  if (used.length === wanted.length) return true
  return sockets.some(
    (names, idx) => !used.includes(idx) && names.has(wanted[used.length]) && fits(wanted, sockets, [...used, idx]),
  )
}

// True when every perk in the roll fits a different socket of its kind on
// the copy. Brute force over socket orders is fine: at most two trait
// sockets, and one of each other kind.
export function canEquip(rollByKind: RollByKind, pools: Record<string, Set<string>[]>): boolean {
  return Object.entries(rollByKind).every(([kind, wanted]) => {
    const sockets = pools[kind] ?? []
    return wanted.length <= sockets.length && fits(wanted, sockets)
  })
}

// One classified roll: [rollId, isTrash, byKind].
type Classified = [number, boolean, RollByKind]

// {instanceId: InstanceWishlistScore} for every copy. rollsBySource is
// {sourceKey: {itemHash: [WishlistRoll]}} from loadAll.
export function scoreAllInstances(
  allInstances: WeaponInstance[],
  rollsBySource: Map<string, RollsByItem>,
  plugs: PlugCatalog,
): Map<string, InstanceWishlistScore> {
  const scores = new Map<string, InstanceWishlistScore>()
  if (!rollsBySource.size) return scores

  // Classify every roll once, trash included: trash matches don't score, but
  // the report flags the copies they fit. Rolls are bucketed by itemHash;
  // wildcard rolls are checked for every copy. A weapon any list mentions is
  // covered, whether or not its rolls can be scored.
  const specific = new Map<number, Classified[]>()
  const wildcards: Classified[] = []
  const covered = new Set<number>()
  for (const rollsByItem of rollsBySource.values()) {
    for (const [itemHash, rolls] of rollsByItem) {
      let bucket = wildcards
      if (itemHash !== WILDCARD_ITEM_HASH) {
        covered.add(itemHash)
        if (!specific.has(itemHash)) specific.set(itemHash, [])
        bucket = specific.get(itemHash)!
      }
      for (const roll of rolls) {
        const byKind = classifyRoll(roll, plugs)
        if (byKind === null) continue
        bucket.push([roll.rollId, roll.isTrash, byKind])
      }
    }
  }

  for (const inst of allInstances) {
    const pools = copyPools(inst)
    const matched = [...(specific.get(inst.itemHash) ?? []), ...wildcards].filter(([, , byKind]) =>
      canEquip(byKind, pools),
    )
    scores.set(inst.instanceId, {
      matchCount: matched.filter(([, isTrash]) => !isTrash).length,
      hasWishlist: covered.has(inst.itemHash),
      matchedRollIds: matched.map(([rollId]) => rollId),
    })
  }
  return scores
}
