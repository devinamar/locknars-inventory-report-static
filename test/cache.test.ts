// Tests for when a kept report is up to date (src/cache.ts): built for the
// same Destiny account from the same Bungie profile, shared data and player's
// settings. The settings are their preferences and own wishlists, as the page
// reads them (src/saved.ts) and keeps them with the report, as JSON.
import { expect, test } from 'vitest'
import { type CachedReport, dimKey, upToDate } from '../src/cache.ts'
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
    profileMinted: '2026-10-28T10:00:00Z',
    dataBuilt: '2026-10-28T06:17:00Z',
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

test('a new profile, new shared data or another account rebuilds it too', () => {
  for (const change of [{ profileMinted: 'later' }, { dataBuilt: 'later' }, { membershipId: '3' }]) {
    expect(upToDate(kept(), { ...kept(), ...change })).toBe(false)
  }
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

test('a report kept before settings were, or none, is not up to date', () => {
  const { settings, ...older } = kept()
  expect(upToDate(older as CachedReport, kept())).toBe(false)
  expect(upToDate(undefined, kept())).toBe(false)
})
