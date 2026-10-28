// The site's page: it loads the shared database, logs the player in with
// Bungie, adds their profile, runs the analysis and shows the report, all in
// the browser.
import '../templates/styles.css'
import reportJs from '../templates/report.js?url'
import { analyzeArmor, analyzeWeapons } from './analyze/analyze.ts'
import { authenticate, getAccount, getProfile, startLogin } from './bungie.ts'
import { loadDb } from './db.ts'
import { PROFILE_COMPONENTS, ingestProfile } from './profile.ts'
import { loadReport } from './report/load.ts'
import { renderBody } from './report/render.ts'

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

// Let the browser paint the status line before the long work that follows.
function paint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)))
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
    status.textContent = 'Building your report…'
    await paint()
    const started = performance.now()
    // ponytail: the analysis and the report's queries hold the page's thread
    // for a while (the queries take ~20 s in Node); move them to a Worker, or
    // precompute the shared parts in the data build, if that's too slow.
    analyzeWeapons(db)
    analyzeArmor(db)
    document.body.innerHTML = renderBody(loadReport(db), account.bungieName)
    document.title = `${account.bungieName} · Destiny 2 Inventory Report`
    // report.js runs the report's tabs, switches and grids; as a classic
    // script it runs once, after the report's HTML is in.
    const script = document.createElement('script')
    script.src = reportJs
    document.body.append(script)
    console.info(`Report built in ${((performance.now() - started) / 1000).toFixed(1)} s`)
  }
} catch (error) {
  status.textContent = `Something went wrong: ${error}`
}
