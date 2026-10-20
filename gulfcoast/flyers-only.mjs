// Exp2 "Flyers only" chip: a flat toggle beside the card-size slider. When on, the
// list keeps only events with a real flyer image. The choice is remembered in localStorage
// (kept here, like card-zoom.mjs, so simple-flow.mjs itself stores nothing).
export const FLYERS_ONLY_KEY = 'ev2-flyers-only';
export const parseFlyersOnly = v => v === '1';
export function initFlyersOnly(zoomBox, onChange) {
  const listTools = document.createElement('div'); listTools.className = 'list-tools';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'flyers-only'; button.textContent = 'Flyers only';
  let on = false;
  const set = (v, save) => {
    on = v; button.setAttribute('aria-pressed', String(on));
    if (save) { try { localStorage.setItem(FLYERS_ONLY_KEY, on ? '1' : '0'); } catch {} }
  };
  let saved = null; try { saved = localStorage.getItem(FLYERS_ONLY_KEY); } catch {}
  set(parseFlyersOnly(saved), false);
  button.addEventListener('click', () => { set(!on, true); onChange(on); });
  zoomBox.before(listTools); listTools.append(button, zoomBox);
  return on;
}
