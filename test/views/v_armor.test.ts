// Tests for v_armor (schema/views/v_armor.sql): every armor copy with its
// base stats, set and bonuses, class, slot and exotic perk, read from rows
// written the way the ingest and the profile extract write them.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, expect, test } from 'vitest'
import { STAT_KEYS } from '../../build/db.ts'
import * as c from '../helpers.ts'

const STATS = ['health', 'melee', 'grenade', 'super_stat', 'class_stat', 'weapons']
const STAT_HASHES = Object.fromEntries(Object.entries(STAT_KEYS).map(([h, key]) => [key, Number(h)]))

let db: Database
beforeEach(() => {
  db = c.testDb()
  return () => db.close()
})

function armor(instanceId: string) {
  return db.selectObject('SELECT * FROM v_armor WHERE instance_id = ?', [instanceId])!
}

test('base stats add up the stat plugs', () => {
  // The two stat plugs count; the masterwork and tuning plugs don't.
  c.addArmorDef(db, 200, { sockets: [null, c.ARMOR_STAT_PLUG_A, c.ARMOR_STAT_PLUG_A, null] })
  c.addCopy(db, 'a1', 200, [c.MW_PLUG_FULL, c.ARMOR_STAT_PLUG_A, c.ARMOR_STAT_PLUG_A, c.TUNING_HEALTH])
  c.addCopy(db, 'bare', 200)
  const a1 = armor('a1')
  const bare = armor('bare')
  expect(STATS.map((s) => a1[s])).toEqual([20, 14, 30, 16, 10, 24])
  expect(STATS.map((s) => bare[s])).toEqual([0, 0, 0, 0, 0, 0])
})

test("an intrinsic plug's stats count too", () => {
  // An exotic class item's "Spirit of" perk carries stats, and so does an
  // older exotic's perk: here Solipsism's Spirit of Inmost Light, +30 super
  // and +25 melee.
  db.exec(
    'INSERT INTO DestinyInventoryItemDefinition (hash, name, plugCategoryIdentifier, investmentStats) ' +
      "VALUES (9201, 'Spirit of Inmost Light', 'intrinsics', ?)",
    {
      bind: [
        JSON.stringify([
          { statTypeHash: STAT_HASHES.super_stat, value: 30 },
          { statTypeHash: STAT_HASHES.melee, value: 25 },
        ]),
      ],
    },
  )
  c.addArmorDef(db, 300, { name: 'Solipsism', setName: '', tier: 6, slot: 'Class Armor', armorClass: 'Warlock' })
  c.addCopy(db, 'x1', 300, [c.ARMOR_STAT_PLUG_A, 9201])
  expect(STATS.map((s) => armor('x1')[s])).toEqual([10, 32, 15, 38, 5, 12])
})

// Armor outside a set is named after its item, without the slot word: one
// name per slot (the gauntlets and chest are legacy pieces from the live
// vault), then a slot word in another case, a last word that isn't a slot,
// one word, and a blank or whitespace-only name.
const SET_NAMES = [
  ['Bushido Helm', 'Bushido'],
  ['Red Moon Phantom Grips', 'Red Moon Phantom'],
  ['Frumious Vest', 'Frumious'],
  ['Iron Will Strides', 'Iron Will'],
  ['Reverie Dawn Cloak', 'Reverie Dawn'],
  ['Iron Forerunner HELM', 'Iron Forerunner'],
  ['Exotic Engram', 'Exotic Engram'],
  ['Helm', 'Helm'],
  ['', 'Unknown Armor'],
  ['   ', '   '],
]

test.each(SET_NAMES)('set name outside a set drops the slot word: %j', (name, setName) => {
  c.addArmorDef(db, 200, { name, setName: '' })
  c.addCopy(db, 'a1', 200)
  expect(armor('a1').set_name).toBe(setName)
})

test('set bonuses, class and slot', () => {
  // A set's bonuses are each perk's name and text as Bungie wrote it; armor
  // outside a set has none.
  c.addArmorDef(db, 200, { name: 'Luminopotent Boots', setName: 'Luminopotent', setHash: 77 })
  c.addArmorDef(db, 201, { name: 'Old Helm', setName: '' })
  db.exec('INSERT INTO DestinySandboxPerkDefinition (hash, name, description) VALUES (?, ?, ?), (?, ?, ?)', {
    bind: [701, 'Ionic Overclock', 'Gain [Arc] energy.', 702, 'Shock and Clear', 'Kills\n\njolt.'],
  })
  c.addSetPerks(db, 77, [
    [2, 701],
    [4, 702],
  ])
  c.addCopy(db, 'set', 200)
  c.addCopy(db, 'none', 201)
  const inSet = armor('set')
  const none = armor('none')
  expect([inSet.set_name, inSet.two_pc, inSet.four_pc]).toEqual([
    'Luminopotent',
    'Ionic Overclock: Gain [Arc] energy.',
    'Shock and Clear: Kills\n\njolt.',
  ])
  expect([inSet.armor_class, inSet.slot]).toEqual(['Titan', 'Helmet'])
  expect([none.set_name, none.two_pc, none.four_pc]).toEqual(['Old', null, null])
})

test("an exotic's perk is its starting intrinsic", () => {
  // The definition's starting plug, whichever perk the copy holds.
  c.addArmorDef(db, 300, { name: 'Heart', setName: '', tier: 6, sockets: [c.INTRINSIC_ADAPTIVE] })
  c.addCopy(db, 'x1', 300, [c.INTRINSIC_AGGRESSIVE])
  const x1 = armor('x1')
  expect([x1.is_exotic, x1.exotic_perk_name, x1.exotic_perk_desc]).toEqual([
    1,
    'Adaptive Frame',
    'A well-rounded grip.',
  ])
})
