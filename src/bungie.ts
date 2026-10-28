// Bungie in the browser: the login and the API calls the report needs. A port
// of the CLI's sources/bungie/oauth.py and api.py. The app is a confidential
// client whose secret ships in the page, as DIM's does, so a login lasts the
// refresh token's 90 days; Bungie only ever sends the login code back to the
// app's registered address. Where the CLI caught that code with a local HTTPS
// server, here Bungie sends the browser back to this page with the code in
// its address. Reading Bungie's API needs OAuth: without a login, a profile
// shows only equipped perks.
import { get } from './http.ts'

const API = 'https://www.bungie.net/Platform'
const AUTH_URL = 'https://www.bungie.net/en/OAuth/Authorize'
const TOKEN_URL = 'https://www.bungie.net/platform/app/oauth/token/'
// An access token lasts an hour. One with less than this many seconds left is
// refreshed up front, so it can't expire halfway through loading a report.
export const EXPIRY_MARGIN = 300
// Where the tokens are kept between visits (localStorage), and the login's
// state while Bungie has the browser (sessionStorage).
const TOKENS_KEY = 'bungie-tokens'
const STATE_KEY = 'bungie-login-state'

// Bungie's token response plus expires_at, the access token's expiry in epoch
// seconds.
export type Tokens = {
  access_token: string
  refresh_token?: string
  expires_in: number
  membership_id: string
  expires_at: number
}

// The account a report is for: a platform (1 Xbox, 2 PSN, 3 Steam…) and the
// Destiny membership on it, with the player's name and their Bungie Name
// (Name#1234), which the report's title shows as the CLI's did.
export type Account = { membershipType: number; membershipId: string; displayName: string; bungieName: string }

// Read from import.meta.env at each call, so tests can stub them.
function credentials() {
  const env = import.meta.env
  return { apiKey: env.VITE_BUNGIE_API_KEY, clientId: env.VITE_BUNGIE_CLIENT_ID, secret: env.VITE_BUNGIE_CLIENT_SECRET }
}

// The tokens saved by the last login or refresh; null when there are none or
// they can't be read (storage blocked or cleared, or not JSON).
export function loadTokens(): Tokens | null {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? 'null')
  } catch {
    return null
  }
}

// Save the tokens for the next visit. Storage can be blocked (some private
// windows); the login then lasts only this page.
export function saveTokens(tokens: Tokens): void {
  try {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
  } catch {
    // Kept in memory only.
  }
}

// POST a grant to Bungie's token endpoint (a login code to exchange, or a
// refresh token) with this app's id and secret, and return Bungie's response
// with expires_at added: an access token (about an hour), a refresh token (90
// days) and the Bungie.net membership id. Throws with Bungie's reply when it
// refuses the grant.
export async function requestTokens(grant: Record<string, string>): Promise<Tokens> {
  const { clientId, secret } = credentials()
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({ ...grant, client_id: clientId, client_secret: secret }),
  })
  if (!response.ok) throw new Error(`Bungie refused the token request: ${await response.text()}`)
  const tokens = await response.json()
  return { ...tokens, expires_at: Date.now() / 1000 + tokens.expires_in }
}

// New tokens for the saved refresh token, so no login page is needed; null
// when there's no refresh token or Bungie refuses it (expired after 90 days,
// or revoked).
async function refresh(saved: Tokens | null): Promise<Tokens | null> {
  if (!saved?.refresh_token) return null
  try {
    return await requestTokens({ grant_type: 'refresh_token', refresh_token: saved.refresh_token })
  } catch {
    return null
  }
}

// Bungie's login page, asking for a login code for this app. state is a
// random value Bungie hands back unchanged.
export function loginUrl(state: string): string {
  const query = new URLSearchParams({ client_id: credentials().clientId, response_type: 'code', state })
  return `${AUTH_URL}?${query}`
}

// Send the browser to Bungie's login page, keeping the state to check when it
// comes back.
export function startLogin(): void {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
  sessionStorage.setItem(STATE_KEY, state)
  location.assign(loginUrl(state))
}

// The tokens for the login code Bungie sent back in this page's address
// (search, its query string); null when the address holds no answer from
// Bungie. A redirect whose state isn't this login's didn't come from it
// (e.g. a page forging one), so it's refused, as one without a code is.
export async function finishLogin(search: string): Promise<Tokens | null> {
  const params = new URLSearchParams(search)
  if (!params.has('code') && !params.has('error')) return null
  const state = sessionStorage.getItem(STATE_KEY)
  sessionStorage.removeItem(STATE_KEY)
  if (!state || params.get('state') !== state) {
    throw new Error("the redirect doesn't belong to this login (state mismatch)")
  }
  const code = params.get('code')
  if (!code) throw new Error(`Bungie sent no login code (${params.get('error') ?? 'no reason'})`)
  return requestTokens({ grant_type: 'authorization_code', code })
}

// The access token to use: from the login Bungie just sent back (search), else
// the saved one while it has more than EXPIRY_MARGIN seconds left, else a
// refreshed one. New tokens are saved, merged over the saved ones, since a
// refresh response needn't repeat the membership id. null when the player has
// to log in.
export async function authenticate(search = ''): Promise<Tokens | null> {
  const saved = loadTokens()
  const fresh = await finishLogin(search)
  if (!fresh && saved && Date.now() / 1000 < saved.expires_at - EXPIRY_MARGIN) return saved
  const tokens = fresh ?? (await refresh(saved))
  if (!tokens) return null
  const merged = { ...saved, ...tokens }
  saveTokens(merged)
  return merged
}

// GET a Platform endpoint (e.g. '/Destiny2/Manifest/') and return its
// 'Response' part, sending the API key and, with a token, the login. Throws
// on HTTP errors and on Bungie errors (an ErrorCode other than 1), even with
// HTTP 200.
export async function apiGet(endpoint: string, token?: string, params: Record<string, string> = {}): Promise<any> {
  const headers: Record<string, string> = { 'X-API-Key': credentials().apiKey }
  if (token) headers.Authorization = `Bearer ${token}`
  const query = new URLSearchParams(params).toString()
  const data = await (await get(`${API}${endpoint}${query ? `?${query}` : ''}`, { headers })).json()
  if (data.ErrorCode !== 1) throw new Error(`Bungie API error: ${data.Message}`)
  return data.Response
}

// The logged-in player's Destiny account. With Cross Save, its primary
// account; otherwise the one account. ponytail: a player with several
// accounts and no Cross Save gets the first; add a picker when one shows up.
export async function getAccount(token: string): Promise<Account> {
  const { destinyMemberships, primaryMembershipId } = await apiGet('/User/GetMembershipsForCurrentUser/', token)
  if (!destinyMemberships?.length) throw new Error('This Bungie.net account has no Destiny 2 account')
  const account =
    destinyMemberships.find((m: { membershipId: string }) => m.membershipId === primaryMembershipId) ??
    destinyMemberships[0]
  const name = account.bungieGlobalDisplayName || account.displayName
  // Bungie shows a name's code as four digits: Name#0042.
  const code = account.bungieGlobalDisplayNameCode
  return {
    membershipType: account.membershipType,
    membershipId: account.membershipId,
    displayName: name,
    bungieName: code ? `${name}#${String(code).padStart(4, '0')}` : name,
  }
}

// A player's profile with the given components, in one request.
export function getProfile(token: string, account: Account, components: number[]): Promise<any> {
  const endpoint = `/Destiny2/${account.membershipType}/Profile/${account.membershipId}/`
  return apiGet(endpoint, token, { components: components.join(',') })
}
