// The settings page, the CLI's terminal preference editor and --add-wishlist
// on a page: the player's armor preferences (each set's stat picks, grade and
// place in its grade; each exotic's stat picks), their own wishlists, and a
// backup file of both. They're kept in this browser (src/saved.ts): each
// change is saved at once, and the report rebuilds with it the next time it's
// opened. The order, the moves and the checks are the CLI's, as ported
// (src/analyze/prefs/store.ts, src/wishlists.ts).
import '../templates/styles.css'
import './settings.css'
import { GRADES } from './analyze/armor-grades.ts'
import { gradeMembers, insertIntoGrade, sortedPrefs } from './analyze/prefs/store.ts'
import { ARMOR_STAT_NAMES, type ArmorPreference } from './models.ts'
import { parseBackup, toPrefs, toRows, withPick } from './preferences.ts'
import { keepSaved, loadLastBuild, loadSaved } from './saved.ts'
import { sourceKey, sourceProblem, type WishlistSource } from './wishlists.ts'

// The stats by the names the CLI's editor gave them, and the picks' places.
const STAT_LABELS: Record<string, string> = {
  health: 'Health',
  melee: 'Melee',
  grenade: 'Grenade',
  super_stat: 'Super',
  class_stat: 'Class',
  weapons: 'Weapons',
}
const PLACES = ['1st', '2nd', '3rd']

let saved = loadSaved()
let prefs = toPrefs(saved.preferences)
const lastBuild = loadLastBuild()
const notes = new Map(Object.entries(lastBuild.notes))

const armor = document.getElementById('armor')!
const wishlists = document.getElementById('wishlists')!
const status = document.getElementById('status')!
const form = document.getElementById('add-wishlist') as HTMLFormElement
const upload = document.getElementById('import') as HTMLInputElement

// A new tag element with props, holding children.
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

// A control of the preference or wishlist called name, labelled label; role
// says what it changes, and with name finds it again after a redraw.
function control<K extends 'select' | 'button'>(tag: K, name: string, role: string, label: string) {
  const node = el(tag)
  node.dataset.name = name
  node.dataset.role = role
  node.setAttribute('aria-label', label)
  return node
}

// Pick i of a preference: None, or a stat no earlier pick has. Off until the
// pick before it is made.
function statSelect(name: string, pref: ArmorPreference, i: number): HTMLSelectElement {
  const picks = [pref.stat1, pref.stat2, pref.stat3]
  const select = control('select', name, `stat${i}`, `${name}: ${PLACES[i]} stat`)
  const left = ARMOR_STAT_NAMES.filter((s) => !picks.slice(0, i).includes(s))
  select.append(new Option('None', ''), ...left.map((s) => new Option(STAT_LABELS[s], s)))
  select.value = picks[i] ?? ''
  select.disabled = i > 0 && !picks[i - 1]
  return select
}

// A set's grade: S to F, as the CLI's editor offered them. A set without one
// shows Unclassified, which can't be chosen.
function gradeSelect(name: string, grade: string): HTMLSelectElement {
  const select = control('select', name, 'grade', `${name}: grade`)
  if (!grade) select.append(Object.assign(new Option('Unclassified', ''), { disabled: true }))
  select.append(...GRADES.map((g) => new Option(`${g.code} · ${g.label}`, g.code)))
  select.value = grade
  return select
}

// Move a set up or down its grade. At the end it's off, but still focusable,
// so the focus stays on it.
function moveButton(name: string, way: 'up' | 'down', off: boolean): HTMLButtonElement {
  const button = control('button', name, way, `Move ${name} ${way}`)
  Object.assign(button, { type: 'button', className: 'move', textContent: way === 'up' ? '↑' : '↓' })
  if (off) button.setAttribute('aria-disabled', 'true')
  return button
}

// What the last build said about the preference called name, folded away.
function noteFor(name: string, summary: string): HTMLDetailsElement | '' {
  const note = notes.get(name)
  if (!note) return ''
  const details = el('details', {}, el('summary', { textContent: summary }), el('p', { textContent: note }))
  details.dataset.name = name
  return details
}

