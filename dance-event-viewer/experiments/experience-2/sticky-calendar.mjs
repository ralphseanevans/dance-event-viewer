// Single sticky month calendar for Simple mode (plan req 14), adapted from Exp1
// renderCalendar()/observeDateBlocks() plus calendar-navigation.js month arrows.
// Only dates that have a rendered group are buttons; the bar height is measured
// into --cal-h so date groups scroll in below it.
import { createFlowLine } from './flow-line.mjs?v=a3dd97bd';

const fmtMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const fmtJump = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const d = s => new Date(`${s}T12:00:00`);
const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

export function createStickyCalendar({ root, scrollHost, onJump }) {
  const month = root.querySelector('.calendar-month-label');
  const prev = root.querySelector('.calendar-prev'), next = root.querySelector('.calendar-next');
  const grid = root.querySelector('.calendar-days');
  const flow = createFlowLine(grid);
  let dates = [], shownMonth = null, active = null, tapped = null, observer = null;

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
      const cell = document.createElement(has.has(key) ? 'button' : 'span');
      cell.className = 'calendar-day' + (has.has(key) ? ' has-events' : '') + (key === active ? ' is-active' : '');
      cell.textContent = String(day);
      if (has.has(key)) {
        cell.type = 'button'; cell.dataset.date = key;
        cell.setAttribute('aria-label', `Jump to ${fmtJump.format(d(key))}`);
        if (key === active) cell.setAttribute('aria-current', 'date');
      }
      cells.push(cell);
    }
    grid.replaceChildren(...cells, flow.line);
    flow.moveTo(tapped ? grid.querySelector(`button[data-date="${tapped}"]`) : null);
  }
  grid.addEventListener('click', e => {
    const b = e.target.closest('button[data-date]'); if (!b) return;
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
    set(newDates, blocks) {
      dates = newDates; if (!dates.includes(tapped)) tapped = null; if (!dates.includes(active)) active = dates[0] || null;
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
    clear() { dates = []; active = tapped = null; shownMonth = null; observer?.disconnect(); grid.replaceChildren(flow.line); month.textContent = ''; }
  };
}
