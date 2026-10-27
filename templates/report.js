// The report's behaviour: page tabs by URL hash, class, weapon, side and
// wishlist switches, opening weapon cards, armor sets and Popular's weapons
// (one by one, or a group at a time by its double chevron), the perk grids
// they open and the copy a weapon card shows, Popular's filters, tooltips and
// copying DIM queries and ids.

// Tabs: show the page the hash names (#weapons shows #page-weapons), the
// Summary when it names none. Page ids differ from the hashes so the browser
// doesn't scroll past the header to them.
function route() {
    let shown = 'summary';
    if (document.getElementById('page-' + location.hash.slice(1))) {
        shown = location.hash.slice(1);
    }
    for (const p of document.querySelectorAll('.page')) {
        p.hidden = p.id !== 'page-' + shown;
    }
    for (const a of document.querySelectorAll('nav a')) {
        if (a.hash === '#' + shown) {
            a.setAttribute('aria-current', 'page');
        } else {
            a.removeAttribute('aria-current');
        }
    }
    window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
route();

// A side's scope: the closest element that names a side (a Popular list, a
// weapon card), PvE outside one.
function sideOf(el) {
    const scope = el.closest('[data-side]');
    if (scope) {
        return scope.dataset.side;
    }
    return 'pve';
}

// A share as the report shows it (templating.pct): a whole percentage from
// 10%, one decimal below, '<0.1%' under that.
function pct(share) {
    if (share >= 0.0995) {
        return Math.floor(share * 100 + 0.5) + '%';
    }
    if (share >= 0.001) {
        return (share * 100).toFixed(1).replace(/\.0$/, '') + '%';
    }
    if (share > 0) {
        return '<0.1%';
    }
    return '0%';
}

// The heat colour of rel, a share against its column's top: red at 0, yellow
// at 0.5, green at 1, as the rows' --h0 to --h10.
function heat(rel) {
    const t = Math.min(1, Math.max(0, rel));
    if (t <= 0.5) {
        return `color-mix(in oklab, var(--heat-lo) ${Math.round((1 - 2 * t) * 100)}%, var(--heat-mid))`;
    }
    return `color-mix(in oklab, var(--heat-mid) ${Math.round((2 - 2 * t) * 100)}%, var(--heat-hi))`;
}

// Tooltips: one fixed element filled from the hovered or focused element's
// tip-<id> block (a perk's by its plug, a weapon's confidence or Endgame badge
// per side, a Preferences badge's set or exotic). A grid row's adds its rank
// on the side shown, the shown lists naming it (or with a roll the copy shown
// completes) and, while a trait is focused, its pair with that trait. It sits
// above its element when it fits, else below; a trait's sits beside its
// column (left of Trait 1, right of Trait 2), clear of the pair lines between
// them.
const tip = document.getElementById('tip');
const SIDE_LABELS = { pve: 'PvE', pvp: 'PvP' };

function gridTip(perk) {
    const side = sideOf(perk);
    const head = document.createElement('div');
    head.className = 'tip-head';
    head.append(tip.querySelector('b'));
    let rank = null;
    if (perk.matches('.tp')) {
        rank = 1;
    } else if ((perk.dataset[side === 'pvp' ? 'b' : 'a'] || '—') !== '—') {
        rank = perk.dataset.r.split(' ')[Number(side === 'pvp')];
    }
    if (rank) {
        const r = document.createElement('span');
        r.className = 'tip-rank';
        r.textContent = '#' + rank;
        head.append(r);
    }
    tip.prepend(head);
    const ring = [...perk.classList].find((c) => /^l\d/.test(c));
    if (ring) {
        const named = document.createElement('p');
        named.className = 'named';
        let lead = 'Named by ';
        if (perk.classList.contains('hit')) {
            lead = 'In a roll this copy completes: ';
        }
        named.append(lead);
        const names = document.querySelectorAll('#wishlists .wl-name');
        ring.slice(1).split('-').forEach((place, i) => {
            if (i) {
                named.append(', ');
            }
            named.append(names[place - 1].cloneNode(true));
        });
        tip.append(named);
    }
    if (perk._pair) {
        const p = perk._pair;
        const line = document.createElement('p');
        line.className = 'tip-pair';
        line.style.color = heat(p.rel);
        line.textContent = `${p.name}: ${pct(p.share)} of all ${SIDE_LABELS[side]} pairs, #${p.rank}`;
        tip.append(line);
    }
}

function showTip(e) {
    const perk = e.target.closest('[data-tip]');
    const source = perk && document.getElementById('tip-' + perk.dataset.tip);
    if (!source) {
        tip.hidden = true;
        return;
    }
    tip.innerHTML = source.innerHTML;
    if (perk.matches('.pk, .tp')) {
        gridTip(perk);
    }
    tip.hidden = false;
    const r = perk.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const col = perk.closest('.pc');
    const trait = (col && col.dataset.col) || '';
    let top = r.top - h - 6;
    let left = r.left;
    if (trait === 'trait1' && r.left - w - 12 >= 8) {
        left = r.left - w - 12;
        top = r.top;
    } else if (trait === 'trait2' && r.right + w + 12 <= innerWidth - 8) {
        left = r.right + 12;
        top = r.top;
    } else {
        if (top < 8) {
            top = r.bottom + 6;
        }
        if (trait === 'trait1') {
            left = r.right - w;
        }
    }
    tip.style.top = Math.max(8, Math.min(top, innerHeight - h - 8)) + 'px';
    tip.style.left = Math.max(8, Math.min(left, innerWidth - w - 8)) + 'px';
}

document.addEventListener('mouseover', showTip);
document.addEventListener('focusin', showTip);

// Weapon sections: each shows when a weapon in it does and counts those
// showing, as Roll Quality's heading counts them all.
function countCards(page) {
    for (const fold of page.querySelectorAll('details.fold')) {
        const count = fold.querySelector(':scope > summary .count');
        if (!count) {
            continue;
        }
        const n = fold.querySelectorAll('.fam:not([hidden])').length;
        count.textContent = n;
        fold.hidden = n === 0;
    }
    const total = page.querySelector('h2 .count');
    if (total) {
        total.textContent = page.querySelectorAll('.fam:not([hidden])').length;
    }
}
addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

// Perk grids (grids.html.j2): a grid's template is cloned into a Popular
// row or a weapon card the first time it opens. Its rows go in the order of
// the side shown (data-r holds each side's place), its perks named by a list
// the wishlist switch shows get that list's ring (data-l holds the places of
// the lists naming each), and its trait pairs' lines are drawn from its paths
// (each side's figures in data-pve and data-pvp). On a weapon card the grid
// shows the copy picked (the host's data-k): its perks outlined (data-o),
// those in a roll it completes ringed solid (data-h), and its pairs' lines.
// Hovering or focusing a trait focuses it: its partners light up, tinted and
// lined by how often players pair them, and the rest fade. Clicking it, or
// Enter, pins the focus until Esc or another click.

// The list place the wishlist switch shows, as a string, or null for All
// lists (and on a page without the switch).
function placeShown(page) {
    const buttons = [...page.querySelectorAll('.switch[data-key="wl"] button')].slice(1);
    const pressed = buttons.findIndex((b) => b.getAttribute('aria-pressed') === 'true');
    if (pressed < 0) {
        return null;
    }
    return String(pressed + 1);
}

// A list's children (a grid column's rows, a picker's copies) in the order of
// the side shown: data-r holds each side's place.
function sortBySide(list) {
    const i = Number(sideOf(list) === 'pvp');
    const items = [...list.children];
    const place = (el) => Number(el.dataset.r.split(' ')[i]);
    if (items.every((el, n) => n === 0 || place(items[n - 1]) <= place(el))) {
        return;
    }
    items.sort((a, b) => place(a) - place(b));
    list.append(...items);
}

// The places among a space- or dash-separated list (data-l, a hit's places)
// that the wishlist switch shows.
function placesShown(text, shown) {
    return (text || '').split(/[ -]/).filter((place) => place && (!shown || place === shown));
}

// A grid's wishlist rings. With no copy shown, each perk named by a list shown
// is ringed (pick) in those lists' colours (l<places>). With a copy, its perks
// are outlined (owned); one in a roll of a list shown that the copy completes
// is ringed solid (hit) in those lists' colours, and any other perk a list
// shown names is ringed dashed (named). A row keeps its classes (_ring) and is
// only touched when they change.
function paintGrid(grid) {
    const shown = placeShown(grid.closest('.page'));
    const k = grid.closest('[data-g]').dataset.k;
    grid.classList.toggle('has-copy', Boolean(k));
    for (const li of grid.querySelectorAll('.pk')) {
        const ring = [];
        let places = placesShown(li.dataset.l, shown);
        let state = 'pick';
        if (k) {
            state = 'named';
            if ((li.dataset.o || '').split(' ').includes(k)) {
                ring.push('owned');
            }
            const hit = (li.dataset.h || '').split(' ').find((h) => h.startsWith(k + ':'));
            const hits = placesShown(hit && hit.split(':')[1], shown);
            if (hits.length) {
                state = 'hit';
                places = hits;
            }
        }
        if (places.length) {
            ring.push(state, 'l' + places.join('-'));
        }
        const key = ring.join(' ');
        if ((li._ring || '') === key) {
            continue;
        }
        if (li._ring) {
            li.classList.remove(...li._ring.split(' '));
        }
        li.classList.add(...ring);
        li._ring = key;
    }
}

// A pair's figures on a side, from its line's path: its rank, rel and share,
// each 0 where players weren't seen with it, and its verdict (g, b or m);
// null when the side has no pair scores.
function pairOn(path, side) {
    const figures = path.dataset[side];
    if (!figures) {
        return null;
    }
    const fields = figures.split(' ');
    const [rank, rel, share] = fields.slice(0, 3).map(Number);
    return { path, rank, rel, share, verdict: fields[3] };
}

// How strongly a line shows: steeply fainter as its pair's share drops.
function fade(rel) {
    return 0.12 + 0.88 * rel * rel;
}

// The lines waiting for the next frame, by grid: each a pair's path, the
// rows it joins (from in Trait 1, to in Trait 2) and its look. They are drawn
// together, every rectangle read before any path is written, so the page is
// laid out once a frame rather than once a line.
const queued = new Map();

// Draw the queued lines in their grids' coordinates; a grid closed since
// (no width) draws none.
function drawQueued() {
    const jobs = [...queued].map(([grid, lines]) => ({
        grid,
        box: grid.getBoundingClientRect(),
        lines: lines.map((line) => ({
            ...line,
            a: line.from.getBoundingClientRect(),
            b: line.to.getBoundingClientRect(),
        })),
    }));
    queued.clear();
    for (const { grid, box, lines } of jobs) {
        if (!box.width) {
            continue;
        }
        for (const { path, a, b, cls, width, opacity, color } of lines) {
            const x1 = a.right - box.left;
            const y1 = a.top + a.height / 2 - box.top;
            const x2 = b.left - box.left;
            const y2 = b.top + b.height / 2 - box.top;
            const mx = (x1 + x2) / 2;
            path.setAttribute('d', `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`);
            path.setAttribute('class', cls);
            path.setAttribute('stroke-width', width);
            path.setAttribute('stroke-opacity', opacity.toFixed(2));
            path.style.stroke = color;
            path.style.display = '';
        }
        const svg = grid.querySelector('.links');
        svg.setAttribute('width', box.width);
        svg.setAttribute('height', box.height);
        svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    }
}

// Queue a grid's lines for the next frame, replacing any queued before.
function queueLines(grid, lines) {
    if (!queued.size) {
        requestAnimationFrame(drawQueued);
    }
    queued.set(grid, lines);
}

// The trait columns in focus: a focused trait's six most run partners light
// up (tinted, showing the pair's share of all the weapon's pairs in bold) and
// are lined, weighted by how often players pick the pair; the other traits fade, and so do the other
// columns. Without a focus, the side's three most picked pairs are lined, or
// with a copy shown, the pairs it can make that are desired (in a roll of a
// list shown, or the pair's verdict) or undesirable (in a trash roll of a list
// shown, or the verdict), a trash pair in red, and dashed, the two most picked
// pairs it can't make.
function applyFocus(grid, focus) {
    grid._focus = focus;
    if (grid._lit) {
        for (const li of grid._lit) {
            li.classList.remove('focus', 'partner', 'dim');
            li.style.removeProperty('--heat');
            delete li.dataset.f;
            li._pair = null;
        }
        for (const list of grid.querySelectorAll('.pl.soft')) {
            list.classList.remove('soft');
        }
        grid._lit = null;
    }
    if ((grid._pressed || null) !== (grid._pinned || null)) {
        if (grid._pressed) {
            grid._pressed.setAttribute('aria-pressed', 'false');
        }
        if (grid._pinned) {
            grid._pinned.setAttribute('aria-pressed', 'true');
        }
        grid._pressed = grid._pinned;
    }
    const svg = grid.querySelector('.links');
    const paths = [...svg.children];
    for (const p of paths) {
        if (p.style.display !== 'none') {
            p.style.display = 'none';
        }
    }
    const t1 = grid.querySelector('.pc[data-col="trait1"]');
    const t2 = grid.querySelector('.pc[data-col="trait2"]');
    if (!t1 || !t2) {
        return;
    }
    const lines = [];
    const side = sideOf(grid);
    const row = (col, key) => col.querySelector(`[data-tip="${key}"]`);
    const pairs = paths.map((p) => pairOn(p, side)).filter((p) => p && p.rank);
    pairs.sort((x, y) => x.rank - y.rank);
    const k = grid.closest('[data-g]').dataset.k;
    if (focus) {
        const first = t1.contains(focus);
        const key = focus.dataset.tip;
        const partners = pairs.filter((p) => p.path.dataset[first ? 'a' : 'b'] === key).slice(0, 6);
        focus.classList.add('focus');
        grid._lit = [...t1.querySelectorAll('.pk'), ...t2.querySelectorAll('.pk')];
        for (const li of grid._lit) {
            if (li !== focus) {
                li.classList.add('dim');
            }
        }
        for (const p of partners) {
            let other = row(t1, p.path.dataset.a);
            if (first) {
                other = row(t2, p.path.dataset.b);
            }
            if (!other) {
                continue;
            }
            const [from, to] = first ? [focus, other] : [other, focus];
            other.classList.replace('dim', 'partner');
            other.style.setProperty('--heat', heat(p.rel));
            other.dataset.f = pct(p.share);
            other._pair = { name: from.textContent + ' + ' + to.textContent, share: p.share, rank: p.rank, rel: p.rel };
            const opacity = Math.max(0.25, fade(p.rel));
            lines.push({ path: p.path, from, to, cls: 'hover', width: 1 + 5 * p.rel, opacity, color: heat(p.rel) });
        }
        for (const list of grid.querySelectorAll('.pc:not([data-col^="trait"]) .pl')) {
            list.classList.add('soft');
        }
    } else if (k) {
        const shown = placeShown(grid.closest('.page'));
        const made = paths.filter((path) => (path.dataset.c || '').split(' ').includes(k));
        for (const path of made) {
            const p = pairOn(path, side) || { path, rel: 0, verdict: null };
            const trash = placesShown(path.dataset.t, shown).length > 0;
            const wanted = !trash && placesShown(path.dataset.w, shown).length > 0;
            let cls = null;
            if (trash || (!wanted && p.verdict === 'b')) {
                cls = 'bad';
            } else if (wanted || p.verdict === 'g') {
                cls = 'good';
            }
            const from = row(t1, path.dataset.a);
            const to = row(t2, path.dataset.b);
            if (!cls || !from || !to) {
                continue;
            }
            let opacity = Math.max(cls === 'bad' ? 0.4 : 0.3, fade(p.rel));
            if (wanted) {
                opacity = 1;
            }
            let color = heat(p.rel);
            if (trash) {
                color = 'var(--bad)';
            }
            lines.push({ path, from, to, cls, width: 2.5, opacity, color });
        }
        for (const p of pairs.filter((x) => !made.includes(x.path)).slice(0, 2)) {
            const from = row(t1, p.path.dataset.a);
            const to = row(t2, p.path.dataset.b);
            if (from && to) {
                const opacity = 0.7 * fade(p.rel);
                lines.push({ path: p.path, from, to, cls: 'top', width: 1.5, opacity, color: heat(p.rel) });
            }
        }
    } else {
        for (const p of pairs.slice(0, 3)) {
            const from = row(t1, p.path.dataset.a);
            const to = row(t2, p.path.dataset.b);
            if (from && to) {
                const width = 1 + 5 * p.rel;
                lines.push({ path: p.path, from, to, cls: 'good', width, opacity: fade(p.rel), color: heat(p.rel) });
            }
        }
    }
    queueLines(grid, lines);
}

// A grid's focus follows the pointer and keyboard over its traits, held while
// the pointer crosses the space between them and dropped when it leaves the
// grid; a click or Enter pins it, and Esc, or a click elsewhere in the grid,
// unpins it.
function traitRow(target) {
    const li = target.closest('.pk');
    if (li && li.closest('.pc[data-col^="trait"]')) {
        return li;
    }
    return null;
}

function bindGrid(grid) {
    // Pin li, or unpin it when it is the trait already pinned.
    const pin = (li) => {
        if (grid._pinned === li) {
            grid._pinned = null;
        } else {
            grid._pinned = li;
        }
        applyFocus(grid, grid._pinned);
    };
    grid.addEventListener('mouseover', (e) => {
        const li = traitRow(e.target);
        if (!grid._pinned && li && li !== grid._focus) {
            applyFocus(grid, li);
        }
    });
    grid.addEventListener('mouseleave', () => {
        if (!grid._pinned) {
            applyFocus(grid, null);
        }
    });
    grid.addEventListener('focusin', (e) => {
        if (!grid._pinned) {
            applyFocus(grid, traitRow(e.target));
        }
    });
    grid.addEventListener('focusout', (e) => {
        if (!grid._pinned && !grid.contains(e.relatedTarget)) {
            applyFocus(grid, null);
        }
    });
    grid.addEventListener('click', (e) => {
        const li = traitRow(e.target);
        if (li) {
            pin(li);
        } else if (grid._pinned) {
            pin(grid._pinned);
        }
    });
    grid.addEventListener('keydown', (e) => {
        const li = traitRow(e.target);
        if (e.key === 'Escape' && grid._pinned) {
            pin(grid._pinned);
        } else if (li && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            pin(li);
        }
    });
}

// Check copy k in a weapon card's picker, and name it on the grid host.
function checkCopy(card, k) {
    for (const entry of card.querySelectorAll('.pr')) {
        entry.querySelector('.pr-select').setAttribute('aria-checked', entry.dataset.k === k);
    }
    card.querySelector('[data-g]').dataset.k = k;
}

// Show copy k on a weapon card: checked, and the grid, once open, painted and
// lined for it.
function pickCopy(card, k) {
    checkCopy(card, k);
    const grid = card.querySelector('.pg');
    if (grid) {
        paintGrid(grid);
        applyFocus(grid, grid._pinned || null);
    }
}

// Grid hosts are watched as they come near the window (within 1000px): a host
// marked stale (a switch changed while it was away, or Expand all opened its
// card) opens then, so off-screen grids cost nothing until they're seen.
const watcher = new IntersectionObserver((entries) => {
    for (const e of entries) {
        e.target._near = e.isIntersecting;
        if (e.isIntersecting && e.target._stale) {
            openGrid(e.target);
        }
    }
}, { rootMargin: '1000px 0px' });

// Open the grid a host names (data-g: a Popular row's body, a weapon card's
// main column): cloned from its template the first time, then sorted for the
// side, its rings painted and its lines drawn. A weapon card's picker is
// sorted for the side too, and shows its first copy until another is picked.
// A resized grid redraws its lines.
const resizer = new ResizeObserver((entries) => {
    for (const e of entries) {
        applyFocus(e.target, e.target._focus || null);
    }
});

function openGrid(host) {
    let grid = host.querySelector('.pg');
    if (!grid) {
        host.prepend(document.getElementById('g' + host.dataset.g).content.cloneNode(true));
        grid = host.querySelector('.pg');
        for (const li of grid.querySelectorAll('.pk')) {
            li.tabIndex = 0;
        }
        for (const li of grid.querySelectorAll('.pc[data-col^="trait"] .pk')) {
            li.setAttribute('role', 'button');
            li.setAttribute('aria-pressed', 'false');
        }
        bindGrid(grid);
        resizer.observe(grid);
    }
    host._stale = false;
    watcher.observe(host);
    const card = host.closest('.fam');
    if (card) {
        const picker = card.querySelector('.picker');
        sortBySide(picker);
        if (!host.dataset.k) {
            checkCopy(card, picker.firstElementChild.dataset.k);
        }
    }
    for (const list of grid.querySelectorAll('.pl')) {
        sortBySide(list);
    }
    paintGrid(grid);
    applyFocus(grid, grid._pinned || null);
}

// Open or refresh a grid host's grid now when it's near the window, else when
// it comes near.
function refresh(host) {
    if (host._near) {
        openGrid(host);
    } else {
        host._stale = true;
        watcher.observe(host);
    }
}

// The grid host of a card part a toggle opens: the part itself (a Popular
// row's body), or the one inside it (a weapon card's body); null for others.
function gridHost(target) {
    if (target.dataset.g) {
        return target;
    }
    return target.querySelector('[data-g]');
}

// Show a weapon card on a side: its switch pressed, and once its grid is open,
// its picker and grid in that side's order, lines and colours.
function setSide(card, side) {
    card.dataset.side = side;
    for (const b of card.querySelectorAll('.switch.side button')) {
        b.setAttribute('aria-pressed', b.dataset.value === side);
    }
    const grid = card.querySelector('.pg');
    if (grid) {
        refresh(grid.closest('[data-g]'));
    }
}

// Popular's filters: a row shows when its name holds the search, it is of the
// type chosen, of a slot and an ammo type chosen (any while none is), and in
// the vault while In my vault is pressed. The count is the shown side's.
function filterPopular(page) {
    const search = page.querySelector('.search');
    if (!search) {
        return;
    }
    const q = search.value.trim().toLowerCase();
    const type = page.querySelector('.type-select').value;
    const chosen = (name) => [...page.querySelectorAll(`.switch[data-filter="${name}"] [aria-pressed="true"]`)]
        .map((b) => b.dataset.value)
        .filter(Boolean);
    const slots = chosen('slot');
    const ammo = chosen('ammo');
    const owned = page.querySelector('[data-filter="owned"]').getAttribute('aria-pressed') === 'true';
    let shown = 0;
    let total = 0;
    for (const list of page.querySelectorAll('.pops')) {
        for (const row of list.children) {
            const show = (!q || row.dataset.n.includes(q))
                && (!type || row.dataset.type === type)
                && (!slots.length || slots.includes(row.dataset.slot))
                && (!ammo.length || ammo.includes(row.dataset.ammo))
                && (!owned || row.hasAttribute('data-owned'));
            row.hidden = !show;
            if (!list.hidden) {
                total += 1;
                shown += Number(show);
            }
        }
    }
    page.querySelector('.shown').textContent = `${shown} of ${total} weapons`;
    page.querySelector('.empty').hidden = shown > 0;
}

for (const page of document.querySelectorAll('.page')) {
    filterPopular(page);
}
document.addEventListener('input', (e) => {
    if (e.target.matches('.search, .type-select')) {
        filterPopular(e.target.closest('.page'));
    }
});
document.addEventListener('change', (e) => {
    if (e.target.matches('.type-select')) {
        filterPopular(e.target.closest('.page'));
    }
});

// A double chevron's state: turned down (and its label Collapse all) while
// its section is rolled down.
function setRolled(button, open) {
    let label = 'Expand all';
    if (open) {
        label = 'Collapse all';
    }
    button.setAttribute('aria-expanded', open);
    button.setAttribute('aria-label', label);
    button.title = label;
}

// A group rolled down or up (a weapon section, or a class's armor sets): it,
// every section in it and every card in them (weapon cards, armor sets)
// opened or closed, their double chevrons turned to match.
function roll(group, open) {
    for (const d of [group, ...group.querySelectorAll('details')]) {
        if (d.tagName === 'DETAILS') {
            d.open = open;
        }
    }
    for (const t of group.querySelectorAll('.toggle')) {
        t.setAttribute('aria-expanded', open);
        const target = document.getElementById(t.getAttribute('aria-controls'));
        target.hidden = !open;
        const host = gridHost(target);
        if (open && host) {
            refresh(host);
        }
    }
    for (const b of group.querySelectorAll('.expand')) {
        setRolled(b, open);
    }
}

// A section closed by its own chevron: its double chevrons turn back, so the
// next one rolls it all down again.
document.addEventListener('toggle', (e) => {
    if (e.target.matches('details.fold') && !e.target.open) {
        for (const b of e.target.querySelectorAll('.expand')) {
            setRolled(b, false);
        }
    }
}, true);

// Switches: a page's elements show when their data-<key> names, among its
// space-separated values, the pressed value of every switch with that key.
// Has wishlist (listed) stands for the list the wishlist switch shows:
// listed-<key>, or listed-* for All lists. The weapon sections are recounted.
function applySwitches(page) {
    const list = page.querySelector('.switch[data-key="wl"] [aria-pressed="true"]');
    const keys = new Set([...page.querySelectorAll('.switch[data-key]')].map((sw) => sw.dataset.key));
    for (const key of keys) {
        const pressed = page.querySelectorAll(`.switch[data-key="${key}"] [aria-pressed="true"]`);
        const values = [...pressed].map((b) => {
            if (b.dataset.value === 'listed') {
                return 'listed-' + (list ? list.dataset.value : '*');
            }
            return b.dataset.value;
        });
        for (const el of page.querySelectorAll('[data-' + key + ']')) {
            const shows = el.dataset[key].split(' ');
            el.hidden = !values.every((value) => shows.includes(value));
        }
    }
    countCards(page);
    for (const grid of page.querySelectorAll('.pg')) {
        refresh(grid.closest('[data-g]'));
    }
    filterPopular(page);
}

// My Copies: a weapons page card by its grid's id (a flagged copy's
// keeper's, a Popular weapon's), on the side given, with copy k picked when
// given. The weapons page shows first when another does (its own history
// entry, so Back returns), the weapons switches go back to All when they hide
// the card, its sections and the card open, and it scrolls into view, flashed.
function goToCard(grid, k, side) {
    const card = document.getElementById('fam-' + grid).closest('.fam');
    const page = card.closest('.page');
    if (page.hidden) {
        history.pushState(null, '', '#' + page.id.slice('page-'.length));
        route();
    }
    if (card.hidden) {
        for (const sw of page.querySelectorAll('.switch[data-key="wpn"]')) {
            for (const b of sw.children) {
                b.setAttribute('aria-pressed', b === sw.firstElementChild);
            }
        }
        applySwitches(page);
    }
    for (let d = card.closest('details'); d; d = d.parentElement.closest('details')) {
        d.open = true;
    }
    if (side) {
        setSide(card, side);
    }
    const toggle = card.querySelector('.toggle');
    if (toggle.getAttribute('aria-expanded') !== 'true') {
        toggle.click();
    }
    if (k) {
        pickCopy(card, k);
    }
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
}

document.addEventListener('click', (e) => {
    // A switch: one button pressed at a time, the page's elements shown to
    // match (applySwitches). A multi switch's buttons each toggle beside its
    // All, which clears them; a flip switch's one button flips. Both filter
    // Popular. A side switch sets the side of its weapon card, or of every
    // card for the page's Popularity switch.
    const button = e.target.closest('.switch button');
    if (button && button.closest('.switch.multi')) {
        const all = button.parentElement.children[0];
        if (button === all) {
            for (const b of button.parentElement.children) {
                b.setAttribute('aria-pressed', b === all);
            }
        } else {
            button.setAttribute('aria-pressed', button.getAttribute('aria-pressed') !== 'true');
            const any = [...button.parentElement.children].some((b) => b !== all && b.getAttribute('aria-pressed') === 'true');
            all.setAttribute('aria-pressed', !any);
        }
        filterPopular(button.closest('.page'));
    } else if (button && button.closest('.switch.flip')) {
        button.setAttribute('aria-pressed', button.getAttribute('aria-pressed') !== 'true');
        filterPopular(button.closest('.page'));
    } else if (button && button.closest('.switch.side')) {
        for (const b of button.parentElement.children) {
            b.setAttribute('aria-pressed', b === button);
        }
        let cards = [button.closest('.fam')];
        if (!cards[0]) {
            cards = button.closest('.page').querySelectorAll('.fam');
        }
        for (const card of cards) {
            setSide(card, button.dataset.value);
        }
    } else if (button) {
        for (const b of button.parentElement.children) {
            b.setAttribute('aria-pressed', b === button);
        }
        applySwitches(button.closest('.page'));
    }

    // A double chevron rolls its whole group down or up: the weapon section
    // it leads (not just its own fold), or the class's armor sets.
    const expand = e.target.closest('.expand');
    if (expand) {
        e.preventDefault();
        roll(expand.closest('details, .cls'), expand.getAttribute('aria-expanded') !== 'true');
    }

    // Disclosure buttons (a weapon card's, armor set's or Popular weapon's
    // name): show or hide the part of the card the button controls.
    const toggle = e.target.closest('.toggle');
    if (toggle) {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', open);
        const target = document.getElementById(toggle.getAttribute('aria-controls'));
        target.hidden = !open;
        const host = gridHost(target);
        if (open && host) {
            openGrid(host);
        }
    }

    // My Copies: a flagged copy's opens its keeper's card, a Popular
    // weapon's its card, on the side of the list it's in.
    const goto = e.target.closest('.goto');
    if (goto) {
        const list = goto.closest('.pops');
        let side = null;
        if (list) {
            side = list.dataset.side;
        }
        goToCard(goto.dataset.goto, goto.dataset.k, side);
    }

    // A weapon card's picker entry shows its copy.
    const entry = e.target.closest('.pr-select');
    if (entry) {
        pickCopy(entry.closest('.fam'), entry.parentElement.dataset.k);
    }

    // Copy buttons (a DIM query, a copy's id): copy data-q, or show it to
    // copy by hand when the clipboard refuses. A text button says Copied for
    // a moment; an icon button (a copy's id) turns green.
    const copier = e.target.closest('[data-q]');
    if (copier) {
        copier.dataset.label ??= copier.textContent;
        navigator.clipboard.writeText(copier.dataset.q).then(() => {
            if (copier.dataset.label) {
                copier.textContent = 'Copied';
            }
            copier.classList.add('copied');
            setTimeout(() => {
                if (copier.dataset.label) {
                    copier.textContent = copier.dataset.label;
                }
                copier.classList.remove('copied');
            }, 1200);
        }, () => prompt('Copy this', copier.dataset.q));
    }
});
