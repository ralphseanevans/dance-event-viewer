// Exp2 compact card view: one small "Card size" slider above the cards.
// 0 = full cards, 1-3 = compact at 100% / 85% / 70% (simple.css maps each level
// to --scale and --cols). The choice is remembered in localStorage.
export const ZOOM_KEY = 'ev2-card-zoom';
export const ZOOM_NAMES = ['Full', '100%', '85%', '70%'];
export const DEFAULT_ZOOM = 1;
export function clampZoom(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && v !== null && v !== '' ? Math.min(ZOOM_NAMES.length - 1, Math.max(0, n)) : DEFAULT_ZOOM;
}
export function initCardZoom(groups, reduced = () => false) {
  const box = document.createElement('label'); box.className = 'card-zoom';
  box.innerHTML = `Card size <input type="range" min="0" max="${ZOOM_NAMES.length - 1}" step="1"><output></output>`;
  const input = box.querySelector('input'), out = box.querySelector('output');
  input.setAttribute('aria-label', 'Card size, slide right to zoom out and see more cards');
  const set = (v, save) => {
    v = clampZoom(v);
    input.value = String(v); out.textContent = ZOOM_NAMES[v]; input.setAttribute('aria-valuetext', ZOOM_NAMES[v]);
    groups.dataset.zoom = String(v);
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
}
