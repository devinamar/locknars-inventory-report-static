// Tests for DIM's tags and notes (src/dim.ts), ported from
// d2-inventory-report's tests/sources/dim/test_client.py and
// tests/extract/test_dim.py: trading the Bungie login for a DIM token and
// reading the player's DIM tags and notes; and the DIM step, which saves them
// for the copies in the vault, is skipped without a DIM API key, and keeps the
// stored tags when DIM refuses the login. DIM's API (fetch) is a stand-in.
// The CLI also skipped DIM without a Bungie login; the site builds no report
// without one.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { type Account, type Tokens } from '../src/bungie.ts'
import { fetchDimAnnotations, saveDimAnnotations } from '../src/dim.ts'
import * as c from './helpers.ts'

const API = 'https://api.destinyitemmanager.com'

// The Bungie login, with its Bungie.net membership id, and the Destiny account
// the report is on.
const TOKENS: Tokens = {
  access_token: 'bungie-tok',
  expires_in: 3600,
  membership_id: '7',
  expires_at: Date.now() / 1000 + 3600,
}
const ACCOUNT: Account = {
  membershipType: 3,
  membershipId: '4611686018467000001',
  displayName: 'Name',
  bungieName: 'Name#0042',
}

// One request DIM was sent: its address, method, headers (by lowercase name),
// JSON body, and how long it could take (ms).
type Sent = { url: string; method: string; headers: Record<string, string>; body?: unknown; timeout?: number }

// The login: the Bungie login, sent with the app's DIM API key.
const LOGIN: Sent = {
  url: `${API}/auth/token`,
  method: 'POST',
  headers: { 'x-api-key': 'dim-key', 'content-type': 'application/json' },
  body: { bungieAccessToken: 'bungie-tok', membershipId: '7' },
  timeout: 30_000,
}
// The request for the account's tags, sent with the key and the DIM token.
const PROFILE: Sent = {
  url: `${API}/profile?platformMembershipId=4611686018467000001&components=tags`,
  method: 'GET',
  headers: { 'x-api-key': 'dim-key', authorization: 'Bearer dim-tok' },
  timeout: 30_000,
}

let db: Database
beforeEach(() => {
  db = c.testDb()
  vi.stubEnv('VITE_DIM_API_KEY', 'dim-key')
  return () => db.close()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

// Swap fetch for DIM's API, answering each request with reply(url); returns
// the requests it was sent. A request's timeout is the one AbortSignal.timeout
// made its signal with.
function serve(reply: (url: string) => Response): Sent[] {
  const sent: Sent[] = []
  const timeouts = new WeakMap<AbortSignal, number>()
  const timeout = AbortSignal.timeout
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    const signal = timeout.call(AbortSignal, ms)
    timeouts.set(signal, ms)
    return signal
  })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    sent.push({
      url: String(input),
      method: init.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init.headers)),
      ...(init.body ? { body: JSON.parse(String(init.body)) } : {}),
      timeout: init.signal ? timeouts.get(init.signal) : undefined,
    })
    return reply(String(input))
  })
  return sent
}

// Swap fetch for a DIM whose login works, unless it answers refusal, and whose
// profile holds tags; returns what it was sent.
function dimAnswers(tags: unknown[] = [], refusal?: Response): Sent[] {
  return serve((url) => {
    if (!url.endsWith('/auth/token')) return Response.json({ tags })
    return refusal ?? Response.json({ accessToken: 'dim-tok', expiresInSeconds: 2592000 })
  })
}

// [the stored DIM rows, the step's status].
function stored() {
  const rows = db.selectArrays('SELECT * FROM item_dim ORDER BY instance_id')
  return [rows, db.selectValue("SELECT status FROM source_status WHERE source = 'dim'")]
}

// The client

test('the login trades the Bungie token for a DIM token', async () => {
  // The DIM token then goes with the request for the tags, beside the key.
  const sent = dimAnswers()
  await fetchDimAnnotations(TOKENS, ACCOUNT)
  expect(sent).toEqual([LOGIN, PROFILE])
})

test('a refused login fails and sends no token', async () => {
  // Only the login goes out: without a DIM token the tags aren't asked for.
  const sent = dimAnswers([], new Response('{"error":"Unauthorized"}', { status: 401 }))
  expect(await fetchDimAnnotations(TOKENS, ACCOUNT)).toEqual({
    status: 'failed',
    reason: `Error: ${API}/auth/token: HTTP 401 {"error":"Unauthorized"}`,
  })
  expect(sent).toEqual([LOGIN])
})

test('tags are keyed by instance id as text', async () => {
  // A numeric id becomes text, an entry without an id is skipped, and a
  // missing tag or note is null. The numeric id keeps all its digits, more
  // than a JS number holds.
  const tags = [
    { id: '6917529000000000001', tag: 'keep', notes: 'god roll' },
    { id: JSON.rawJSON('6917529000000000002'), tag: 'junk' },
    { tag: 'favorite' },
  ]
  const sent = dimAnswers(tags)
  expect(await fetchDimAnnotations(TOKENS, ACCOUNT)).toEqual({
    status: 'fresh',
    annotations: {
      '6917529000000000001': { tag: 'keep', notes: 'god roll' },
      '6917529000000000002': { tag: 'junk', notes: null },
    },
  })
  expect(sent).toEqual([LOGIN, PROFILE])
})

// The DIM step

test('without a DIM key the sync is skipped', async () => {
  vi.stubEnv('VITE_DIM_API_KEY', '')
  const sent = dimAnswers()
  saveDimAnnotations(db, await fetchDimAnnotations(TOKENS, ACCOUNT))
  expect([sent, stored()]).toEqual([[], [[], 'skipped']])
})

test('a refused DIM login keeps the stored tags', async () => {
  c.addWeaponDef(db, 100)
  c.addCopy(db, 'w1', 100)
  saveDimAnnotations(db, { status: 'fresh', annotations: { w1: { tag: 'keep', notes: 'god roll' } } })
  const sent = dimAnswers([], new Response('', { status: 401 }))
  saveDimAnnotations(db, await fetchDimAnnotations(TOKENS, ACCOUNT))
  expect(sent).toEqual([LOGIN])
  expect(stored()).toEqual([[['w1', 'keep', 'god roll']], 'stale'])
})

test('tags are saved only for copies in the vault', async () => {
  // DIM keeps the tags of copies dismantled since; the database refuses a row
  // for a copy it doesn't hold.
  c.addWeaponDef(db, 100)
  c.addCopy(db, 'w1', 100)
  const tags = [
    { id: 'w1', tag: 'keep', notes: 'god roll' },
    { id: 'dismantled', tag: 'junk' },
  ]
  const sent = dimAnswers(tags)
  saveDimAnnotations(db, await fetchDimAnnotations(TOKENS, ACCOUNT))
  expect(sent.at(-1)).toEqual(PROFILE)
  expect(stored()).toEqual([[['w1', 'keep', 'god roll']], 'fresh'])
})

test('DIM out of reach fails, with nothing stored', async () => {
  // Not one of the CLI's tests: the site's path. Its report starts from a new
  // database, so a failure is 'failed', never 'stale'. In the browser, DIM
  // turns away a key it doesn't know without CORS headers, so fetch only
  // rejects.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
  const dim = await fetchDimAnnotations(TOKENS, ACCOUNT)
  saveDimAnnotations(db, dim)
  expect([dim, stored()]).toEqual([{ status: 'failed', reason: 'TypeError: Failed to fetch' }, [[], 'failed']])
})
