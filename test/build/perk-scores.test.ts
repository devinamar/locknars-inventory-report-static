// Tests for d2-perk-popularity's scores (build/perk-scores.ts): the published
// perk_scores.json lands in perk_popularity_weapon and perk_popularity_file
// with its numbers as written, a new file replaces the stored one, and a file
// that can't be fetched or read throws, saving nothing. fetch is a stand-in
// answering as GitHub's raw file host does: JSON served as text/plain, and a
// 404 for a file that isn't there. The sample is trimmed from the scores of
// 2026-10-25: the PvP magazine of Found Verdict (Episode: Heresy), one of two
// weapons its trait pools split it into; the origin column of Reckless
// Endangerment (Witch Queen), which no hard-content copy voted in; and The
// Jade Rabbit, a fixed roll with no columns.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createDb } from '../../build/db.ts'
import { SCORES_URL, extractPerkScores, saveScores } from '../../build/perk-scores.ts'
import * as c from '../helpers.ts'

const TEXT = { 'Content-Type': 'text/plain; charset=utf-8' }
// The float 0.0 as Python writes it; JSON.stringify would write 0.
const ZERO = JSON.rawJSON('0.0')

const GENERATED_AT = '2026-10-25T15:18:40Z'
const FOUND_VERDICT = {
  name: 'Found Verdict (Episode: Heresy)',
  type: 'Shotgun',
  item_hash: 694500607,
  rank: 48,
  players: 157,
  active_players: 157,
  family: 'Found Verdict',
  item_hashes: [694500607, 851296754],
  hard: true,
  hard_weight: 0.699,
  groups: { hard: { copies: 47, n_eff: 46.5 }, normal: { copies: 113, n_eff: 109.9 } },
  last_seen: '2026-10-23T22:13:09Z',
  stale: false,
  columns: [
    {
      kind: 'magazine',
      n_eff: 88.3,
      credibility: 0.75,
      confidence: 'medium',
      hard: { n_eff: 46.5, credibility: 0.61 },
      normal: { n_eff: 109.9, credibility: 0.79 },
      perks: [
        { perk: 'Accurized Rounds', share: 0.786, low: 0.69, high: 0.859, hard: 0.815, normal: 0.718 },
        { perk: 'Assault Mag', share: 0.082, low: 0.041, high: 0.159, hard: 0.065, normal: 0.122 },
      ],
    },
  ],
}
const RECKLESS_ENDANGERMENT = {
  name: 'Reckless Endangerment (Witch Queen)',
  type: 'Shotgun',
  item_hash: 3216652511,
  rank: 737,
  players: 6,
  active_players: 6,
  family: 'Reckless Endangerment',
  item_hashes: [3216652511],
  hard: false,
  hard_weight: ZERO,
  groups: { hard: { copies: 0, n_eff: ZERO }, normal: { copies: 6, n_eff: 4.8 } },
  last_seen: '2026-10-23T20:22:26Z',
  stale: false,
  columns: [
    {
      kind: 'origin',
      n_eff: 4.8,
      credibility: 0.14,
      confidence: 'very low',
      hard: null,
      normal: { n_eff: 4.8, credibility: 0.14 },
      perks: [{ perk: "Vanguard's Vindication", share: 0.75, low: 0.33, high: 0.948, hard: null, normal: 0.75 }],
    },
  ],
}
const JADE_RABBIT = {
  name: 'The Jade Rabbit',
  type: 'Scout Rifle',
  item_hash: 3844694310,
  rank: 7,
  players: 1188,
  active_players: 1188,
  family: 'The Jade Rabbit',
  item_hashes: [3844694310],
  hard: true,
  hard_weight: 0.727,
  groups: { hard: { copies: 188, n_eff: 187.5 }, normal: { copies: 1023, n_eff: 1017.5 } },
  last_seen: '2026-10-23T22:13:43Z',
  stale: false,
  columns: [],
}
// The file now carries its schema_version too.
const SCORES = {
  schema_version: 1,
  generated_at: GENERATED_AT,
  settings: { window_days: 30, rescue_copies: 10, raw_days: 14, hard_weight: 0.75, credibility_k: 30 },
  categories: [
    { key: 'raid_master', label: 'Master raid', side: 'pve', weight: 32, hard: true },
    { key: 'trials', label: 'Trials of Osiris', side: 'pvp', weight: 8, hard: true },
  ],
  pve: [RECKLESS_ENDANGERMENT],
  pvp: [JADE_RABBIT, FOUND_VERDICT],
}

let db: Database
beforeEach(() => {
  db = createDb()
  return () => db.close()
})
afterEach(() => {
  vi.restoreAllMocks()
})

// Swap fetch for one answering scores as the published file; returns the
// stand-in, which records the calls.
function download(scores: object) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(scores), { headers: TEXT }))
}

function status() {
  return db.selectArray("SELECT status, detail FROM source_status WHERE source = 'perk_popularity'")
}

// [weapons, file rows, statuses] stored.
function saved() {
  return ['perk_popularity_weapon', 'perk_popularity_file', 'source_status'].map((table) =>
    db.selectValue(`SELECT count(*) FROM ${table}`),
  )
}

