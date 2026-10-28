// The report's two files, rendered from what load.ts reads by the CLI's Jinja
// templates in templates/ (the HTML page and the Markdown copy for an LLM to
// review), with MiniJinja, Jinja's Rust port. The environment carries the
// CLI's settings and the filters the templates share. Ported from
// d2-inventory-report's report/templating.py and report/report.py.
//
// Where MiniJinja can't run the CLI's Jinja, templates/ differs from the
// CLI's copy in three ways, each rendering what the CLI renders (and still
// running in the CLI): a string's % formatting ('total_%d' % i) is ~,
// str.rsplit is split, and a tuple key looked up with in or [] is looked up
// with get (see Dict).
import { Environment, type SafeString, markSafe } from 'minijinja-js'
import { PRUNE_REASONS as ARMOR_REASONS } from '../analyze/armor-pruning.ts'
import { PRUNE_REASONS as WEAPON_REASONS } from '../analyze/weapon-pruning.ts'
import { ARMOR_STAT_SHORT_MAP } from '../models.ts'
import armor from '../../templates/armor.html.j2?raw'
import builds from '../../templates/builds.html.j2?raw'
import exotics from '../../templates/exotics.html.j2?raw'
import grids from '../../templates/grids.html.j2?raw'
import macros from '../../templates/macros.html.j2?raw'
import page from '../../templates/page.html.j2?raw'
import popular from '../../templates/popular.html.j2?raw'
import preferences from '../../templates/preferences.html.j2?raw'
import reportJs from '../../templates/report.js?raw'
import reportMd from '../../templates/report.md.j2?raw'
import styles from '../../templates/styles.css?raw'
import summary from '../../templates/summary.html.j2?raw'
import text from '../../templates/text.j2?raw'
import weapons from '../../templates/weapons.html.j2?raw'
import { type ReportData, type Row } from './load.ts'

const TEMPLATES: Record<string, string> = {
  'armor.html.j2': armor,
  'builds.html.j2': builds,
  'exotics.html.j2': exotics,
  'grids.html.j2': grids,
  'macros.html.j2': macros,
  'page.html.j2': page,
  'popular.html.j2': popular,
  'preferences.html.j2': preferences,
  'report.js': reportJs,
  'report.md.j2': reportMd,
  'styles.css': styles,
  'summary.html.j2': summary,
  'text.j2': text,
  'weapons.html.j2': weapons,
}

// An inline text token such as [Arc] in Bungie's or Clarity's text.
const TEXT_TOKEN_RE = /(\[[^[\]]+\])/

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// text escaped for HTML as Jinja's MarkupSafe escapes it.
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' }
function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c])
}

