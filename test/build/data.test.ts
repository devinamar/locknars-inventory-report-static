// Tests for the data build's data_version (build/data.ts), which players'
// kept reports are keyed on: a SHA-256 of what went into the shared database
// — the manifest's version, Clarity's, the perk scores' generated_at, the
// Aegis sheet and each wishlist's file. A scheduled build that finds them as
// they were writes the same data_version, whenever it runs, so the reports
// players keep stay; any source's new content gives a new one. fetch is a
// stand-in answering the Aegis sheet and the wishlist with the text asked
// for.
import { createHash } from 'node:crypto'
import { type Database } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { CSV_URL, extractAegis } from '../../build/aegis.ts'
import { dataVersion } from '../../build/data.ts'
import { createDb } from '../../build/db.ts'
import { saveSourceStatus } from '../../src/source-status.ts'
import { extractWishlist } from '../../src/wishlists.ts'

// The Aegis sheet's banner, column names and one ranked row, as Google sends
// them.
const SHEET =
  'INFO,,,,,,,,,ANALYSIS,,\r\n' +
  '\u{1f5bc}️,#,Set,Season,Bonus,Pcs,Tags,Trigger,Effect,Description,#,Tier\r\n' +
  ',9,"Smoke Jumper\nSolo/Fireteam Ops",27,"Ride Together, Die Together",2,survivability,' +
  'orb pickup,40% DR decaying for 3s,"excellent pairing with Attrition Orbs",6,A\r\n'

// What a data build downloads.
const SOURCES = {
  manifest: '245114.26.10.13.2000-1-bnet.66137',
  clarity: '{"descriptions": 2.0625}',
  scores: '2026-10-25T15:18:40Z',
  sheet: SHEET,
  wishlist: 'dimwishlist:item=100&perks=1,4',
}

let db: Database
beforeEach(() => {
  db = createDb()
  return () => db.close()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// The data_version of a build that found sources: each source's status
// saved as its extract saves it, the sheet and the wishlist downloaded.
async function build(sources = SOURCES): Promise<string> {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (url) => new Response(String(url) === CSV_URL ? sources.sheet : sources.wishlist),
  )
  saveSourceStatus(db, 'manifest', 'fresh', sources.manifest)
  saveSourceStatus(db, 'clarity', 'fresh', sources.clarity)
  saveSourceStatus(db, 'perk_popularity', 'fresh', sources.scores)
  await extractAegis(db)
  await extractWishlist(db, 'voltron', 'Voltron', 'https://example.com/voltron.txt')
  return dataVersion(db)
}

const checkedAt = () => db.selectValues('SELECT checked_at FROM source_status ORDER BY source')

test('the same sources found again, hours later, give the same data_version', async () => {
  // The scheduled build six hours on checks every source again (checked_at)
  // and runs at another time (built_at): neither counts.
  vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-10-28T06:17:00Z') })
  const first = await build()
  const firstChecked = checkedAt()
  vi.setSystemTime(Date.parse('2026-10-28T12:17:00Z'))
  const again = await build()
  expect(checkedAt()).not.toEqual(firstChecked)
  expect(again).toBe(first)
  expect(first).toMatch(/^[0-9a-f]{64}$/)
})

test("the Aegis sheet's version is its CSV's SHA-256", async () => {
  // The sheet has none of its own.
  await build()
  const sha = createHash('sha256').update(SHEET).digest('hex')
  expect(db.selectValue("SELECT detail FROM source_status WHERE source = 'aegis'")).toBe(sha)
})

test("any source's new content gives a new data_version", async () => {
  const first = await build()
  const changes = [
    { manifest: '245200.26.10.27.1700-2-bnet.66201' },
    { clarity: '{"descriptions": 2.0626}' },
    { scores: '2026-11-01T15:20:02Z' },
    { sheet: SHEET.replace(',6,A\r\n', ',7,B\r\n') },
    { wishlist: 'dimwishlist:item=100&perks=1,5' },
  ]
  for (const change of changes) expect(await build({ ...SOURCES, ...change })).not.toBe(first)
})
