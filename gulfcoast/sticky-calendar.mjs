// Single sticky month calendar for Simple mode (plan req 14), adapted from Exp1
// renderCalendar()/observeDateBlocks() plus calendar-navigation.js month arrows.
// Only dates that have a rendered group are buttons; the bar height is measured
// into --cal-h so date groups scroll in below it.
import { createFlowLine } from './flow-line.mjs?v=a3dd97bd';

const fmtMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const fmtJump = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const d = s => new Date(`${s}T12:00:00`);
const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

// Scroll-spy band as an IntersectionObserver rootMargin: 35%-45% of the viewport, pushed
// down to start 2px below `land` (where a tapped day's heading lands) when that is lower,
// so the day above the tapped one (which ends exactly at `land`) is never caught.
export function spyRootMargin(vh, land) {
  const top = Math.round(Math.max(vh * .35, land + 2)), bottom = Math.round(Math.max(0, Math.min(vh * .55, vh - top - 1)));
  return `-${top}px 0px -${bottom}px 0px`;
}

export function createStickyCalendar({ root, scrollHost, onJump, onRange, onRemoveDay }) {
  const month = root.querySelector('.calendar-month-label');
  const prev = root.querySelector('.calendar-prev'), next = root.querySelector('.calendar-next');
  const grid = root.querySelector('.calendar-days');
  const flow = createFlowLine(grid);
  let eventDate = null;
  let dates = [], shownMonth = null, active = null, tapped = null, observer = null;
  let selectedRanges = [], dragStart = null, dragEnd = null, dragPointer = null, didDrag = false, suppressClick = false, pendingStart = null;

  const months = () => [...new Set(dates.map(s => s.slice(0, 7)))];
  function render() {
    if (!shownMonth) return;
    const [y, m] = shownMonth.split('-').map(Number);
    month.textContent = fmtMonth.format(new Date(y, m - 1, 1));
    const list = months(), i = list.indexOf(shownMonth);
    prev.disabled = i <= 0; next.disabled = i < 0 || i >= list.length - 1;
    const cells = [];
    for (let b = 0; b < new Date(y, m - 1, 1).getDay(); b++) { const s = document.createElement('span'); s.className = 'calendar-blank'; s.setAttribute('aria-hidden', 'true'); cells.push(s); }
    const has = new Set(dates);
    const today = iso(new Date());
    for (let day = 1; day <= new Date(y, m, 0).getDate(); day++) {
      const key = iso(new Date(y, m - 1, day));
      const cell = document.createElement('button');
      cell.type = 'button'; cell.dataset.date = key;
      cell.className = 'calendar-day' + (has.has(key) ? ' has-events' : ' no-events') + (key === active ? ' is-active' : '') + (key === today ? ' is-today' : '');
      cell.textContent = String(day);
      cell.setAttribute('aria-label', `${fmtJump.format(d(key))}${key === today ? ', today' : ''}${has.has(key) ? ', events listed' : ', no events listed; jumps to the next day with events'}`);
      if (key === today) { cell.setAttribute('aria-current', 'date'); cell.title = 'Today'; }
      cells.push(cell);
    }
    grid.replaceChildren(...cells, flow.line);
    // Phones show the grid as a short scroll box; keep the active/event row in view.
    if (grid.scrollHeight > grid.clientHeight) { const f = grid.querySelector('.is-active') || (eventDate && grid.querySelector(`button[data-date="${eventDate}"]`)); grid.scrollTop = f ? f.offsetTop : 0; }
    flow.moveTo(tapped ? grid.querySelector(`button[data-date="${tapped}"]`) : null);
    paintRange();
  }
  function paintRange() {
    const preview = dragStart && dragEnd
      ? { start: dragStart < dragEnd ? dragStart : dragEnd, end: dragStart < dragEnd ? dragEnd : dragStart }
      : null;
    grid.querySelectorAll('button[data-date]').forEach(b => {
      const key = b.dataset.date;
      const inSelected = selectedRanges.some(r => key >= r.start && key <= r.end);
      const inPreview = preview && key >= preview.start && key <= preview.end;
      b.classList.toggle('event-date', key === eventDate);
      b.setAttribute('aria-pressed', String(inSelected));
      b.classList.toggle('in-range', Boolean(inSelected || inPreview));
      b.classList.toggle('range-start', Boolean(selectedRanges.some(r => key === r.start) || (preview && key === preview.start)));
      b.classList.toggle('range-end', Boolean(selectedRanges.some(r => key === r.end) || (preview && key === preview.end)));
      b.classList.toggle('range-pending', key === pendingStart);
    });
  }
  function finishDrag() {
    if (dragStart && dragEnd && dragStart !== dragEnd) {
      const range = { start: dragStart < dragEnd ? dragStart : dragEnd, end: dragStart < dragEnd ? dragEnd : dragStart };
      selectedRanges = [...selectedRanges, range];
      pendingStart = null; didDrag = true; suppressClick = true; paintRange(); onRange?.(range);
      setTimeout(() => { suppressClick = false; }, 250);
    }
    dragStart = dragEnd = dragPointer = null; paintRange();
  }
  // Mouse, touch and pen: dragging across dates selects a range; each new drag adds
  // another range. The grid has touch-action:none (simple.css), so a finger swipe on
  // the calendar selects dates instead of scrolling; swipes elsewhere still scroll.
  grid.addEventListener('pointerdown', e => {
    const b = e.target.closest('button[data-date]'); if (!b) return;
    dragStart = dragEnd = b.dataset.date; dragPointer = e.pointerId; didDrag = false; paintRange();
  });
  document.addEventListener('pointermove', e => {
    if (dragPointer !== e.pointerId || !dragStart) return;
    const b = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('#simple-calendar button[data-date]');
    if (b && b.dataset.date !== dragEnd) { dragEnd = b.dataset.date; didDrag = dragEnd !== dragStart; paintRange(); }
  });
  document.addEventListener('pointerup', e => { if (dragPointer === e.pointerId) finishDrag(); });
  document.addEventListener('pointercancel', e => { if (dragPointer === e.pointerId) { dragStart = dragEnd = dragPointer = null; paintRange(); } });
  // No scroll-cancel: touch-action:none means a drag on the grid can't scroll the page, and a
  // page that is still gliding (wheel/trackpad inertia, list re-render after a range) must not
  // silently drop the next drag. pointermove re-reads the date under the pointer anyway.
  grid.addEventListener('click', e => {
    const b = e.target.closest('button[data-date]'); if (!b) return;
    if (suppressClick) { e.preventDefault(); return; }
    const key = b.dataset.date;
    if (!pendingStart && selectedRanges.some(r => key >= r.start && key <= r.end)) {
      onRemoveDay?.(key); return;
    }
    const rangeDetails = root.querySelector('#calendar-range-details');
    if (rangeDetails?.open) {
      if (!pendingStart) {
        pendingStart = b.dataset.date;
        const status = root.querySelector('#calendar-range-status');
        if (status) status.textContent = 'Start selected: ' + fmtJump.format(d(pendingStart)) + '. Change month if needed, then choose an end date.';
        paintRange();
        return;
      }
      const end = b.dataset.date;
      const range = { start: pendingStart < end ? pendingStart : end, end: pendingStart < end ? end : pendingStart };
      pendingStart = null;
      selectedRanges = [...selectedRanges, range];
      paintRange();
      onRange?.(range);
      return;
    }
    // Any day jumps the list: a day with no events lands on the next day that has events.
    const day = [...dates].sort().find(x => x >= key); if (!day) return;
    active = tapped = day; shownMonth = day.slice(0, 7); holdSpy(); render(); onJump?.(active); holdSpy();
  });
  root.querySelector('#calendar-range-details')?.addEventListener('toggle', e => {
    if (!e.currentTarget.open) { pendingStart = null; paintRange(); }
  });
  const step = dir => { const list = months(); const i = list.indexOf(shownMonth) + dir; if (list[i]) { shownMonth = list[i]; render(); } };
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));

  // Scroll-spy keeps the month/active day in step with the list; the gliding
  // line itself follows taps only (assumption: line follows tapped selections).
  // Band = 35%-45% of the viewport, but never above the line a tapped day scrolls to
  // (html scroll-padding-top + the block's scroll-margin-top). On phones the pinned
  // calendar puts that line below 45%, so a fixed band caught the day above the tapped one.
  let spyBlocks = [], spyMargin = '', bandTop = 0, bandBottom = 0, spyHeld = false, holdTimer = 0, jumpY = null;
  // Picks the day from live positions, not from the observer's entries: a freshly built
  // observer (the tap revealed a new page) can deliver a stale entry measured before the
  // scroll, and with a thin band sub-pixel tops decided between it and the real one.
  function pick() {
    if (spyHeld || selectedRanges.length || pendingStart) return;
    // Until the page moves again, the tapped day stays active even where it can't reach the
    // band (last days of the list) or a new observer sends its first report.
    if (jumpY !== null) { if (Math.abs((window.scrollY || 0) - jumpY) < 1) return; jumpY = null; }
    let hit = null, hitTop = Infinity;
    for (const b of spyBlocks) {
      const r = b.getBoundingClientRect();
      if (r.bottom > bandTop && r.top < bandBottom && r.top < hitTop) { hit = b; hitTop = r.top; }
    }
    const key = hit?.dataset.date;
    if (!key || key === active) return;
    active = key; const mo = key.slice(0, 7);
    if (mo !== shownMonth) shownMonth = mo;
    render();
  }
  // A tap/jump sets the active day itself; the spy stays quiet until that scroll ends
  // (scrollend, or 200ms with no scroll events where scrollend is missing / nothing scrolls).
  // Hand scrolling afterwards is tracked as before.
  function holdSpy() { spyHeld = true; clearTimeout(holdTimer); holdTimer = setTimeout(releaseSpy, 200); }
  function releaseSpy() { if (!spyHeld) return; spyHeld = false; clearTimeout(holdTimer); jumpY = window.scrollY || 0; }
  window.addEventListener('scroll', () => { if (spyHeld) holdSpy(); }, { passive: true });
  window.addEventListener('scrollend', releaseSpy);
  function spy() {
    const vh = window.innerHeight || 0, b0 = spyBlocks[0];
    const land = b0 ? (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) + (parseFloat(getComputedStyle(b0).scrollMarginTop) || 0) : 0;
    spyMargin = spyRootMargin(vh, land);
    const [t, , bm] = spyMargin.match(/\d+/g).map(Number); bandTop = t; bandBottom = vh - bm;
    observer?.disconnect();
    observer = new IntersectionObserver(pick, { rootMargin: spyMargin });
    spyBlocks.forEach(b => observer.observe(b));
  }

  // Measured sticky height -> scroll margin for date groups (no hard-coded 244px).
  const sticky = root.querySelector('.calendar-sticky');
  let calH = '';
  const setH = () => {
    const h = `${Math.ceil(sticky.getBoundingClientRect().height)}px`;
    if (h === calH) return;
    calH = h; scrollHost.style.setProperty('--cal-h', h);
    if (spyBlocks.length) spy(); // landing line moved with the calendar height
  };
  if ('ResizeObserver' in window) new ResizeObserver(setH).observe(sticky);

  return {
    highlightEvent(day) {
      eventDate = day; shownMonth = day.slice(0, 7); render(); setH();
    },
    set(newDates, blocks, ranges = []) {
      dates = newDates; selectedRanges = Array.isArray(ranges) ? ranges : [];
      if (!dates.includes(tapped)) tapped = null; if (!dates.includes(active)) active = dates[0] || null;
      // Empty results keep the current/last month so render() redraws it with no marks.
      if (dates.length && (!shownMonth || !months().includes(shownMonth))) shownMonth = active.slice(0, 7);
      render(); setH();
      spyBlocks = blocks; spy();
    },
    clear() { dates = []; spyBlocks = []; active = tapped = null; selectedRanges = []; shownMonth = null; observer?.disconnect(); grid.replaceChildren(flow.line); month.textContent = ''; }
  };
}
