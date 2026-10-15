// Single sticky month calendar for Simple mode (plan req 14), adapted from Exp1
// renderCalendar()/observeDateBlocks() plus calendar-navigation.js month arrows.
// Only dates that have a rendered group are buttons; the bar height is measured
// into --cal-h so date groups scroll in below it.
import { createFlowLine } from './flow-line.mjs?v=a3dd97bd';

const fmtMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const fmtJump = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const d = s => new Date(`${s}T12:00:00`);
const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

export function createStickyCalendar({ root, scrollHost, onJump, onRange }) {
  const month = root.querySelector('.calendar-month-label');
  const prev = root.querySelector('.calendar-prev'), next = root.querySelector('.calendar-next');
  const grid = root.querySelector('.calendar-days');
  const flow = createFlowLine(grid);
  let dates = [], shownMonth = null, active = null, tapped = null, observer = null;
  let selectedRange = null, dragStart = null, dragEnd = null, dragPointer = null, didDrag = false, suppressClick = false;

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
    for (let day = 1; day <= new Date(y, m, 0).getDate(); day++) {
      const key = iso(new Date(y, m - 1, day));
      const cell = document.createElement('button');
      cell.type = 'button'; cell.dataset.date = key;
      cell.className = 'calendar-day' + (has.has(key) ? ' has-events' : ' no-events') + (key === active ? ' is-active' : '');
      cell.textContent = String(day);
      cell.setAttribute('aria-label', `${fmtJump.format(d(key))}${has.has(key) ? ', events listed' : ', no events listed; available as a range boundary'}`);
      if (key === active) cell.setAttribute('aria-current', 'date');
      cells.push(cell);
    }
    grid.replaceChildren(...cells, flow.line);
    flow.moveTo(tapped ? grid.querySelector(`button[data-date="${tapped}"]`) : null);
    paintRange();
  }
  function paintRange() {
    const range = dragStart && dragEnd
      ? { start: dragStart < dragEnd ? dragStart : dragEnd, end: dragStart < dragEnd ? dragEnd : dragStart }
      : selectedRange;
    grid.querySelectorAll('button[data-date]').forEach(b => {
      const key = b.dataset.date;
      const inRange = range && key >= range.start && key <= range.end;
      b.classList.toggle('in-range', Boolean(inRange));
      b.classList.toggle('range-start', Boolean(range && key === range.start));
      b.classList.toggle('range-end', Boolean(range && key === range.end));
    });
  }
  function finishDrag() {
    if (dragStart && dragEnd && dragStart !== dragEnd) {
      selectedRange = { start: dragStart < dragEnd ? dragStart : dragEnd, end: dragStart < dragEnd ? dragEnd : dragStart };
      didDrag = true; suppressClick = true; paintRange(); onRange?.(selectedRange);
      setTimeout(() => { suppressClick = false; }, 0);
    }
    dragStart = dragEnd = dragPointer = null;
  }
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
  grid.addEventListener('click', e => {
    const b = e.target.closest('button[data-date]'); if (!b) return;
    if (suppressClick) { e.preventDefault(); return; }
    if (!b.classList.contains('has-events')) return;
    active = tapped = b.dataset.date; render(); onJump?.(active);
  });
  const step = dir => { const list = months(); const i = list.indexOf(shownMonth) + dir; if (list[i]) { shownMonth = list[i]; render(); } };
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));

  // Measured sticky height -> scroll margin for date groups (no hard-coded 244px).
  const sticky = root.querySelector('.calendar-sticky');
  const setH = () => scrollHost.style.setProperty('--cal-h', `${Math.ceil(sticky.getBoundingClientRect().height)}px`);
  if ('ResizeObserver' in window) new ResizeObserver(setH).observe(sticky);

  return {
    set(newDates, blocks, range = null) {
      dates = newDates; selectedRange = range;
      if (!dates.includes(tapped)) tapped = null; if (!dates.includes(active)) active = dates[0] || null;
      shownMonth = active ? active.slice(0, 7) : null; render(); setH();
      observer?.disconnect();
      // Scroll-spy keeps the month/active day in step with the list; the gliding
      // line itself follows taps only (assumption: line follows tapped selections).
      observer = new IntersectionObserver(entries => {
        const hit = entries.filter(x => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const key = hit?.target.dataset.date;
        if (!key || key === active) return;
        active = key; const mo = key.slice(0, 7);
        if (mo !== shownMonth) shownMonth = mo;
        render();
      }, { rootMargin: '-35% 0px -55% 0px' });
      blocks.forEach(b => observer.observe(b));
    },
    clear() { dates = []; active = tapped = null; selectedRange = null; shownMonth = null; observer?.disconnect(); grid.replaceChildren(flow.line); month.textContent = ''; }
  };
}