// One preference: a set's place in its grade, name, picks, grade and moves; an
// exotic's name and picks; and what the last build said about it.
function prefRow(name: string, pref: ArmorPreference, place = 0, last = false): HTMLLIElement {
  const set = !pref.isExotic
  const rank = set ? el('span', { className: 'num', textContent: `${place}.` }) : ''
  return el(
    'li',
    { className: 'pref-row' },
    el('span', { className: 'pref-title' }, rank, name),
    el('span', { className: 'stat-picks' }, ...[0, 1, 2].map((i) => statSelect(name, pref, i))),
    set ? gradeSelect(name, pref.grade) : '',
    set ? moveButton(name, 'up', place === 1) : '',
    set ? moveButton(name, 'down', last) : '',
    noteFor(name, set ? 'Set bonuses' : 'Effect'),
  )
}

// One grade's sets, first to last: S to F, then any without a grade.
function gradeCard(code: string, title: string, about = ''): HTMLElement | '' {
  const members = gradeMembers(prefs, code)
  if (!code && !members.length) return ''
  const rows = members.map(([name, pref], i) => prefRow(name, pref, i + 1, i === members.length - 1))
  return el(
    'div',
    { className: 'card grade-card' },
    el('h3', {}, title, about && el('span', { textContent: about })),
    rows.length ? el('ol', { className: 'prefs-list' }, ...rows) : el('p', { className: 'no-sets' }, 'No sets.'),
  )
}

function armorParts(): Node[] {
  if (!prefs.size) {
    const report = el('a', { href: './', textContent: 'open your report' })
    const note = ['Your armor preferences show here once your report is built: ', report, ' first.']
    return [el('p', { className: 'callout' }, ...note)]
  }
  const exotics = [...sortedPrefs(prefs)].filter(([, pref]) => pref.isExotic).map(([n, p]) => prefRow(n, p))
  return [
    el(
      'section',
      { className: 'block' },
      el('h2', { textContent: 'Armor sets' }),
      el(
        'p',
        {},
        'Each set’s stats, best first (the 1st counts ×3, the 2nd ×2, the 3rd ×1), and its grade, which decides ' +
          'how many copies of each piece it keeps. A set moved to another grade goes last in it.',
      ),
      ...GRADES.map((g) => gradeCard(g.code, `${g.code} · ${g.label}`, `keeps ${g.slotCap} of each piece per class`)),
      gradeCard('', 'Unclassified'),
    ),
    el(
      'section',
      { className: 'block' },
      el('h2', { textContent: 'Exotics' }),
      el('p', {}, 'Each exotic’s stats, best first: they rank your copies of it.'),
      el('div', { className: 'card' }, el('ol', { className: 'prefs-list' }, ...exotics)),
    ),
  ]
}

function wishlistItem(w: WishlistSource): HTMLLIElement {
  const remove = control('button', w.key, 'remove', `Remove ${w.label}`)
  Object.assign(remove, { type: 'button', textContent: 'Remove' })
  return el('li', {}, el('b', { textContent: w.label }), el('a', { href: w.url, textContent: w.url }), remove)
}

// Draw the preferences and wishlists as they now are, keeping open what was
// open and the focus on the control it was on, wherever that went.
function render(): void {
  const { name, role } = (document.activeElement as HTMLElement).dataset
  const open = new Set([...document.querySelectorAll('details')].filter((d) => d.open).map((d) => d.dataset.name))
  armor.replaceChildren(...armorParts())
  wishlists.replaceChildren(...saved.wishlists.map(wishlistItem))
  wishlists.hidden = !saved.wishlists.length
  for (const details of document.querySelectorAll('details')) details.open = open.has(details.dataset.name)
  const controls = [...document.querySelectorAll<HTMLElement>('[data-role]')]
  if (role) controls.find((c) => c.dataset.role === role && c.dataset.name === name)?.focus()
}

