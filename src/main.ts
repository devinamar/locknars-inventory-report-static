// The site's page: it logs the player in with Bungie, then shows their
// report. The work runs in a worker (src/report-worker.ts) while a boot log
// shows each step. As DIM does with its last profile, the finished report is
// kept in the browser (src/cache.ts) and shown at once on the next visit; it
// is rebuilt only when Bungie made a newer profile, the shared data changed
// or the player changed their settings (in the report's Preferences tab), and
// the panel in the corner then offers the new one.
import '../templates/styles.css'
import reportJs from '../templates/report.js?url'
import { PROFILE_COMPONENTS, authenticate, getAccount, getProfile, startLogin } from './bungie.ts'
import { type CachedReport, dimKey, loadReportCache, saveReportCache, upToDate } from './cache.ts'
import { fetchDimAnnotations } from './dim.ts'
import { type PreferenceRow, keepSaved, loadSaved } from './saved.ts'

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
// switches and grids once, after the HTML is in, and the Preferences tab's
// controls, told the settings the report was built with. Their module comes
// only now: the grades it ranks sets by are read through SQLite
// (src/analyze/armor-grades.ts), whose wasm the boot log shouldn't wait for.
function showReport(report: CachedReport) {
  document.body.innerHTML = report.html
  document.title = `${report.bungieName} · Destiny 2 Inventory Report`
  const script = document.createElement('script')
  script.src = reportJs
  document.body.append(script)
  import('./preferences-tab.ts').then((tab) => tab.setup(report.settings))
  // The Markdown copy, last among the report's page links, named as the CLI
  // named its file.
  const nav = document.querySelector('header.top nav')
  if (report.markdown && nav) {
    const link = Object.assign(document.createElement('a'), {
      textContent: 'Markdown ↓',
      href: URL.createObjectURL(new Blob([report.markdown], { type: 'text/markdown' })),
      download: `d2_report_${report.bungieName.split('#')[0]}.md`,
    })
    nav.append(link)
  }
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

// What a build sends back: the report's HTML and the preferences it ended
// with.
type Built = { html: string; markdown: string; preferences: PreferenceRow[] }

// The worker, which starts downloading the shared database at once; its steps
// go into the boot log as they start and finish (or fail, for a step the
// report doesn't need). built settles with the report once the page has sent
// the profile.
function startWorker() {
  const worker = new Worker(new URL('./report-worker.ts', import.meta.url), { type: 'module' })
  const lines = new Map<string, Line>()
  const built = new Promise<Built>((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.start) lines.set(data.start, begin(data.start))
      else if (data.done) lines.get(data.done)?.done()
      else if (data.failed) lines.get(data.failed)?.fail(data.reason)
      else if (data.html) resolve(data)
      else reject(new Error(data.error))
    }
    worker.onerror = (event) => reject(new Error(event.message))
  })
  // The worker's own line shows a failure; don't report it twice.
  built.catch(() => {})
  return { worker, built }
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
    // DIM's tags and notes come with the profile; asking DIM never fails the
    // report, which says when they're skipped (no DIM API key) or failed.
    const [profile, dataBuilt, dim] = await logged('Downloading your inventory from Bungie', () =>
      Promise.all([
        getProfile(tokens.access_token, account, PROFILE_COMPONENTS),
        fetch('/version.json', { cache: 'no-cache' })
          .then((response) => response.json())
          .then((version) => version.built_at as string),
        fetchDimAnnotations(tokens, account),
      ]),
    )
    if (dim.status !== 'fresh') {
      log.append(Object.assign(document.createElement('li'), { textContent: `– DIM tags ${dim.status}: ${dim.reason}` }))
    }
    const saved = loadSaved()
    const report: CachedReport = {
      bungieMembershipId: tokens.membership_id,
      membershipId: account.membershipId,
      bungieName: account.bungieName,
      profileMinted: profile.responseMintedTimestamp,
      dataBuilt,
      settings: JSON.stringify(saved),
      dim: dimKey(dim),
      html: '',
    }
    if (upToDate(cached, report)) {
      log.append(Object.assign(document.createElement('li'), { textContent: 'Your report is up to date.' }))
      setTimeout(() => panel?.remove(), 3000)
    } else {
      work ??= startWorker()
      work.worker.postMessage({ profile, bungieName: account.bungieName, dim, ...saved })
      const built = await work.built
      work.worker.terminate()
      // The preferences the build ended with become the player's, so the
      // Preferences tab edits them all; unless the player changed theirs
      // during the build (in the tab of the report shown meanwhile, or in
      // another), which the next visit then builds with.
      if (JSON.stringify(loadSaved()) === report.settings) {
        keepSaved({ ...saved, preferences: built.preferences })
        report.settings = JSON.stringify(loadSaved())
      }
      report.html = built.html
      report.markdown = built.markdown
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
