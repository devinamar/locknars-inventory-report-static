// Tests for when a kept report is up to date (src/cache.ts): built for the
// same Destiny account from the same inventory, shared data, site code and
// player's settings. The settings are their preferences and own wishlists, as
// the page reads them (src/saved.ts) and keeps them with the report, as JSON.
// The inventory is keyed by what the report reads of Bungie's profile
// (profileKey), not by when Bungie made it, which changes at every request.
import { expect, test } from 'vitest'
import { type CachedReport, dimKey, profileKey, upToDate } from '../src/cache.ts'
import { type Saved } from '../src/saved.ts'

const SAVED: Saved = {
  preferences: [{ name: 'Bushido', is_exotic: 0, stat_1: 'melee', stat_2: null, stat_3: null, grade: 'A', rank: 1 }],
  wishlists: [{ key: 'my_list', label: 'My List', url: 'https://example.com/list.txt' }],
}

// A report kept for SAVED, built from saved.
function kept(saved: Saved = SAVED): CachedReport {
  return {
    bungieMembershipId: '1',
    membershipId: '2',
    bungieName: 'Guardian#0042',
    profile: 'c0ffee',
    data: '5ca1ab1e',
    code: 'fc5b2c2',
    settings: JSON.stringify(saved),
    dim: dimKey({ status: 'skipped', reason: 'No DIM API key' }),
    html: '<p>report</p>',
  }
}

test('a report built from the same settings is up to date', () => {
  // The HTML isn't compared: the page's new report has none yet.
  expect(upToDate(kept(), { ...kept(), html: '' })).toBe(true)
})

test('changing a preference or a wishlist rebuilds the report', () => {
  const [pref] = SAVED.preferences
  const regraded = { ...SAVED, preferences: [{ ...pref, grade: 'S' }] }
  const repicked = { ...SAVED, preferences: [{ ...pref, stat_2: 'health' }] }
  const noWishlist = { ...SAVED, wishlists: [] }
  for (const saved of [regraded, repicked, noWishlist]) expect(upToDate(kept(), kept(saved))).toBe(false)
})

test('a changed inventory, new shared data, new code or another account rebuilds it too', () => {
  const changes = [{ profile: 'beef' }, { data: 'f00d' }, { code: '9a8b7c6' }, { membershipId: '3' }]
  for (const change of changes) expect(upToDate(kept(), { ...kept(), ...change })).toBe(false)
})

test('a changed DIM tag or note rebuilds it, and DIM answering again', () => {
  const tags = (annotations: Record<string, { tag: string | null; notes: string | null }>) =>
    dimKey({ status: 'fresh', annotations })
  const keep = { tag: 'keep', notes: null }
  const junk = { tag: 'junk', notes: 'dupe' }
  const tagged = { ...kept(), dim: tags({ a: keep, b: junk }) }
  // The same tags in another order are the same.
  expect(upToDate(tagged, { ...kept(), dim: tags({ b: junk, a: keep }) })).toBe(true)
  for (const changed of [tags({ a: keep, b: keep }), tags({ a: keep }), tags({ a: { tag: 'keep', notes: 'x' }, b: junk })]) {
    expect(upToDate(tagged, { ...kept(), dim: changed })).toBe(false)
  }
  // Skipped (no key) becoming fresh rebuilds; failing again, for whatever
  // reason, doesn't.
  expect(upToDate(kept(), tagged)).toBe(false)
  const failed = (reason: string) => ({ ...kept(), dim: dimKey({ status: 'failed', reason }) })
  expect(upToDate(failed('HTTP 503'), failed('timed out'))).toBe(true)
})

test('a report kept before these keys, or none, is not up to date', () => {
  // One keyed on Bungie's and the data build's timestamps is built once more.
  const { profile, data, code, ...rest } = kept()
  const older = { ...rest, profileMinted: '2026-10-28T10:00:00Z', dataBuilt: '2026-10-28T06:17:00Z' }
  expect(upToDate(older as unknown as CachedReport, kept())).toBe(false)
  const { settings, ...unsettled } = kept()
  expect(upToDate(unsettled as CachedReport, kept())).toBe(false)
  expect(upToDate(undefined, kept())).toBe(false)
})

// The profile's key

const CHARACTER = '2305843009300000001'
// Two weapons in the vault and one equipped, by instance id.
const [A, B, C] = ['6917529000000000001', '6917529000000000002', '6917529000000000003']

