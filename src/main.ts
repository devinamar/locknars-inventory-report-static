// The site's page: it logs the player in with Bungie, then shows their
// report. The work runs in a worker (src/report-worker.ts) while a boot log
// shows each step. As DIM does with its last profile, the finished report is
// kept in the browser (src/cache.ts) and shown at once on the next visit. The
// page then asks Bungie again (refresh): at once, every couple of minutes
// while it's in view, and when the player asks, in the widget in the corner
// (src/refresh.ts). When what the report is built from changed (the player's
// inventory, the shared data, the site's code, their settings or DIM tags),
// the report is rebuilt in the background, kept, and shown by reloading the
// page where the player was.
import '../templates/styles.css'
import reportJs from '../templates/report.js?url'
import {
  type Account,
  PROFILE_COMPONENTS,
  type Tokens,
  authenticate,
  getAccount,
  getProfile,
  startLogin,
} from './bungie.ts'
import { type CachedReport, dimKey, loadReportCache, profileKey, saveReportCache, upToDate } from './cache.ts'
import { fetchDimAnnotations } from './dim.ts'
import { refreshDue, refreshWidget } from './refresh.ts'
import { type PreferenceRow, keepSaved, loadSaved } from './saved.ts'

// The site's code, which a kept report is keyed on: the commit the deploy was
// built from, 'dev' locally.
const CODE = import.meta.env.VITE_COMMIT || 'dev'

// The boot log: the boot screen's list, which moves into the widget over a
// report.
const log = document.getElementById('log')!
const login = document.getElementById('login')!
login.addEventListener('click', startLogin)

type Line = { done(): void; fail(error: unknown): void }

