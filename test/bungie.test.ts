// Tests for the Bungie login and API calls (src/bungie.ts), against stand-ins
// for Bungie (fetch) and the browser's storage and address. Ported from the
// CLI's tests/sources/bungie/test_oauth.py and test_api.py where the
// behavior carries over; its local callback server and player search have no
// counterpart here.
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import * as bungie from '../src/bungie.ts'

const ACCOUNT = { membershipType: 3, membershipId: '4611686018400000001', displayName: 'Name', bungieName: 'Name#0042' }

// A Storage kept in a Map, standing in for localStorage and sessionStorage.
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, String(value)),
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
    key: (i) => [...items.keys()][i] ?? null,
    get length() {
      return items.size
    },
  }
}

// Tokens as Bungie hands them over, expiring secondsLeft from now.
function tokens(secondsLeft: number, access = 'saved-access'): bungie.Tokens {
  return {
    access_token: access,
    refresh_token: 'saved-refresh',
    expires_in: 3600,
    membership_id: '12345',
    expires_at: Date.now() / 1000 + secondsLeft,
  }
}

// Swap fetch for Bungie: each request is recorded as [url, init] and answered
// by reply. Returns the record.
function serve(reply: (url: string, init?: RequestInit) => Response): [string, RequestInit | undefined][] {
  const sent: [string, RequestInit | undefined][] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    sent.push([String(input), init])
    return reply(String(input), init)
  })
  return sent
}

// A token endpoint granting fresh tokens, recording each grant's form.
function grantTokens(grants: URLSearchParams[]) {
  return serve((url, init) => {
    if (!url.includes('/oauth/token/')) throw new Error(`unexpected request to ${url}`)
    grants.push(new URLSearchParams(String(init!.body)))
    return Response.json({ access_token: 'new-access', expires_in: 3600, membership_id: '12345' })
  })
}

function bungieReply(response: unknown, errorCode = 1, message = 'Ok') {
  return Response.json({ Response: response, ErrorCode: errorCode, Message: message })
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
  vi.stubGlobal('location', { assign: vi.fn() })
  vi.stubEnv('VITE_BUNGIE_API_KEY', 'KEY')
  vi.stubEnv('VITE_BUNGIE_CLIENT_ID', 'ID')
  vi.stubEnv('VITE_BUNGIE_CLIENT_SECRET', 'SECRET')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('saved tokens round trip', () => {
  const saved = tokens(1000)
  bungie.saveTokens(saved)
  expect(bungie.loadTokens()).toEqual(saved)
})

test.each(['', '{not json', 'null'])('unreadable saved tokens count as no login: %j', (text) => {
  localStorage.setItem('bungie-tokens', text)
  expect(bungie.loadTokens()).toBe(null)
})

test("a refused token request throws with Bungie's reply", async () => {
  serve(() => new Response('{"error":"invalid_grant"}', { status: 400 }))
  await expect(bungie.requestTokens({ grant_type: 'refresh_token', refresh_token: 'x' })).rejects.toThrow(
    'Bungie refused the token request: {"error":"invalid_grant"}',
  )
})

test('the login page asks Bungie for a code for this app', () => {
  // The state goes along, kept to check against Bungie's redirect.
  bungie.startLogin()
  const url = new URL(vi.mocked(location.assign).mock.calls[0][0] as string)
  expect(url.origin + url.pathname).toBe('https://www.bungie.net/en/OAuth/Authorize')
  expect([url.searchParams.get('client_id'), url.searchParams.get('response_type')]).toEqual(['ID', 'code'])
  expect(url.searchParams.get('state')).toBe(sessionStorage.getItem('bungie-login-state'))
  expect(url.searchParams.get('state')).toMatch(/^[0-9a-f]{32}$/)
})

test('a redirect with a foreign state is refused', async () => {
  sessionStorage.setItem('bungie-login-state', 'mine')
  await expect(bungie.finishLogin('?code=abc&state=theirs')).rejects.toThrow('state mismatch')
})

test("a redirect without a code is refused with Bungie's reason", async () => {
  sessionStorage.setItem('bungie-login-state', 'mine')
  await expect(bungie.finishLogin('?error=access_denied&state=mine')).rejects.toThrow(
    'Bungie sent no login code (access_denied)',
  )
})

test('an address without an answer from Bungie is no login', async () => {
  await expect(bungie.finishLogin('')).resolves.toBe(null)
})

test('a saved token is used without asking Bungie', async () => {
  const sent = serve(() => {
    throw new Error('no request expected')
  })
  bungie.saveTokens(tokens(1000))
  expect((await bungie.authenticate())!.access_token).toBe('saved-access')
  expect(sent).toEqual([])
})

test.each([-10, 0, bungie.EXPIRY_MARGIN - 1])(
  'an expired or expiring token is refreshed: %i seconds left',
  async (secondsLeft) => {
    // The refresh response names no refresh token or membership id; the saved
    // ones carry over, and the merged tokens are saved.
    const grants: URLSearchParams[] = []
    grantTokens(grants)
    bungie.saveTokens(tokens(secondsLeft))
    const result = (await bungie.authenticate())!
    expect(Object.fromEntries(grants[0])).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'saved-refresh',
      client_id: 'ID',
      client_secret: 'SECRET',
    })
    expect([result.access_token, result.refresh_token, result.membership_id]).toEqual([
      'new-access',
      'saved-refresh',
      '12345',
    ])
    expect(bungie.loadTokens()).toEqual(result)
  },
)

