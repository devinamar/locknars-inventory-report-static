// DIM (Destiny Item Manager) tags and notes: what the player wrote on their
// copies in DIM, read from DIM's API (DIM Sync) into item_dim, which the
// report shows on each copy. A port of d2-inventory-report's
// sources/dim/client.py and extract/dim.py, split in two: the page asks DIM
// (fetchDimAnnotations), since it holds the Bungie login, and the report's
// worker saves what the page sends it (saveDimAnnotations). DIM's API needs
// the app's DIM API key, which DIM accepts only from the address it was
// registered for, and the player's Bungie OAuth token, which it trades for a
// DIM token. As in the CLI, that token is asked for on every run and never
// kept. Nothing here loads sqlite-wasm, so the page can import it.
import { type Database } from '@sqlite.org/sqlite-wasm'
import { type Account, type Tokens } from './bungie.ts'
import { saveSourceStatus } from './source-status.ts'

const API = 'https://api.destinyitemmanager.com'

// A tag and/or notes for one item, from DIM; null where it has none (the
// CLI's DIMAnnotation).
export type DimAnnotation = { tag: string | null; notes: string | null }

// What the page learned from DIM, as plain data it can post to the worker:
// the player's annotations by instance id, or why there are none ('skipped'
// without a DIM API key, 'failed' when DIM refused the login or couldn't be
// reached).
export type DimSync =
  | { status: 'fresh'; annotations: Record<string, DimAnnotation> }
  | { status: 'skipped' | 'failed'; reason: string }

// One request to DIM's API, given up after 30 seconds as the CLI's were. An
// error status throws with DIM's reply, which says what's wrong (a key used
// from another address, a login for another account).
async function send(path: string, init: RequestInit): Promise<Response> {
  const url = `${API}${path}`
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status} ${await response.text()}`)
  return response
}

// The player's DIM tags and notes on account, the Destiny account the report
// is for. DIM trades the Bungie login (tokens: its access token and the
// Bungie.net membership id) for a DIM token, which reads the account's tags.
// Never throws, so the page can pass the result on as it is: without a DIM API
// key (VITE_DIM_API_KEY, read at each call so tests can stub it) DIM is
// skipped, as the CLI skipped it, and a refused login or a failed request is
// a failure, with the reason.
export async function fetchDimAnnotations(tokens: Tokens, account: Account): Promise<DimSync> {
  const apiKey = import.meta.env.VITE_DIM_API_KEY
  if (!apiKey) return { status: 'skipped', reason: 'No DIM API key' }
  try {
    const login = await send('/auth/token', {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bungieAccessToken: tokens.access_token, membershipId: tokens.membership_id }),
    })
    const { accessToken } = await login.json()
    const query = new URLSearchParams({ platformMembershipId: account.membershipId, components: 'tags' })
    const reply = await send(`/profile?${query}`, {
      headers: { 'X-API-Key': apiKey, Authorization: `Bearer ${accessToken}` },
    })
    // DIM sends each id as text; one sent as a number is read from the reply's
    // own digits, since an instance id is longer than a JS number holds exactly.
    const { tags = [] }: { tags?: Record<string, any>[] } = JSON.parse(
      await reply.text(),
      (key, value, context?: { source: string }) =>
        key === 'id' && typeof value === 'number' ? (context?.source ?? value) : value,
    )
    // Keyed by instance id as text: an entry without an id is skipped, and a
    // missing tag or note is null.
    const annotations = Object.fromEntries(
      tags.filter((a) => a.id).map((a) => [String(a.id), { tag: a.tag ?? null, notes: a.notes ?? null }]),
    )
    return { status: 'fresh', annotations }
  } catch (error) {
    return { status: 'failed', reason: String(error) }
  }
}

// Save what the page learned from DIM, with DIM's status (the CLI's
// extract/dim.py). Fresh annotations replace item_dim. DIM also knows items
// the inventory doesn't hold (postmaster, dismantled copies), so only
// instance ids in DestinyItemComponent are saved, which is why this runs
// after the profile is saved; the foreign key would reject the rest. Skipped
// or failed, item_dim stays as it was, and a failure with tags stored is
// 'stale', as in the CLI. Each report starts from a new database, though, so
// the site's failures are 'failed'.
export function saveDimAnnotations(db: Database, dim: DimSync): void {
  if (dim.status !== 'fresh') {
    const stored = dim.status === 'failed' && db.selectValue('SELECT 1 FROM item_dim LIMIT 1')
    saveSourceStatus(db, 'dim', stored ? 'stale' : dim.status)
    return
  }
  // The annotations go in as one JSON object rather than a row each.
  db.transaction(() => {
    db.exec('DELETE FROM item_dim')
    db.exec(
      "INSERT INTO item_dim (instance_id, tag, notes) SELECT key, value ->> 'tag', value ->> 'notes' " +
        'FROM json_each(?) WHERE key IN (SELECT itemInstanceId FROM DestinyItemComponent)',
      { bind: [JSON.stringify(dim.annotations)] },
    )
  })
  saveSourceStatus(db, 'dim', 'fresh')
}