// The download.

test('the scores file is fetched from the data branch', async () => {
  const fetch = download({ ...SCORES, generated_at: '2026-10-23T23:51:33Z', pve: [], pvp: [JADE_RABBIT] })
  await extractPerkScores(db)
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([SCORES_URL])
  expect(db.selectValues('SELECT generated_at FROM perk_popularity_file')).toEqual(['2026-10-23T23:51:33Z'])
})

test('a missing file throws and saves nothing', async () => {
  // GitHub's reply on 2026-10-23, while the repo was private, and to a file
  // not published yet.
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('404: Not Found', { status: 404, headers: TEXT }))
  await expect(extractPerkScores(db)).rejects.toThrow(`${SCORES_URL}: HTTP 404`)
  expect(saved()).toEqual([0, 0, 0])
})

test('a downloaded file lands in the tables', async () => {
  // Each weapon's own values as columns, its groups and columns as published;
  // the file's settings and categories in its one row.
  download(SCORES)
  await extractPerkScores(db)
  expect(
    db.selectArrays(
      "SELECT side, name, rank, hard, stale, groups ->> '$.hard.copies', json_array_length(columns) " +
        'FROM perk_popularity_weapon ORDER BY side, rank',
    ),
  ).toEqual([
    ['pve', 'Reckless Endangerment (Witch Queen)', 737, 0, 0, 0, 1],
    ['pvp', 'The Jade Rabbit', 7, 1, 0, 188, 0],
    ['pvp', 'Found Verdict (Episode: Heresy)', 48, 1, 0, 47, 1],
  ])
  const [family, itemHashes, columns] = db.selectArray(
    'SELECT family, item_hashes, columns FROM perk_popularity_weapon ' +
      "WHERE name = 'Found Verdict (Episode: Heresy)'",
  )!
  expect([family, JSON.parse(itemHashes as string)]).toEqual(['Found Verdict', [694500607, 851296754]])
  expect(JSON.parse(columns as string)).toEqual(FOUND_VERDICT.columns)
  expect(
    db.selectArrays(
      "SELECT columns ->> '$[0].kind', columns ->> '$[0].hard', " +
        "columns ->> '$[0].perks[0].perk', columns ->> '$[0].perks[0].hard' " +
        "FROM perk_popularity_weapon WHERE family = 'Reckless Endangerment'",
    ),
  ).toEqual([['origin', null, "Vanguard's Vindication", null]])
  const file = db
    .selectArrays('SELECT * FROM perk_popularity_file')
    .map(([at, settings, categories]) => [at, JSON.parse(settings as string), JSON.parse(categories as string)])
  expect(file).toEqual([[GENERATED_AT, SCORES.settings, SCORES.categories]])
  expect(status()).toEqual(['fresh', GENERATED_AT])
})

test('a new file replaces the stored one', async () => {
  saveScores(db, JSON.stringify(SCORES))
  download({ ...SCORES, generated_at: '2026-10-26T08:31:00Z', pve: [], pvp: [JADE_RABBIT] })
  await extractPerkScores(db)
  expect(db.selectValues('SELECT name FROM perk_popularity_weapon')).toEqual(['The Jade Rabbit'])
  expect(db.selectValues('SELECT generated_at FROM perk_popularity_file')).toEqual(['2026-10-26T08:31:00Z'])
  expect(status()).toEqual(['fresh', '2026-10-26T08:31:00Z'])
})

// Reading the file.

test('a whole-number float stays a REAL', () => {
  // Python writes the float 50 as 50.0, which SQLite reads as a REAL; 50
  // would be an INTEGER, and the views divide these values, which drops the
  // remainder between integers.
  const gun = { ...JADE_RABBIT, columns: [c.popularityColumn('magazine', [['Accurized Rounds', 0.5]], 50)] }
  saveScores(db, JSON.stringify({ ...SCORES, pvp: [gun] }))
  expect(
    db.selectArray(
      "SELECT columns -> '$[0].n_eff', typeof(columns ->> '$[0].n_eff'), columns ->> '$[0].n_eff' / 100 " +
        "FROM perk_popularity_weapon WHERE side = 'pvp'",
    ),
  ).toEqual(['50.0', 'real', 0.5])
  // Reckless Endangerment's hard group, with 0.0 effective votes.
  expect(
    db.selectArray(
      "SELECT groups -> '$.hard.n_eff', typeof(groups ->> '$.hard.n_eff') " +
        "FROM perk_popularity_weapon WHERE side = 'pve'",
    ),
  ).toEqual(['0.0', 'real'])
})

test.each([
  ['2', { schema_version: 2 }],
  ['none', { schema_version: undefined }],
])('a file of another schema_version throws and saves nothing: %s', async (found, change) => {
  // The repo raises schema_version when a key is renamed, removed or changes
  // meaning; a file this build can't read fails it.
  download({ ...SCORES, ...change })
  await expect(extractPerkScores(db)).rejects.toThrow(`perk_scores.json: expected schema_version 1, found ${found}`)
  expect(saved()).toEqual([0, 0, 0])
})
