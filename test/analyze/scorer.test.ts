// Scorer tests (src/analyze/wishlists/scorer.ts): loading the stored rolls,
// and counting the non-trash wishlist rolls each copy can equip. A roll names
// its perks by hash; their names and kinds come from the test database's
// plugs (v_plug), through the same PlugCatalog a run uses. Ported from
// d2-inventory-report's tests/analyze/wishlists/test_scorer.py.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import { classifyRoll, loadWishlist, PlugCatalog, scoreAllInstances } from '../../src/analyze/wishlists/scorer.ts'
import { insertMany } from '../../src/db.ts'
import { type WeaponInstance, WILDCARD_ITEM_HASH, type WishlistRoll } from '../../src/models.ts'
import { parseWishlistText, save } from '../../src/wishlists.ts'
import * as c from '../helpers.ts'

const [X, Y] = [c.BARREL_PERK_X, c.BARREL_PERK_Y] // Hammer-Forged Rifling, Fluted Barrel
const P = c.MAG_PERK_P // Appended Mag
// Rampage, Kill Clip, Outlaw
const [A, B, C] = [c.TRAIT_PERK_A, c.TRAIT_PERK_B, c.TRAIT_PERK_C]

let db: Database
let plugs: PlugCatalog
beforeEach(() => {
  db = c.testDb()
  plugs = new PlugCatalog(db)
  return () => db.close()
})

// A weapon copy whose roll has a barrel and a magazine socket (when given)
// and two trait sockets, each holding the named perks.
function makeCopy(
  instanceId: string,
  itemHash: number,
  barrels: string[],
  magazines: string[],
  trait1: string[],
  trait2: string[],
): WeaponInstance {
  const roll = []
  if (barrels.length) roll.push({ kind: 'barrel', perks: barrels })
  if (magazines.length) roll.push({ kind: 'magazine', perks: magazines })
  roll.push({ kind: 'trait', perks: trait1 })
  roll.push({ kind: 'trait', perks: trait2 })
  return { instanceId, itemHash, roll }
}

// A wishlist roll naming perks, each with its own roll id.
let nextRollId = 1
function roll(perks: number[] = [], { trash = false, itemHash = 100 } = {}): WishlistRoll {
  return { itemHash, rollId: nextRollId++, perks, tags: new Set(), isTrash: trash }
}

// {sourceKey: {itemHash: [WishlistRoll]}} from plain objects.
function sources(bySource: Record<string, [number, WishlistRoll[]][]>): Map<string, Map<number, WishlistRoll[]>> {
  return new Map(Object.entries(bySource).map(([key, items]) => [key, new Map(items)]))
}

test('roll perks are sorted by their plug kind', () => {
  // Barrels, magazines and traits are matched; the origin trait, the tracker
  // and an unknown hash are left out.
  const r = roll([X, P, A, B, c.ORIGIN_PERK, c.KILL_TRACKER, 999999])
  expect(classifyRoll(r, plugs)).toEqual({
    barrel: ['Hammer-Forged Rifling'],
    magazine: ['Appended Mag'],
    trait: ['Rampage', 'Kill Clip'],
  })
})

test('a roll with nothing to match is dropped', () => {
  expect(classifyRoll(roll([c.ORIGIN_PERK, c.KILL_TRACKER]), plugs)).toBeNull()
})

test('single matching roll scores one', () => {
  const copy = makeCopy('c1', 100, ['Hammer-Forged Rifling'], ['Appended Mag'], ['Rampage'], ['Kill Clip'])
  const scores = scoreAllInstances([copy], sources({ voltron: [[100, [roll([X, P, A, B])]]] }), plugs)
  expect(scores.get('c1')!.matchCount).toBe(1)
  expect(scores.get('c1')!.hasWishlist).toBe(true)
})

test('every roll line the copy can equip counts', () => {
  // Two barrels and two possible second traits: a curator's four lines, four
  // matches.
  const copy = makeCopy('c1', 100, ['Hammer-Forged Rifling', 'Fluted Barrel'], [], ['Rampage'], ['Kill Clip', 'Outlaw'])
  const rolls = [roll([X, A, B]), roll([X, A, C]), roll([Y, A, B]), roll([Y, A, C])]
  const scores = scoreAllInstances([copy], sources({ voltron: [[100, rolls]] }), plugs)
  expect(scores.get('c1')!.matchCount).toBe(4)
})

