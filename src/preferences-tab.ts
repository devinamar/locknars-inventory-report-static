// The report's Preferences tab, the CLI's terminal preference editor and
// --add-wishlist in the report itself: each set's stat picks, grade and place
// in its grade, each exotic's stat picks, the player's own wishlists, a backup
// file of them all, and the armor preferences back to the defaults. The
// template (templates/preferences.html.j2) draws the controls as the report
// was built; this keeps them working. A change is saved in this browser at
// once (src/saved.ts), as a change to what's saved, by the CLI's rules as
// ported (src/analyze/prefs/store.ts, src/preferences.ts, src/wishlists.ts),
// and the controls are drawn again from what's saved. The rest of the report
// still shows the preferences it was built with until the page is reloaded,
// which rebuilds it (src/main.ts); the bar at the tab's end says so.
import { gradeMembers, insertIntoGrade, type Prefs, sortedPrefs } from './analyze/prefs/store.ts'
import { parseBackup, toPrefs, toRows, withPick } from './preferences.ts'
import { keepSaved, loadSaved, type Saved } from './saved.ts'
import { sourceKey, sourceProblem, type WishlistSource } from './wishlists.ts'

// The changes, each from the settings saved to what they become.

// saved with its armor preferences changed by change, then kept in the
// editor's order (sets by grade and rank, exotics by name), as a build reads
// them back.
function edited(saved: Saved, change: (prefs: Prefs) => void): Saved {
  const prefs = toPrefs(saved.preferences)
  change(prefs)
  return { ...saved, preferences: toRows(sortedPrefs(prefs)) }
}

// The preference called name with stat (null for None) as its pick i (0 to
// 2), the picks kept as withPick keeps them: no stat twice, none after None.
export function pickStat(saved: Saved, name: string, i: number, stat: string | null): Saved {
  return edited(saved, (prefs) => {
    const pref = prefs.get(name)
    if (pref) prefs.set(name, withPick(pref, i, stat))
  })
}

// The set called name moved by places (-1 up, 1 down) in its grade; past
// either end it stays.
export function moveSet(saved: Saved, name: string, by: number): Saved {
  return edited(saved, (prefs) => {
    const pref = prefs.get(name)
    if (!pref) return
    const members = gradeMembers(prefs, pref.grade)
    const place = members.findIndex(([n]) => n === name) + 1 + by
    if (place >= 1 && place <= members.length) insertIntoGrade(prefs, name, pref.grade, place)
  })
}

// The set called name in grade, last there (the CLI editor's default place);
// the grade it left closes up.
export function regradeSet(saved: Saved, name: string, grade: string): Saved {
  return edited(saved, (prefs) => {
    if (prefs.get(name)?.grade === grade) return
    insertIntoGrade(prefs, name, grade, gradeMembers(prefs, grade, name).length + 1)
  })
}

// No armor preferences of the player's: the next build starts from the shared
// database's defaults and fills in the rest, as a new player's does. Their
// own wishlists stay.
export function resetArmor(saved: Saved): Saved {
  return { ...saved, preferences: [] }
}

// A wishlist of the player's added, keyed as its label makes, if the CLI's
// --add-wishlist would have: checked against defaults (the wishlists every
// report uses) and the player's. Throws why when it isn't.
export function addList(saved: Saved, defaults: WishlistSource[], label: string, url: string): Saved {
  const problem = sourceProblem([...defaults, ...saved.wishlists], label, url)
  if (problem) throw new Error(problem)
  return { ...saved, wishlists: [...saved.wishlists, { key: sourceKey(label), label, url }] }
}

// The player's wishlist keyed key, gone.
export function removeList(saved: Saved, key: string): Saved {
  return { ...saved, wishlists: saved.wishlists.filter((w) => w.key !== key) }
}

// The backup file Export writes, which parseBackup reads back.
export function backupText(saved: Saved): string {
  return `${JSON.stringify({ version: 1, ...saved }, null, 2)}\n`
}

// The page

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