// MiniJinja escapes HTML as OWASP advises: / too, and quotes as &quot; and
// &#x27;, where MarkupSafe leaves / and writes &#34; and &#39;. The templates'
// own text holds none of these entities and escaping turns every & into
// &amp;, so each one in the page is MiniJinja's escape: spelled as MarkupSafe
// spells it, the page is the CLI's.
const MARKUPSAFE: Record<string, string> = { '&#x2f;': '/', '&quot;': '&#34;', '&#x27;': '&#39;' }
function asMarkupSafe(html: string): string {
  return html.replace(/&#x2f;|&quot;|&#x27;/g, (e) => MARKUPSAFE[e])
}

// A Python dict as the templates build it, dict(rows|group(...)), and look
// it up: d.get(key, default), d[key] or d.key. A key of several values, a
// tuple, can't key a template map: JS hands MiniJinja lists, never tuples,
// and MiniJinja tells the two apart, as Python does. Passed to get, a tuple
// arrives as an array, and finds the list group gave. A key given twice keeps
// its last value, as in Python.
class Dict {
  #entries = new Map<string, unknown>()

  constructor(pairs: [unknown, unknown][]) {
    for (const [key, value] of pairs) {
      this.#entries.set(JSON.stringify(key), value)
      if (typeof key === 'string') {
        Object.defineProperty(this, key, { value, enumerable: true, configurable: true, writable: true })
      }
    }
  }

  get(key: unknown, fallback: unknown = null): unknown {
    const k = JSON.stringify(key)
    return this.#entries.has(k) ? this.#entries.get(k) : fallback
  }
}

// Consecutive rows sharing the keys' values, as [[value, [rows]]] in row
// order; one key gives its value, several an array.
export function group(rows: Row[], ...keys: string[]): [unknown, Row[]][] {
  const groups: [unknown, Row[]][] = []
  let last: string | undefined
  for (const row of rows) {
    const value = keys.length === 1 ? row[keys[0]] : keys.map((k) => row[k])
    const id = JSON.stringify(value)
    if (groups.length && id === last) groups.at(-1)![1].push(row)
    else groups.push([value, [row]])
    last = id
  }
  return groups
}

// text, HTML-escaped, with each token icons has ('[Arc]': URL) drawn as its
// icon; other tokens stay as written.
export function textWithIcons(text: string, icons: Record<string, string>): SafeString {
  const parts = text.split(TEXT_TOKEN_RE).map((piece) => {
    const url = Object.hasOwn(icons, piece) ? icons[piece] : null
    if (!url) return escape(piece)
    return `<img class="text-icon" src="${escape(url)}" alt="${escape(piece)}" title="${escape(piece.slice(1, -1))}">`
  })
  return markSafe(parts.join(''))
}

// DIM search query for these rows' copies, like "id:123 or id:456".
export function dimQuery(rows: Row[]): string {
  return rows.map((r) => `id:${r.instance_id}`).join(' or ')
}

// An ISO 8601 timestamp's date, like "18 Oct 2026".
export function day(iso: string): string {
  const [year, month, date] = iso.slice(0, 10).split('-').map(Number)
  return `${date} ${MONTHS[month - 1]} ${year}`
}

// Comma-separated stat keys as short labels, like "Mel·Gre·Cls".
export function short(stats: string): string {
  return stats
    .split(',')
    .map((s) => ARMOR_STAT_SHORT_MAP[s])
    .join('·')
}

// x with one decimal, as Python's f'{x:.1f}' writes it: halfway between two
// tenths it takes the even one, where toFixed rounds up. A double is exactly
// halfway only when 4x is an odd integer (0.25, 1.25, ...).
function fixed1(x: number): string {
  if (Number.isInteger(4 * x) && (4 * x) % 2 !== 0) {
    const n = Math.floor(10 * x)
    return ((n % 2 === 0 ? n : n + 1) / 10).toFixed(1)
  }
  return x.toFixed(1)
}

// A share as the report shows it: a whole percentage from 10%, one decimal
// below (a trailing .0 dropped), '<0.1%' under that; '—' for none.
export function pct(share: number | null): string {
  if (share == null) return '—'
  if (share >= 0.0995) return `${Math.trunc(share * 100 + 0.5)}%`
  if (share >= 0.001) return `${fixed1(share * 100).replace(/\.0$/, '')}%`
  if (share > 0) return '<0.1%'
  return '0%'
}

// The CSS rule for class l<rings>, a perk ring in the colours of the lists
// at those places ('1-3'): a list's colour is the --wl token its place comes
// round to, four in turn. Each list's colour takes a quarter of the ring
// (--ring, its four border colours), the first's any quarter left over, and
// the first's is --tint, the fill's colour.
export function ringRule(rings: string): string {
  const colors = rings.split('-').map((place) => `var(--wl${((Number(place) - 1) % 4) + 1})`)
  const sides = [0, 1, 2, 3].map((i) => colors[Math.floor((i * colors.length) / 4)]).join(' ')
  return `.l${rings} { --tint: ${colors[0]}; --ring: ${sides}; }`
}

// The k-place subsets of the places from to n, in itertools.combinations'
// order.
function combinations(from: number, n: number, k: number): number[][] {
  if (k === 0) return [[]]
  const subsets: number[][] = []
  for (let first = from; first <= n - k + 1; first++) {
    for (const rest of combinations(first + 1, n, k - 1)) subsets.push([first, ...rest])
  }
  return subsets
}

// Every set of the list places 1 to n, as a ring class's places ('1',
// '1-3', ...): a grid's ring can take any of them.
export function ringSets(n: number): string[] {
  const sets: string[] = []
  for (let k = 1; k <= n; k++) sets.push(...combinations(1, n, k).map((places) => places.join('-')))
  return sets
}

// Whether a space-separated list (a grid row's owners) names item.
export function naming(values: string, item: unknown): boolean {
  return values.split(/\s+/).includes(String(item))
}

// The CLI's environment: HTML templates (.html, .html.j2) autoescaped, block
// tags trimmed, and the Python methods the templates call (str.split,
// dict.items, ...).
const env = new Environment()
env.setAutoEscapeCallback((name) => name.endsWith('.html') || name.endsWith('.html.j2'))
env.trimBlocks = true
env.lstripBlocks = true
env.pycompat = true
for (const [name, source] of Object.entries(TEMPLATES)) env.addTemplate(name, source)
env.addFilter('group', group)
env.addFilter('icons', textWithIcons)
env.addFilter('dim', dimQuery)
env.addFilter('day', day)
env.addFilter('short', short)
env.addFilter('pct', pct)
env.addFilter('ring_rule', ringRule)
env.addTest('naming', naming)
env.addGlobal('dict', (pairs: [unknown, unknown][]) => new Dict(pairs))
env.addGlobal('ring_sets', ringSets)
env.addGlobal('stat_short', ARMOR_STAT_SHORT_MAP)
env.addGlobal('armor_reasons', ARMOR_REASONS)
env.addGlobal('weapon_reasons', WEAPON_REASONS)

// A row MiniJinja reads a field at a time, as the template asks for it. A
// plain object it copies whole into the template, and again into and out of
// each filter and function the rows pass through (|group, dict), which took
// seconds for the grid's tens of thousands of rows.
class LazyRow {}

// A template rendered with the report data, for the Bungie Name player
// ("Name#1234": the name, and the #code apart).
function render(template: string, data: ReportData, player: string): string {
  const [name, ...code] = player.split('#')
  const context: Record<string, unknown> = { player: name, code: code.join('#') }
  for (const [key, value] of Object.entries(data)) {
    context[key] = Array.isArray(value) ? value.map((row) => Object.assign(new LazyRow(), row)) : value
  }
  return env.renderTemplate(template, context)
}

// The Markdown copy, the CLI's d2_report_<name>.md.
export function renderMarkdown(data: ReportData, player: string): string {
  return render('report.md.j2', data, player)
}

// The HTML page, the CLI's d2_report_<name>.html.
export function renderHtml(data: ReportData, player: string): string {
  return asMarkupSafe(render('page.html.j2', data, player))
}

// The page's body for the site to show: the HTML page without its head
// (the site links styles.css itself) and its inline script, which the site's
// Content-Security-Policy wouldn't run: the site loads report.js as a file
// once the body is in place.
export function renderBody(data: ReportData, player: string): string {
  const html = renderHtml(data, player)
  return html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('<script>'))
}