test("trash rolls cover the weapon but don't score", () => {
  const copy = makeCopy('c1', 100, ['Hammer-Forged Rifling'], [], ['Rampage'], ['Kill Clip'])
  const scores = scoreAllInstances([copy], sources({ voltron: [[100, [roll([X, A, B], { trash: true })]]] }), plugs)
  expect(scores.get('c1')!.matchCount).toBe(0)
  expect(scores.get('c1')!.hasWishlist).toBe(true)
})

test('a roll naming no perks fits every copy', () => {
  // Like Aegis Shopping's 10 "any roll of this exotic" lines (perks=,),
  // which score, and Voltron's 53 item=-<hash> lines, which trash the whole
  // weapon. A roll naming only perks that aren't matched still fits none.
  const copies = [
    makeCopy('c1', 100, [], [], ['Rampage'], ['Kill Clip']),
    makeCopy('c2', 100, [], [], ['Outlaw'], ['Kill Clip']),
  ]
  const [wish, trash, originOnly] = [roll(), roll([], { trash: true }), roll([c.ORIGIN_PERK])]
  const rolls = sources({ aegis_shopping: [[100, [wish, originOnly]]], voltron: [[100, [trash]]] })
  const scores = scoreAllInstances(copies, rolls, plugs)
  for (const copy of ['c1', 'c2']) {
    expect(scores.get(copy)!.matchedRollIds).toEqual([wish.rollId, trash.rollId])
    expect(scores.get(copy)!.matchCount).toBe(1)
  }
})

test('a weapon a list mentions is covered though no roll scores', () => {
  // Like Aegis Shopping's Choir of One line, which names only its catalyst:
  // the list covers the weapon, but nothing in it can be matched.
  const copy = makeCopy('c1', 100, [], [], ['Rampage'], ['Kill Clip'])
  const scores = scoreAllInstances([copy], sources({ aegis_shopping: [[100, [roll([c.ORIGIN_PERK])]]] }), plugs)
  expect([scores.get('c1')!.matchCount, scores.get('c1')!.hasWishlist]).toEqual([0, true])
})

test("a perk the copy can't roll means no match", () => {
  // Outlaw is in neither trait socket.
  const copy = makeCopy('c1', 100, [], [], ['Rampage'], ['Kill Clip'])
  const scores = scoreAllInstances([copy], sources({ voltron: [[100, [roll([C, B])]]] }), plugs)
  expect(scores.get('c1')!.matchCount).toBe(0)
})

test("a stock the copy can't switch to means no match", () => {
  // A Peculiar Charm switches between Hand-Laid and Short-Action Stock;
  // Voltron's rolls naming Fitted Stock don't fit it.
  insertMany(
    db,
    "INSERT INTO DestinyInventoryItemDefinition (hash, name, plugCategoryIdentifier) VALUES (?, ?, 'stocks')",
    [
      [2101, 'Short-Action Stock'],
      [2102, 'Fitted Stock'],
    ],
  )
  const copy = makeCopy('c1', 100, [], [], ['Rampage'], ['Kill Clip'])
  copy.roll.push({ kind: 'stock', perks: ['Hand-Laid Stock', 'Short-Action Stock'] })
  const [shortAction, fitted] = [roll([2101, A, B]), roll([2102, A, B])]
  const scores = scoreAllInstances([copy], sources({ voltron: [[100, [shortAction, fitted]]] }), new PlugCatalog(db))
  expect(scores.get('c1')!.matchedRollIds).toEqual([shortAction.rollId])
})

test('traits must sit in different sockets', () => {
  // Both trait sockets hold only Rampage, so Rampage + Kill Clip can't fit.
  const copy = makeCopy('c1', 100, [], [], ['Rampage'], ['Rampage'])
  const scores = scoreAllInstances([copy], sources({ voltron: [[100, [roll([A, B])]]] }), plugs)
  expect(scores.get('c1')!.matchCount).toBe(0)
})

