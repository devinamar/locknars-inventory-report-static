// The site's page: it logs the player in with Bungie, then shows their
// report. The work runs in a worker (src/report-worker.ts) while a boot log
// shows each step. As DIM does with its last profile, the finished report is
// kept in the browser (src/cache.ts) and shown at once on the next visit; it
// is rebuilt only when Bungie made a newer profile or the shared data
// changed, and the panel in the corner then offers the new one.
import '../templates/styles.css'
import reportJs from '../templates/report.js?url'
import { PROFILE_COMPONENTS, authenticate, getAccount, getProfile, startLogin } from './bungie.ts'
import { type CachedReport, loadReportCache, saveReportCache } from './cache.ts'

// Where the boot log's lines go: the boot screen's list, or the corner panel's
// over a report from the cache.
let log = document.getElementById('log')!
const login = document.getElementById('login')!
login.addEventListener('click', startLogin)

type Line = { done(): void; fail(error: unknown): void }

// One line of the boot log: its label and a running timer, then ✓ with the
// time it took, or ✗ with what went wrong.
function begin(label: string): Line {
  const line = document.createElement('li')
  const started = performance.now()
  const seconds = () => ((performance.now() - started) / 1000).toFixed(1)
  const tick = () => (line.textContent = `… ${label} ${seconds()} s`)
  tick()
  log.append(line)
  const timer = setInterval(tick, 100)
  return {
    done: () => (clearInterval(timer), (line.textContent = `✓ ${label} (${seconds()} s)`)),
    fail: (error) => (clearInterval(timer), (line.textContent = `✗ ${label}: ${error}`)),
  }
}

// Run step as a line of the boot log.
async function logged<T>(label: string, step: () => Promise<T>): Promise<T> {
  const line = begin(label)
  try {
    const result = await step()
    line.done()
    return result
  } catch (error) {
    line.fail(error)
    throw error
  }
}

// Put the report's HTML in the page, then report.js, which runs its tabs,
// switches and grids once, after the HTML is in.
function showReport(report: { html: string; bungieName: string }) {
  document.body.innerHTML = report.html
  document.title = `${report.bungieName} · Destiny 2 Inventory Report`
  const script = document.createElement('script')
  script.src = reportJs
  document.body.append(script)
}

// The corner panel over a report from the cache, which the boot log moves to.
function showPanel(): HTMLElement {
  const panel = document.createElement('aside')
  panel.className = 'boot-panel'
  log = document.createElement('ol')
  log.className = 'boot-log'
  panel.append(log)
  document.body.append(panel)
  return panel
}

// The worker, which starts downloading the shared database at once; its steps
// go into the boot log as they start and finish. html settles with the report
// once the page has sent the profile.
function startWorker() {
  const worker = new Worker(new URL('./report-worker.ts', import.meta.url), { type: 'module' })
  const lines = new Map<string, Line>()
  const html = new Promise<string>((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.start) lines.set(data.start, begin(data.start))
      else if (data.done) lines.get(data.done)?.done()
      else if (data.html) resolve(data.html)
      else reject(new Error(data.error))
    }
    worker.onerror = (event) => reject(new Error(event.message))
  })
  // The worker's own line shows a failure; don't report it twice.
  html.catch(() => {})
  return { worker, html }
}

// Bungie's answer to a login leaves the address as soon as it's read, so a
// reload can't send its code twice.
const search = location.search
if (search) history.replaceState(null, '', location.pathname)

try {
  const tokens = await logged('Checking your Bungie login', () => authenticate(search))
  if (!tokens) {
    log.append(Object.assign(document.createElement('li'), { textContent: 'Log in with Bungie to see your report.' }))
    login.hidden = false
  } else {
    // A kept report is shown only to the Bungie.net account it was built for.
    const kept = await loadReportCache()
    const cached = kept?.bungieMembershipId === tokens.membership_id ? kept : undefined
    let panel: HTMLElement | undefined
    if (cached) {
      showReport(cached)
      panel = showPanel()
    }
    // Without a report to show, the worker starts at once, downloading the
    // shared database while Bungie answers; with one, only if it has to.
    let work = cached ? undefined : startWorker()
    const account = await logged('Finding your Destiny account', () => getAccount(tokens.access_token))
    const [profile, dataBuilt] = await logged('Downloading your inventory from Bungie', () =>
      Promise.all([
        getProfile(tokens.access_token, account, PROFILE_COMPONENTS),
        fetch('/version.json', { cache: 'no-cache' })
          .then((response) => response.json())
          .then((version) => version.built_at as string),
      ]),
    )
    const report: CachedReport = {
      bungieMembershipId: tokens.membership_id,
      membershipId: account.membershipId,
      bungieName: account.bungieName,
      profileMinted: profile.responseMintedTimestamp,
      dataBuilt,
      html: '',
    }
    const unchanged =
      cached?.membershipId === report.membershipId &&
      cached.profileMinted === report.profileMinted &&
      cached.dataBuilt === report.dataBuilt
    if (unchanged) {
      log.append(Object.assign(document.createElement('li'), { textContent: 'Your report is up to date.' }))
      setTimeout(() => panel?.remove(), 3000)
    } else {
      work ??= startWorker()
      work.worker.postMessage({ profile, bungieName: account.bungieName })
      report.html = await work.html
      work.worker.terminate()
      await saveReportCache(report)
      if (panel) {
        log.append(Object.assign(document.createElement('li'), { textContent: 'Your report has changed.' }))
        const show = Object.assign(document.createElement('button'), { textContent: 'Show the new report' })
        show.addEventListener('click', () => location.reload())
        panel.append(show)
      } else {
        showReport(report)
      }
    }
  }
} catch (error) {
  // The step that failed shows why; this is for anything outside a step.
  console.error(error)
}