function say(text: string): void {
  status.textContent = text
}

// Keep the settings as they now are, say how that went, and redraw.
function keep(done: string): void {
  say(
    keepSaved(saved)
      ? `${done} Your report rebuilds the next time you open it.`
      : "Not saved: this browser isn't letting the page keep anything (a private window?).",
  )
  render()
}

function keepPrefs(): void {
  saved = { ...saved, preferences: toRows(sortedPrefs(prefs)) }
  keep('Saved.')
}

// A pick or a grade chosen.
armor.addEventListener('change', (event) => {
  const select = event.target as HTMLSelectElement
  const { name = '', role = '' } = select.dataset
  const pref = prefs.get(name)
  if (!pref) return
  // A new grade puts the set last in it, the CLI editor's default place.
  if (role === 'grade') insertIntoGrade(prefs, name, select.value, gradeMembers(prefs, select.value, name).length + 1)
  else prefs.set(name, withPick(pref, Number(role.slice(-1)), select.value || null))
  keepPrefs()
})

// A set moved up or down its grade.
armor.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest('button')
  const { name = '', role } = button?.dataset ?? {}
  const pref = prefs.get(name)
  if (!pref || button!.getAttribute('aria-disabled')) return
  const place = gradeMembers(prefs, pref.grade).findIndex(([n]) => n === name) + 1
  insertIntoGrade(prefs, name, pref.grade, role === 'up' ? place - 1 : place + 1)
  keepPrefs()
})

// A wishlist added, if the CLI's --add-wishlist would have: checked against
// the wishlists every report uses (as of the last build) and the player's.
form.addEventListener('submit', (event) => {
  event.preventDefault()
  const data = new FormData(form)
  const [label, url] = ['label', 'url'].map((field) => String(data.get(field)).trim())
  const problem = sourceProblem([...lastBuild.wishlists, ...saved.wishlists], label, url)
  if (problem) return say(`Not added: ${problem}.`)
  saved = { ...saved, wishlists: [...saved.wishlists, { key: sourceKey(label), label, url }] }
  form.reset()
  keep(`Added ${label} (key ${sourceKey(label)}).`)
})

wishlists.addEventListener('click', (event) => {
  const key = (event.target as HTMLElement).closest('button')?.dataset.name
  const gone = saved.wishlists.find((w) => w.key === key)
  if (!gone) return
  saved = { ...saved, wishlists: saved.wishlists.filter((w) => w !== gone) }
  keep(`Removed ${gone.label}.`)
  ;(wishlists.querySelector('button') ?? form.querySelector('input'))?.focus()
})

// The settings as a backup file, downloaded.
document.getElementById('export')!.addEventListener('click', () => {
  const file = new Blob([`${JSON.stringify({ version: 1, ...saved }, null, 2)}\n`], { type: 'application/json' })
  const day = new Date().toISOString().slice(0, 10)
  el('a', { href: URL.createObjectURL(file), download: `d2-report-preferences-${day}.json` }).click()
})

// A backup file's settings in place of these, if every part of it checks out.
upload.addEventListener('change', async () => {
  const file = upload.files?.[0]
  if (!file) return
  try {
    saved = parseBackup(await file.text(), lastBuild.wishlists)
  } catch (error) {
    return say(`Not imported: ${(error as Error).message}. Nothing changed.`)
  } finally {
    upload.value = '' // so the same file can be chosen again
  }
  prefs = toPrefs(saved.preferences)
  keep(`Imported ${saved.preferences.length} preferences and ${saved.wishlists.length} wishlists.`)
})

const defaults = lastBuild.wishlists.map((w) => w.label)
document.getElementById('default-wishlists')!.textContent =
  `Every report scores your weapons against ${
    defaults.length ? new Intl.ListFormat('en').format(defaults) : 'the site’s wishlists'
  }. Add other DIM wishlists here.`
render()