test("a wildcard roll scores but doesn't cover", () => {
  // A wildcard roll (item -69420) is checked against every copy; it counts
  // toward the score but doesn't mean a source covers the weapon.
  const copy = makeCopy('c1', 100, [], [], ['Rampage'], ['Kill Clip'])
  const wildcard = roll([A, B], { itemHash: WILDCARD_ITEM_HASH })
  const scores = scoreAllInstances([copy], sources({ voltron: [[WILDCARD_ITEM_HASH, [wildcard]]] }), plugs)
  expect(scores.get('c1')!.matchCount).toBe(1)
  expect(scores.get('c1')!.hasWishlist).toBe(false)
})

test('matches add up across sources and duplicate lines', () => {
  const copy = makeCopy('c1', 100, [], [], ['Rampage'], ['Kill Clip'])
  const bySource = sources({ voltron: [[100, [roll([A, B]), roll([A, B])]]], aegis_endgame: [[100, [roll([A, B])]]] })
  const scores = scoreAllInstances([copy], bySource, plugs)
  expect(scores.get('c1')!.matchCount).toBe(3)
})

test('matched roll ids list only the rolls that fit', () => {
  const copy = makeCopy('c1', 100, [], [], ['Rampage'], ['Kill Clip'])
  const [fits, misses] = [roll([A, B]), roll([A, C])]
  const scores = scoreAllInstances([copy], sources({ voltron: [[100, [fits, misses]]] }), plugs)
  expect(scores.get('c1')!.matchedRollIds).toEqual([fits.rollId])
})

test('no wishlists means no scores', () => {
  const copy = makeCopy('c1', 100, [], [], ['Rampage'], ['Kill Clip'])
  expect(scoreAllInstances([copy], new Map(), plugs)).toEqual(new Map())
})

test("a weapon no source lists scores zero and isn't covered", () => {
  const copy = makeCopy('c1', 999, [], [], ['Rampage'], ['Kill Clip'])
  const scores = scoreAllInstances([copy], sources({ voltron: [[100, [roll([A, B])]]] }), plugs)
  expect(scores.get('c1')!.matchCount).toBe(0)
  expect(scores.get('c1')!.hasWishlist).toBe(false)
})

// Loading the stored rolls

const WISHLIST = `title:Raid picks
//notes:Great for raids |tags:pve,god-pve
dimwishlist:item=100&perks=${X},${A},${B}
dimwishlist:item=100&perks=${Y},${A},${B}
dimwishlist:item=200&perks=${X}
dimtrashlist:item=100&perks=${C}#notes:no
dimwishlist:item=999&perks=${A}
title:Trash list
dimwishlist:item=-300
`

// Store text as source src's rolls, the way a run does.
function saveWishlist(text: string): void {
  save(db, 'src', 'Source', 'http://x', parseWishlistText(text), 'h')
}

test('stored rolls load per weapon in file order', () => {
  // One file line is one roll: a trash roll keeps its perks, a whole-weapon
  // trash roll has none, and a roll for a weapon that isn't stored (999) is
  // gone. A new download replaces the source's rolls.
  for (const itemHash of [100, 200, 300]) c.addWeaponDef(db, itemHash)
  saveWishlist(WISHLIST)
  let loaded = loadWishlist(db, 'src')
  expect(new Set(loaded.keys())).toEqual(new Set([100, 200, 300]))
  expect(loaded.get(100)!.map((r) => [r.perks, r.isTrash])).toEqual([
    [[X, A, B], false],
    [[Y, A, B], false],
    [[C], true],
  ])
  expect(loaded.get(300)!.map((r) => [r.perks, r.isTrash])).toEqual([[[], true]])

  saveWishlist(`dimwishlist:item=300&perks=${Y},77`)
  loaded = loadWishlist(db, 'src')
  expect(Object.fromEntries([...loaded].map(([item, rolls]) => [item, rolls.map((r) => r.perks)]))).toEqual({
    300: [[Y]],
  })
})
