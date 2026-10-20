// Single sticky month calendar for Simple mode (plan req 14), adapted from Exp1
// renderCalendar()/observeDateBlocks() plus calendar-navigation.js month arrows.
// Only dates that have a rendered group are buttons; the bar height is measured
// into --cal-h so date groups scroll in below it.
import { createFlowLine } from './flow-line.mjs?v=a3dd97bd';

const fmtMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const fmtJump = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const d = s => new Date(`${s}T12:00:00`);
const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

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
      cell.setAttribute('aria-label', `${fmtJump.format(d(key))}${key === today ? ', today' : ''}${has.has(key) ? ', events listed' : ', no events listed; available as a range boundary'}`);
      if (key === today) { cell.setAttribute('aria-current', 'date'); cell.title = 'Today'; }
      cells.push(cell);
    }
    grid.replaceChildren(...cells, flow.line);
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
    dragStart = dragEnd = dragPointer = null;
  }
  // Touch/pen drags only select a range while the range panel is open; otherwise a
  // swipe on the calendar must scroll the page instead of painting red range marks
  // under the finger while the dates move away from it.
  const rangeMode = () => Boolean(root.querySelector('#calendar-range-details')?.open);
  grid.addEventListener('pointerdown', e => {
    const b = e.target.closest('button[data-date]'); if (!b) return;
    if (e.pointerType !== 'mouse' && !rangeMode()) return;
    dragStart = dragEnd = b.dataset.date; dragPointer = e.pointerId; didDrag = false; paintRange();
  });
  document.addEventListener('pointermove', e => {
    if (dragPointer !== e.pointerId || !dragStart) return;
    const b = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('#simple-calendar button[data-date]');
    if (b && b.dataset.date !== dragEnd) { dragEnd = b.dataset.date; didDrag = dragEnd !== dragStart; paintRange(); }
  });
  document.addEventListener('pointerup', e => { if (dragPointer === e.pointerId) finishDrag(); });
  document.addEventListener('pointercancel', e => { if (dragPointer === e.pointerId) { dragStart = dragEnd = dragPointer = null; paintRange(); } });
  // If the page scrolls mid-drag, the finger no longer sits on the dates it marked.
  window.addEventListener('scroll', () => { if (dragStart) { dragStart = dragEnd = dragPointer = null; paintRange(); } }, { passive: true });
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
    if (!b.classList.contains('has-events')) return;
    active = tapped = b.dataset.date; render(); onJump?.(active);
  });
  root.querySelector('#calendar-range-details')?.addEventListener('toggle', e => {
    if (!e.currentTarget.open) { pendingStart = null; paintRange(); }
  });
  const step = dir => { const list = months(); const i = list.indexOf(shownMonth) + dir; if (list[i]) { shownMonth = list[i]; render(); } };
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));

  // Measured sticky height -> scroll margin for date groups (no hard-coded 244px).
  const sticky = root.querySelector('.calendar-sticky');
  const setH = () => scrollHost.style.setProperty('--cal-h', `${Math.ceil(sticky.getBoundingClientRect().height)}px`);
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
      observer?.disconnect();
      // Scroll-spy keeps the month/active day in step with the list; the gliding
      // line itself follows taps only (assumption: line follows tapped selections).
      observer = new IntersectionObserver(entries => {
        const hit = entries.filter(x => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const key = hit?.target.dataset.date;
        if (!key || key === active || selectedRanges.length || pendingStart) return;
        active = key; const mo = key.slice(0, 7);
        if (mo !== shownMonth) shownMonth = mo;
        render();
      }, { rootMargin: '-35% 0px -55% 0px' });
      blocks.forEach(b => observer.observe(b));
    },
    clear() { dates = []; active = tapped = null; selectedRanges = []; shownMonth = null; observer?.disconnect(); grid.replaceChildren(flow.line); month.textContent = ''; }
  };
}