// A profile as GetProfile sends it, cut down to three weapons: with the
// fields the report reads, and some it doesn't (when Bungie made it, where an
// item is, a stack, a socket's isEnabled, an objective's completionValue).
function profile() {
  const vault = { location: 2, bucketHash: 138197802, quantity: 1 }
  const objective = (progress: number) => ({ objectiveHash: 73837075, progress, completionValue: 1000, complete: false })
  return {
    responseMintedTimestamp: '2026-10-28T10:00:00Z',
    secondaryComponentsMintedTimestamp: '2026-10-28T09:58:00Z',
    profileInventory: {
      data: {
        items: [
          { itemHash: 100, itemInstanceId: A, state: 1, ...vault },
          { itemHash: 101, itemInstanceId: B, state: 0, ...vault },
          { itemHash: 3159615086, state: 0, quantity: 250, location: 2, bucketHash: 3313201758 },
        ],
      },
      privacy: 1,
    },
    characterInventories: { data: { [CHARACTER]: { items: [] } }, privacy: 2 },
    characterEquipment: {
      data: { [CHARACTER]: { items: [{ itemHash: 102, itemInstanceId: C, state: 4, location: 1, bucketHash: 1498876634 }] } },
      privacy: 2,
    },
    itemComponents: {
      instances: {
        data: {
          [A]: { isEquipped: false, primaryStat: { statHash: 1480404414, value: 550 }, gearTier: 5, damageTypeHash: 3373582085, canEquip: true },
          [B]: { isEquipped: false, primaryStat: { statHash: 1480404414, value: 550 }, gearTier: 3, damageTypeHash: 3373582085, canEquip: true },
          [C]: { isEquipped: true, primaryStat: { statHash: 1480404414, value: 550 }, gearTier: 4, damageTypeHash: 1847026933, canEquip: true },
        },
      },
      stats: { data: { [A]: { stats: { 4284893193: { statHash: 4284893193, value: 140 }, 1240592695: { statHash: 1240592695, value: 50 } } } } },
      sockets: {
        data: {
          [A]: { sockets: [{ plugHash: 1, isEnabled: true, isVisible: true }, { plugHash: 2, isEnabled: true, isVisible: true }] },
          [C]: { sockets: [{ plugHash: 5, isEnabled: true, isVisible: true }] },
        },
      },
      reusablePlugs: { data: { [A]: { plugs: { 0: [{ plugItemHash: 1, canInsert: true, enabled: true }, { plugItemHash: 3, canInsert: true, enabled: true }] } } } },
      plugObjectives: { data: { [C]: { objectivesPerPlug: { 905869860: [objective(120)] } } } },
    },
  }
}

type Profile = ReturnType<typeof profile>

// The key of profile() changed by change.
function keyWith(change: (p: Profile) => void): Promise<string> {
  const p = profile()
  change(p)
  return profileKey(p)
}

test("a profile's key is a SHA-256", async () => {
  expect(await profileKey(profile())).toMatch(/^[0-9a-f]{64}$/)
})

test('the same inventory keys the same, whenever Bungie made it and in whatever order it sends it', async () => {
  // Bungie mints a new response at every request; it lists the vault and the
  // components in no promised order; and where a copy lies isn't saved, so a
  // weapon moved from the vault to a character keeps the key.
  const key = await profileKey(profile())
  const same = await keyWith((p) => {
    p.responseMintedTimestamp = '2026-10-28T10:02:00Z'
    p.secondaryComponentsMintedTimestamp = '2026-10-28T10:01:30Z'
    const [a, b, stack] = p.profileInventory.data.items
    p.profileInventory.data.items = [stack, a]
    p.characterInventories.data[CHARACTER].items = [{ ...b, location: 1, bucketHash: 2465295065 }] as never[]
    const { [A]: first, ...rest } = p.itemComponents.instances.data
    p.itemComponents.instances.data = { ...rest, [A]: first } as typeof p.itemComponents.instances.data
  })
  expect(same).toBe(key)
})

test("what the report doesn't read leaves the key alone", async () => {
  const key = await profileKey(profile())
  const changes: ((p: Profile) => void)[] = [
    (p) => (p.profileInventory.data.items[2].quantity = 9999), // a stack, which has no instance
    (p) => (p.itemComponents.sockets.data[A].sockets[0].isEnabled = false),
    (p) => (p.itemComponents.reusablePlugs.data[A].plugs[0][1].canInsert = false),
    (p) => (p.itemComponents.plugObjectives.data[C].objectivesPerPlug[905869860][0].complete = true),
    (p) => (p.itemComponents.instances.data[B].canEquip = false),
  ]
  for (const change of changes) expect(await keyWith(change)).toBe(key)
})

test('a changed plug, stat, objective, state or copy changes the key', async () => {
  // Each is in the report: a perk, a stat bar, a kill tracker's count, a
  // lock or masterwork, a copy.
  const key = await profileKey(profile())
  const changes: ((p: Profile) => void)[] = [
    (p) => (p.itemComponents.sockets.data[A].sockets[1].plugHash = 4),
    (p) => p.itemComponents.reusablePlugs.data[A].plugs[0].push({ plugItemHash: 6, canInsert: true, enabled: true }),
    (p) => (p.itemComponents.stats.data[A].stats[4284893193].value = 150),
    (p) => (p.itemComponents.plugObjectives.data[C].objectivesPerPlug[905869860][0].progress = 121),
    (p) => (p.itemComponents.instances.data[C].primaryStat.value = 560),
    (p) => (p.profileInventory.data.items[1].state = 1),
    (p) => p.profileInventory.data.items.push({ itemHash: 100, itemInstanceId: '6917529000000000004', state: 0, location: 2, bucketHash: 138197802, quantity: 1 }),
    (p) => p.profileInventory.data.items.splice(0, 1),
  ]
  const keys = await Promise.all(changes.map(keyWith))
  for (const changed of keys) expect(changed).not.toBe(key)
})
