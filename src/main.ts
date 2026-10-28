// A placeholder until the report is ported: it loads the shared database,
// logs the player in with Bungie, adds their profile, and says what's in it.
import { authenticate, getAccount, getProfile, startLogin } from './bungie.ts'
import { loadDb } from './db.ts'
import { PROFILE_COMPONENTS, ingestProfile } from './profile.ts'

// The database's bytes from its gzipped file: unzipped here, unless the
// server sent it with Content-Encoding: gzip and the browser already did
// (Vite's preview server does). A gzip file starts with the bytes 1f 8b.
async function fetchDb(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes
  const unzipped = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(unzipped).arrayBuffer())
}

const status = document.getElementById('status')!
const login = document.getElementById('login')!
login.addEventListener('click', startLogin)

// Bungie's answer to a login leaves the address as soon as it's read, so a
// reload can't send its code twice.
const search = location.search
if (search) history.replaceState(null, '', location.pathname)

try {
  const [db, tokens] = await Promise.all([fetchDb('/static.db.gz').then(loadDb), authenticate(search)])
  if (!tokens) {
    status.textContent = 'Log in with Bungie to see your report.'
    login.hidden = false
  } else {
    status.textContent = 'Loading your inventory…'
    const account = await getAccount(tokens.access_token)
    ingestProfile(db, await getProfile(tokens.access_token, account, PROFILE_COMPONENTS))
    const count = (view: string) => Number(db.selectValue(`SELECT count(*) FROM ${view}`)).toLocaleString()
    status.textContent =
      `${account.displayName}: ${count('v_weapon')} weapons and ${count('v_armor')} armor pieces loaded. ` +
      'The report is coming soon.'
  }
} catch (error) {
  status.textContent = `Something went wrong: ${error}`
}