// A wishlist of the player's, as the template lists it, with its Remove.
function listRow({ key, label, url }: WishlistSource): HTMLTableRowElement {
  const remove = el('button', { type: 'button', className: 'act remove', textContent: 'Remove' })
  remove.dataset.key = key
  remove.setAttribute('aria-label', `Remove ${label}`)
  return el(
    'tr',
    { className: 'own' },
    el('th', { scope: 'row', textContent: label }),
    el('td', { className: 'num', textContent: key }),
    el('td', {}, el('a', { href: url, title: url, textContent: url.split('/').at(-1) || url })),
    el('td', {}, remove),
  )
}

// Make the tab's controls work, for a report built with the settings
// builtWith (as JSON: CachedReport's settings), whose Markdown copy is
// markdown (none for a report kept from before there was one), for the player
// bungieName (Name#1234).
export function setup(builtWith: string, markdown?: string, bungieName = ''): void {
  const tab = document.getElementById('page-preferences')
  // A report kept from before the tab had controls has none to set up.
  if (!tab?.querySelector('.pref-bar')) return
  const $ = <T extends Element>(selector: string) => tab.querySelector<T>(selector)!
  const rows = new Map([...tab.querySelectorAll<HTMLElement>('tr[data-name]')].map((tr) => [tr.dataset.name!, tr]))
  const sets = $('.sets tbody')
  const lists = $<HTMLTableSectionElement>('.lists tbody')
  const form = $<HTMLFormElement>('.add-list')
  const upload = $<HTMLInputElement>('.import')
  const status = $('.pref-status')
  const stale = $<HTMLElement>('.pref-stale')
  // The wishlists every report uses, as this one lists them: a new list, or a
  // backup's, can't take their names or URLs.
  const defaults = [...lists.rows]
    .filter((tr) => !tr.classList.contains('own'))
    .map((tr) => ({
      label: tr.cells[0].textContent!,
      key: tr.cells[1].textContent!,
      url: tr.querySelector('a')!.getAttribute('href')!,
    }))

  // Draw the armor preferences as saved: each row's picks, each set's grade
  // and place, a move past its grade's end off. When the tab shows one that
  // isn't saved (after a reset or an import, until the report is rebuilt),
  // nothing is drawn and the controls are off; false then.
  function draw(saved: Saved): boolean {
    const prefs = toPrefs(saved.preferences)
    const live = [...rows.keys()].every((name) => prefs.has(name))
    for (const control of tab!.querySelectorAll<HTMLSelectElement | HTMLButtonElement>('.prefs select, .prefs .move')) {
      control.disabled = !live
    }
    if (!live) return false
    const shown = [...sortedPrefs(prefs)].filter(([name]) => rows.has(name))
    for (const [name, pref] of shown) {
      const picks = [pref.stat1, pref.stat2, pref.stat3]
      rows.get(name)!.querySelectorAll<HTMLSelectElement>('.pick').forEach((select, i) => {
        select.value = picks[i] ?? ''
        select.disabled = i > 0 && !picks[i - 1]
        for (const option of select.options) option.disabled = picks.slice(0, i).includes(option.value)
      })
    }
    const setRows = shown.filter(([, pref]) => !pref.isExotic)
    setRows.forEach(([name, pref], i) => {
      const tr = rows.get(name)!
      sets.append(tr)
      tr.querySelector<HTMLSelectElement>('.pref-grade')!.value = pref.grade
      const [up, down] = tr.querySelectorAll('.move')
      up.setAttribute('aria-disabled', String(setRows[i - 1]?.[1].grade !== pref.grade))
      down.setAttribute('aria-disabled', String(setRows[i + 1]?.[1].grade !== pref.grade))
    })
    return true
  }

  // List the player's wishlists as saved, after the defaults.
  function drawLists(saved: Saved): void {
    for (const tr of lists.querySelectorAll('tr.own')) tr.remove()
    lists.append(...saved.wishlists.map(listRow))
    lists.closest('details')!.querySelector('summary .num')!.textContent = String(lists.rows.length)
  }

  // Say text in the bar, and offer the rebuild while the report was built
  // with other settings than those saved.
  function say(text: string): void {
    status.textContent = text
    stale.hidden = JSON.stringify(loadSaved()) === builtWith
  }

  // Save next and draw the tab from what's saved, then put the focus back on
  // focus (a moved row loses it) and say done; or say that this browser keeps
  // nothing.
  function keep(next: Saved, done: string, focus?: HTMLElement | null): void {
    const kept = keepSaved(next)
    const saved = loadSaved()
    const live = draw(saved)
    drawLists(saved)
    focus?.focus()
    if (!kept) say("Not saved: this browser isn't letting the page keep anything (a private window?).")
    else say(live ? done : `${done} You can edit them here once the report is rebuilt.`)
  }

  // A pick or a grade chosen.
  tab.addEventListener('change', (event) => {
    const select = event.target as HTMLSelectElement
    const name = select.closest('tr')?.dataset.name
    if (!name || !select.matches('.pick, .pref-grade')) return
    const saved = loadSaved()
    const next = select.matches('.pref-grade')
      ? regradeSet(saved, name, select.value)
      : pickStat(saved, name, Number(select.dataset.pick), select.value || null)
    keep(next, 'Saved in your browser.', select)
  })

  // A set moved up or down its grade; a wishlist removed.
  tab.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.move, .remove')
    const name = button?.closest('tr')?.dataset.name
    if (button?.matches('.move') && name && button.getAttribute('aria-disabled') !== 'true') {
      keep(moveSet(loadSaved(), name, Number(button.dataset.move)), 'Saved in your browser.', button)
    } else if (button?.matches('.remove')) {
      const saved = loadSaved()
      const gone = saved.wishlists.find((w) => w.key === button.dataset.key)
      keep(removeList(saved, button.dataset.key!), `Removed ${gone?.label ?? 'the wishlist'}.`)
      ;(lists.querySelector<HTMLElement>('.remove') ?? form.querySelector('input'))?.focus()
    }
  })

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const data = new FormData(form)
    const [label, url] = ['label', 'url'].map((field) => String(data.get(field)).trim())
    let next: Saved
    try {
      next = addList(loadSaved(), defaults, label, url)
    } catch (error) {
      return say(`Not added: ${(error as Error).message}.`)
    }
    form.reset()
    keep(next, `Added ${label} (key ${sourceKey(label)}).`)
  })

  // The settings as a backup file, downloaded.
  $('.export').addEventListener('click', () => {
    const file = new Blob([backupText(loadSaved())], { type: 'application/json' })
    const day = new Date().toISOString().slice(0, 10)
    el('a', { href: URL.createObjectURL(file), download: `d2-report-preferences-${day}.json` }).click()
  })

  // The report as Markdown, named as the CLI named its file; a report kept
  // from before there was a copy has no button for it.
  if (markdown) {
    $('button.markdown').addEventListener('click', () => {
      const file = new Blob([markdown], { type: 'text/markdown' })
      el('a', { href: URL.createObjectURL(file), download: `d2_report_${bungieName.split('#')[0]}.md` }).click()
    })
  } else {
    for (const part of tab.querySelectorAll<HTMLElement>('.markdown')) part.hidden = true
  }

  // A backup file's settings in place of these, if every part of it checks
  // out.
  upload.addEventListener('change', async () => {
    const file = upload.files?.[0]
    if (!file) return
    let next: Saved
    try {
      next = parseBackup(await file.text(), defaults)
    } catch (error) {
      return say(`Not imported: ${(error as Error).message}. Nothing changed.`)
    } finally {
      upload.value = '' // so the same file can be chosen again
    }
    keep(next, `Imported ${next.preferences.length} preferences and ${next.wishlists.length} wishlists.`)
  })

  $('.reset').addEventListener('click', () => {
    if (!confirm('Reset your armor preferences to the defaults? Your own wishlists stay.')) return
    keep(resetArmor(loadSaved()), 'Your armor preferences are back to the defaults.')
  })

  // The page loaded again rebuilds the report with what's saved.
  $('.rebuild').addEventListener('click', () => location.reload())

  // The tab as saved, which a report built before the last change doesn't
  // show; when it shows armor preferences that aren't saved, why.
  const saved = loadSaved()
  const live = draw(saved)
  drawLists(saved)
  if (live) say('')
  else if (JSON.stringify(saved) !== builtWith) {
    say('This report was built with other armor preferences than your saved ones: edit those once it is rebuilt.')
  } else say("This browser isn't letting the page keep anything (a private window?), so nothing here can be changed.")
}
