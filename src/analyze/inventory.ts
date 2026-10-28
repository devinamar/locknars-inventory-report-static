// Reads the stored inventory back as WeaponInstance and ArmorInstance objects
// for the analysis, from the views over the item tables (v_weapon,
// v_weapon_roll, v_armor, v_armor_tuning) that src/profile.ts fills.
// Ported from d2-inventory-report's analyze/inventory.py.
import { type Database } from '@sqlite.org/sqlite-wasm'
import {
  ARMOR_STAT_NAMES,
  type ArmorInstance,
  type ArmorStats,
  type PerkSocket,
  type WeaponInstance,
} from '../models.ts'

// The lowest weapon tier the analysis compares (tierType 5, Legendary); every
// copy below it is flagged.
export const TIER_FLOOR = 5

// {instanceId: [PerkSocket]}: each weapon copy's perk sockets in socket
// order, each socket's perks in the game's order.
export function loadRolls(db: Database): Map<string, PerkSocket[]> {
  const socketsByInstance = new Map<string, Map<number, PerkSocket>>()
  const rows = db.selectArrays(
    'SELECT instance_id, socket_idx, kind, perk FROM v_weapon_roll ORDER BY instance_id, socket_idx, position',
  ) as [string, number, string, string][]
  for (const [instanceId, socketIdx, kind, perk] of rows) {
    if (!socketsByInstance.has(instanceId)) socketsByInstance.set(instanceId, new Map())
    const sockets = socketsByInstance.get(instanceId)!
    if (!sockets.has(socketIdx)) sockets.set(socketIdx, { kind, perks: [] })
    sockets.get(socketIdx)!.perks.push(perk)
  }
  return new Map([...socketsByInstance].map(([instanceId, sockets]) => [instanceId, [...sockets.values()]]))
}

// The weapon copies the analysis compares, lowest itemInstanceId first:
// Legendary and Exotic copies with at least one trait socket, each with
// its roll. Lower tiers and copies without traits stay stored but aren't
// compared.
export function loadWeapons(db: Database): WeaponInstance[] {
  const rolls = loadRolls(db)
  const rows = db.selectArrays(
    'SELECT v.instance_id, v.item_hash FROM v_weapon v ' +
      'WHERE v.tier >= ? AND EXISTS (' +
      '  SELECT 1 FROM v_weapon_roll r ' +
      "  WHERE r.instance_id = v.instance_id AND r.kind = 'trait') " +
      'ORDER BY v.instance_id',
    [TIER_FLOOR],
  ) as [string, number][]
  return rows.map(([instanceId, itemHash]) => ({ instanceId, itemHash, roll: rolls.get(instanceId) ?? [] }))
}

// The instance ids of the weapon copies below Legendary, lowest first.
export function loadBelowLegendary(db: Database): string[] {
  return db.selectValues('SELECT instance_id FROM v_weapon WHERE tier < ? ORDER BY instance_id', [
    TIER_FLOOR,
  ]) as string[]
}

// Current armor copies, lowest itemInstanceId first. Each row is one
// copy, built with its definition (an Armor).
export function loadArmor(db: Database): ArmorInstance[] {
  const tuningByInstance = new Map<string, Set<string>>()
  for (const [instanceId, stat] of db.selectArrays('SELECT instance_id, stat FROM v_armor_tuning') as string[][]) {
    if (!tuningByInstance.has(instanceId)) tuningByInstance.set(instanceId, new Set())
    tuningByInstance.get(instanceId)!.add(stat)
  }
  return db.selectObjects('SELECT * FROM v_armor ORDER BY instance_id').map((r: any) => ({
    instanceId: r.instance_id,
    armor: {
      name: r.name,
      setName: r.set_name,
      setBonus: r.set_hash !== null ? { twoPieceBonus: r.two_pc, fourPieceBonus: r.four_pc } : null,
      isExotic: Boolean(r.is_exotic),
      exoticEffect: r.is_exotic ? { name: r.exotic_perk_name, description: r.exotic_perk_desc } : null,
    },
    stats: Object.fromEntries(ARMOR_STAT_NAMES.map((s) => [s, r[s]])) as ArmorStats,
    gearTier: r.gear_tier,
    tuningStats: ARMOR_STAT_NAMES.filter((s) => tuningByInstance.get(r.instance_id)?.has(s)),
  }))
}