test("Bungie's login code is exchanged for tokens, which are saved", async () => {
  const grants: URLSearchParams[] = []
  grantTokens(grants)
  sessionStorage.setItem('bungie-login-state', 'mine')
  const result = (await bungie.authenticate('?code=abc&state=mine'))!
  expect(Object.fromEntries(grants[0])).toEqual({
    grant_type: 'authorization_code',
    code: 'abc',
    client_id: 'ID',
    client_secret: 'SECRET',
  })
  expect(result.access_token).toBe('new-access')
  expect(bungie.loadTokens()).toEqual(result)
  // The state is used once.
  expect(sessionStorage.getItem('bungie-login-state')).toBe(null)
})

test('without a saved login, or with a refused refresh, the player has to log in', async () => {
  expect(await bungie.authenticate()).toBe(null)
  serve(() => new Response('expired', { status: 400 }))
  bungie.saveTokens(tokens(-10))
  expect(await bungie.authenticate()).toBe(null)
})

test('the token header is sent only with a token', async () => {
  const sent = serve(() => bungieReply({}))
  await bungie.apiGet('/Destiny2/Manifest/')
  await bungie.apiGet('/Destiny2/Manifest/', 'access')
  const headers = sent.map(([, init]) => new Headers(init?.headers))
  expect(headers.map((h) => [h.get('X-API-Key'), h.get('Authorization')])).toEqual([
    ['KEY', null],
    ['KEY', 'Bearer access'],
  ])
})

test('getProfile asks for every component in one request', async () => {
  const sent = serve(() => bungieReply({ profileInventory: {} }))
  expect(await bungie.getProfile('access', ACCOUNT, [102, 201, 305])).toEqual({ profileInventory: {} })
  expect(sent.map(([url]) => url)).toEqual([
    'https://www.bungie.net/Platform/Destiny2/3/Profile/4611686018400000001/?components=102%2C201%2C305',
  ])
})

test('a Bungie error throws even with HTTP 200', async () => {
  serve(() => bungieReply(null, 5, 'SystemDisabled'))
  await expect(bungie.apiGet('/Destiny2/Manifest/')).rejects.toThrow('Bungie API error: SystemDisabled')
})

test('an HTTP error throws before the body is read', async () => {
  serve(() => new Response('not json', { status: 503 }))
  await expect(bungie.apiGet('/Destiny2/Manifest/')).rejects.toThrow('HTTP 503')
})

test("the account is the Cross Save primary, else the player's only one", async () => {
  // The Bungie Name's code shows as four digits.
  const name = { bungieGlobalDisplayName: 'Name', bungieGlobalDisplayNameCode: 42 }
  const memberships = [
    { membershipType: 1, membershipId: '1', displayName: 'Xbox', ...name },
    { membershipType: 3, membershipId: '3', displayName: 'Steam', ...name },
  ]
  serve(() => bungieReply({ destinyMemberships: memberships, primaryMembershipId: '3' }))
  expect(await bungie.getAccount('access')).toEqual({
    membershipType: 3,
    membershipId: '3',
    displayName: 'Name',
    bungieName: 'Name#0042',
  })
  vi.restoreAllMocks()
  serve(() => bungieReply({ destinyMemberships: memberships.slice(0, 1) }))
  expect(await bungie.getAccount('access')).toEqual({
    membershipType: 1,
    membershipId: '1',
    displayName: 'Name',
    bungieName: 'Name#0042',
  })
})

test('a Bungie.net account without Destiny 2 has no account to report on', async () => {
  serve(() => bungieReply({ destinyMemberships: [] }))
  await expect(bungie.getAccount('access')).rejects.toThrow('no Destiny 2 account')
})
