// Exp2 compact card view: one small "Card size" slider above the cards.
// 0 = full cards, 1-6 = compact, 6/7/8/10/12/15 across on desktop (simple.css maps each level
// to --cols; this module sets --z so the panels fill the row). The choice is remembered in localStorage.
export const ZOOM_KEY = 'ev2-card-zoom';
// Level names; the label shows the live column count (e.g. "6 across").
export const ZOOM_NAMES = ['Full', 'Compact', 'Smaller', 'Small', 'Tiny', 'Tinier', 'Tiniest'];
export const DEFAULT_ZOOM = 1;
export function clampZoom(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && v !== null && v !== '' ? Math.min(ZOOM_NAMES.length - 1, Math.max(0, n)) : DEFAULT_ZOOM;
}
// Zoom that fits `cols` panels (native width `panel`) plus gaps into `width`, floored to 3 decimals.
export function fitZoom(width, cols, gap, panel = 194) {
  return Math.max(0.05, Math.floor(((width - (cols - 1) * gap) / (cols * panel)) * 1000) / 1000);
}
export function initCardZoom(groups, reduced = () => false) {
  const box = document.createElement('label'); box.className = 'card-zoom';
  box.innerHTML = `Card size <input type="range" min="0" max="${ZOOM_NAMES.length - 1}" step="1"><output></output>`;
  const input = box.querySelector('input'), out = box.querySelector('output');
  input.setAttribute('aria-label', 'Card size, slide right to zoom out and see more cards');
  const set = (v, save) => {
    v = clampZoom(v);
    input.value = String(v); out.textContent = ZOOM_NAMES[v]; input.setAttribute('aria-valuetext', ZOOM_NAMES[v]);
    groups.dataset.zoom = String(v); groups.dispatchEvent(new Event('card-zoom-change'));
    if (save) { try { localStorage.setItem(ZOOM_KEY, String(v)); } catch {} }
  };
  let saved = null; try { saved = localStorage.getItem(ZOOM_KEY); } catch {}
  set(saved, false);
  // Smooth the column change with a view transition where supported (skipped with reduced motion).
  input.addEventListener('input', () => {
    const apply = () => set(input.value, true);
    if (document.startViewTransition && !reduced()) document.startViewTransition(apply); else apply();
  });
  groups.before(box);
  // Fit --cols phone-width panels across the row: --z = row width / (cols x panel).
  const fit = () => {
    const cs = getComputedStyle(groups);
    const cols = Number(cs.getPropertyValue('--cols')) || 0, panel = parseFloat(cs.getPropertyValue('--panel-w')) || 194;
    const gap = parseFloat(cs.getPropertyValue('--gap')) || 0, width = groups.clientWidth;
    if (cols && width) groups.style.setProperty('--z', String(fitZoom(width, cols, gap, panel)));
    const label = groups.dataset.zoom === '0' ? 'Full' : cols + ' across';
    out.textContent = label; input.setAttribute('aria-valuetext', label);
  };
  new ResizeObserver(fit).observe(groups); addEventListener('resize', fit);
  groups.addEventListener('card-zoom-change', fit);
  fit();
}
