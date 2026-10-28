// The widget in the corner over a report, as DIM's refresh button: ↻ asks
// Bungie now and spins while the page checks or rebuilds, a line says how the
// last check went, and a toggle shows or hides the log of the current or last
// refresh (the boot log's lines). The log starts collapsed; this browser
// remembers it open, so a player can leave it open to watch the report
// update. And when the page asks by itself (refreshDue). src/main.ts does the
// refreshing.

// How long after a check the page asks Bungie again while it's in view.
export const REFRESH_EVERY = 2 * 60_000

// Whether the page should ask Bungie again at now (ms): it's in view
// (visible), no refresh is running, and the last check ended (lastCheck, ms)
// REFRESH_EVERY ago or more. A hidden page asks nothing (the player is likely
// in the game); back in view, it asks at once if the last check is that old.
export function refreshDue(now: number, lastCheck: number, visible: boolean, running: boolean): boolean {
  return visible && !running && now - lastCheck >= REFRESH_EVERY
}

// How long ago a check was, ms before now, as the status says it.
export function ago(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.floor(minutes / 60)} h ago`
}

// Where this browser keeps whether the log is open (localStorage).
const LOG_OPEN = 'refresh-log-open'

// A button with its visible content (html) and its label.
function button(className: string, html: string, label: string): HTMLButtonElement {
  const b = Object.assign(document.createElement('button'), { type: 'button', className, innerHTML: html })
  b.setAttribute('aria-label', label)
  return b
}

// The widget for log (the boot log's list, which it takes in once it's put
// on the page), whose ↻ calls refresh.
export function refreshWidget(log: HTMLElement, refresh: () => void) {
  const now = button('act refresh-now', '<span aria-hidden="true">↻</span>', 'Refresh from Bungie')
  now.title = 'Refresh from Bungie'
  now.addEventListener('click', refresh)
  const status = Object.assign(document.createElement('p'), { className: 'refresh-status' })
  status.setAttribute('aria-live', 'polite')
  const toggle = button('act refresh-log', 'Log <span aria-hidden="true">▴</span>', 'Refresh log')
  toggle.setAttribute('aria-controls', log.id)
  const element = Object.assign(document.createElement('aside'), { className: 'refresh' })
  element.setAttribute('aria-label', 'Report refresh')
  element.append(now, status, toggle)

  let open = false
  try {
    open = localStorage.getItem(LOG_OPEN) === 'true'
  } catch {
    // Collapsed.
  }
  const expand = (value: boolean) => {
    open = value
    log.hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
  }
  toggle.addEventListener('click', () => {
    expand(!open)
    try {
      localStorage.setItem(LOG_OPEN, String(open))
    } catch {
      // Remembered for this page only.
    }
  })

  // The status, written only when it changes, so the live region says
  // nothing new for nothing new; while busy, ↻ spins and does nothing.
  const show = (text: string, busy: boolean) => {
    if (status.textContent !== text) status.textContent = text
    element.classList.toggle('busy', busy)
    now.setAttribute('aria-disabled', String(busy))
  }
  // When the check the status says is up to date ended (ms); 0 while it says
  // something else.
  let since = 0
  const tick = () => {
    if (since) show(`Up to date · checked ${ago(Date.now() - since)}`, false)
  }
  return {
    // Put the widget on parent, the log moved into it, open as last left.
    attach(parent: HTMLElement) {
      expand(open)
      element.append(log)
      parent.append(element)
    },
    // A refresh under way (busy), or how one ended.
    say(text: string, busy = false) {
      since = 0
      show(text, busy)
    },
    // Up to date, as of a check that ended at at (ms).
    upToDate(at: number) {
      since = at
      tick()
    },
    // Keep the status's "checked … ago" current.
    tick,
  }
}