// One line of the boot log: its label and a running timer, then ✓ with the
// time it took, or ✗ with what went wrong; whichever comes first.
function begin(label: string): Line {
  const line = document.createElement('li')
  const started = performance.now()
  const seconds = () => ((performance.now() - started) / 1000).toFixed(1)
  const tick = () => (line.textContent = `… ${label} ${seconds()} s`)
  tick()
  log.append(line)
  const timer = setInterval(tick, 100)
  let ended = false
  const end = (text: string) => {
    if (ended) return
    ended = true
    clearInterval(timer)
    line.textContent = text
  }
  return { done: () => end(`✓ ${label} (${seconds()} s)`), fail: (error) => end(`✗ ${label}: ${error}`) }
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

// A line of the boot log that only says text.
function note(text: string): void {
  log.append(Object.assign(document.createElement('li'), { textContent: text }))
}

// The report on the page (none on the boot screen); when the page last
// finished asking Bungie (ms; 0, not yet); whether it's asking now; whether it
// has stopped asking by itself (a new report it couldn't keep); and the
// player's Destiny account, found once.
let shown: CachedReport | undefined
let checked = 0
let running = false
let paused = false
let account: Account | undefined
const widget = refreshWidget(log, () => void refresh())

// Put the report's HTML in the page, then report.js, which runs its tabs,
// switches and grids once, after the HTML is in, and shows the tab the
// address names from its top; the widget, with the boot log; and the
// Preferences tab's controls, told the settings the report was built with.
// Their module comes only now: the grades it ranks sets by are read through
// SQLite (src/analyze/armor-grades.ts), whose wasm the boot log shouldn't
// wait for. After a reload to show an update, the page the player was on has
// its folds open or closed as they left them (when it has as many: a changed
// inventory can add a card), and it scrolls back to where they were.
function showReport(report: CachedReport, { scroll = 0, page = '', folds = [] }: Partial<Reloaded> = {}) {
  document.body.innerHTML = report.html
  // ponytail: folds matched by position; key them by card if a card both
  // gone and added ever reopens the wrong one.
  const details = document.getElementById(page)?.querySelectorAll('details') ?? []
  if (details.length === folds.length) details.forEach((d, i) => (d.open = folds[i]))
  document.title = `${report.bungieName} · Destiny 2 Inventory Report`
  const script = document.createElement('script')
  script.src = reportJs
  script.onload = () => scrollTo(0, scroll)
  document.body.append(script)
  widget.attach(document.body)
  shown = report
  import('./preferences-tab.ts').then((tab) =>
    tab.setup(report.settings, () => void refresh(), report.markdown, report.bungieName),
  )
}

// What a build sends back: the report's HTML and the preferences it ended
// with.
type Built = { html: string; markdown: string; preferences: PreferenceRow[] }

// The worker, which starts downloading the shared database at once; its steps
// go into the boot log as they start and finish (or fail, for a step the
// report doesn't need; a step that fails the build fails its line). built
// settles with the report once the page has sent the profile.
function startWorker() {
  const worker = new Worker(new URL('./report-worker.ts', import.meta.url), { type: 'module' })
  const lines = new Map<string, Line>()
  const built = new Promise<Built>((resolve, reject) => {
    const fail = (error: Error) => {
      for (const line of lines.values()) line.fail(error.message)
      reject(error)
    }
    worker.onmessage = ({ data }) => {
      if (data.start) lines.set(data.start, begin(data.start))
      else if (data.done) lines.get(data.done)?.done()
      else if (data.failed) lines.get(data.failed)?.fail(data.reason)
      else if (data.html) resolve(data)
      else fail(new Error(data.error))
    }
    worker.onerror = (event) => fail(new Error(event.message))
  })
  // A failure before the page waits on it is reported once it does.
  built.catch(() => {})
  return { worker, built }
}

// What a reload to show a new report hands the page it reloads to, in this
// tab's sessionStorage: where the player had scrolled, on which page (the
// tab, which the address also names) with which of its folds open, when
// Bungie was asked, and that refresh's log.
const RELOADED = 'report-reloaded'
type Reloaded = { scroll: number; page: string; folds: boolean[]; checked: number; log: string[] }

function reloadToShow(): void {
  note('Your report has changed: showing the new one.')
  const page = document.querySelector('.page:not([hidden])')
  const reloaded: Reloaded = {
    scroll: scrollY,
    page: page?.id ?? '',
    folds: [...(page?.querySelectorAll('details') ?? [])].map((d) => d.open),
    checked: Date.now(),
    log: [...log.children].map((li) => li.textContent!),
  }
  try {
    sessionStorage.setItem(RELOADED, JSON.stringify(reloaded))
  } catch {
    // The new report shows from the top, after a check.
  }
  location.reload()
}

function takeReloaded(): Reloaded | undefined {
  try {
    const reloaded = JSON.parse(sessionStorage.getItem(RELOADED) ?? 'null')
    sessionStorage.removeItem(RELOADED)
    return reloaded ?? undefined
  } catch {
    return undefined
  }
}

// Ask Bungie for the player's profile, DIM for their tags and the site for
// its data's version. If the report they make isn't the one shown (or none
// is), build it in the worker, keep it, and show it: in place of the boot
// screen, else by reloading the page, which shows it from the cache where the
// player was; a rebuild that reads as the report shown needs no reload.
// tokens: the page's login, for the first refresh, whose log goes on from the
// login's line; later ones read the login again (refreshing its access token
// when it's old) and start a new log. One refresh at a time: one asked for
// meanwhile is dropped.
async function refresh(tokens?: Tokens): Promise<void> {
  if (running) return
  running = true
  widget.say('Checking Bungie…', true)
  if (!tokens) log.replaceChildren()
  // Without a report to show, the worker starts at once, downloading the
  // shared database while Bungie answers; with one, only if it has to.
  let work = shown ? undefined : startWorker()
  let failure = "Couldn't reach Bungie"
  let said: string | undefined
  try {
    const auth = tokens ?? (await authenticate())
    if (!auth) throw new Error('your Bungie login has expired: reload the page to log in again')
    const destiny = (account ??= await logged('Finding your Destiny account', () => getAccount(auth.access_token)))
    // DIM's tags and notes come with the profile; asking DIM never fails the
    // report, which says when they're skipped (no DIM API key) or failed.
    const [profile, data, dim] = await logged('Downloading your inventory from Bungie', () =>
      Promise.all([
        getProfile(auth.access_token, destiny, PROFILE_COMPONENTS),
        fetch('/version.json', { cache: 'no-cache' })
          .then((response) => response.json())
          .then((version) => version.data_version as string),
        fetchDimAnnotations(auth, destiny),
      ]),
    )
    if (dim.status !== 'fresh') note(`– DIM tags ${dim.status}: ${dim.reason}`)
    const saved = loadSaved()
    const report: CachedReport = {
      bungieMembershipId: auth.membership_id,
      membershipId: destiny.membershipId,
      bungieName: destiny.bungieName,
      profile: await profileKey(profile),
      data,
      code: CODE,
      settings: JSON.stringify(saved),
      dim: dimKey(dim),
      html: '',
    }
    if (upToDate(shown, report)) {
      note('Your report is up to date.')
    } else {
      failure = "Couldn't update your report"
      widget.say('Updating your report…', true)
      work ??= startWorker()
      work.worker.postMessage({ profile, bungieName: destiny.bungieName, dim, ...saved })
      const built = await work.built
      // The preferences the build ended with become the player's, so the
      // Preferences tab edits them all; unless the player changed theirs
      // during the build (in the tab of the report shown meanwhile, or in
      // another), which the next build then uses.
      if (JSON.stringify(loadSaved()) === report.settings) {
        keepSaved({ ...saved, preferences: built.preferences })
        report.settings = JSON.stringify(loadSaved())
      }
      report.html = built.html
      report.markdown = built.markdown
      const kept = await saveReportCache(report)
      if (!shown) showReport(report)
      // A rebuild that reads as the report shown, from the same settings,
      // needs no reload (a bounty picked up, a deploy that left the report
      // as it was).
      else if (report.html === shown.html && report.markdown === shown.markdown && report.settings === shown.settings) {
        shown = report
      }
      // The page is going: nothing more to say, and no refresh to start.
      else if (kept) return reloadToShow()
      else {
        // A reload would build it all again: the player's call.
        said = "Your report has changed, but this browser isn't keeping it: reload the page to see it."
        paused = true
      }
    }
  } catch (error) {
    // Why, without the address that failed: the log's line has it all.
    const why = error instanceof Error ? error.message.replace(/^(\w*Error: )?(https?:\/\/\S+: )?/, '') : error
    said = `${failure}: ${why}`
  }
  work?.worker.terminate()
  checked = Date.now()
  running = false
  if (said) widget.say(said)
  else widget.upToDate(checked)
}

// Ask Bungie again when it's due (refreshDue), else keep the status's age
// current. Not while the Preferences tab is open: a changed setting would
// rebuild the report while the player is still making changes, and its reload
// would lose a wishlist half typed in. ↻ and its Rebuild still ask; once the
// player leaves the tab, the next check due rebuilds with every change.
function tick(): void {
  if (!shown || paused) return
  const editing = document.getElementById('page-preferences')?.hidden === false
  if (!editing && refreshDue(Date.now(), checked, document.visibilityState === 'visible', running)) void refresh()
  else widget.tick()
}

// Bungie's answer to a login leaves the address as soon as it's read, so a
// reload can't send its code twice.
const search = location.search
if (search) history.replaceState(null, '', location.pathname)
const reloaded = takeReloaded()

try {
  const tokens = await logged('Checking your Bungie login', () => authenticate(search))
  if (!tokens) {
    note('Log in with Bungie to see your report.')
    login.hidden = false
  } else {
    // A kept report is shown only to the Bungie.net account it was built for.
    const kept = await loadReportCache()
    const cached = kept?.bungieMembershipId === tokens.membership_id ? kept : undefined
    if (cached) showReport(cached, reloaded)
    if (cached && reloaded) {
      // Reloaded to show a new report: Bungie was asked just now, so the next
      // check waits its turn, and the log is that refresh's.
      checked = reloaded.checked
      log.replaceChildren()
      for (const text of reloaded.log ?? []) note(text)
      widget.upToDate(checked)
    } else {
      void refresh(tokens)
    }
    // Whether a refresh is due, every 5 s and as the page comes into view.
    setInterval(tick, 5_000)
    document.addEventListener('visibilitychange', tick)
  }
} catch (error) {
  // The step that failed shows why; this is for anything outside a step.
  console.error(error)
}
