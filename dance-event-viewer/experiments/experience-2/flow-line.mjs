// One 2px line per control group that glides under the selected item (plan req 13).
// transform-only (translate + scaleX), 180ms, rAF-batched, ResizeObserver-aware.
// Reduced motion: the line jumps without animation (CSS handles the transition).
export function createFlowLine(group) {
  const line = document.createElement('span');
  line.className = 'flow-line';
  line.setAttribute('aria-hidden', 'true');
  if (getComputedStyle(group).position === 'static') group.style.position = 'relative';
  group.appendChild(line);
  let target = null, frame = 0, placed = false;
  const place = () => {
    frame = 0;
    if (!target || !target.isConnected || !target.getClientRects().length) { line.style.opacity = '0'; placed = false; return; }
    const g = group.getBoundingClientRect(), r = target.getBoundingClientRect();
    const x = r.left - g.left + group.scrollLeft, y = r.bottom - g.top - 2;
    if (!placed) { line.style.transition = 'none'; void line.offsetWidth; }
    line.style.transform = `translate(${x}px, ${y}px) scaleX(${Math.max(1, r.width)})`;
    line.style.opacity = '1';
    if (!placed) { void line.offsetWidth; line.style.transition = ''; placed = true; }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
  const ro = 'ResizeObserver' in window ? new ResizeObserver(schedule) : null;
  ro?.observe(group);
  window.addEventListener('resize', schedule);
  document.fonts?.ready.then(schedule);
  return {
    line,
    moveTo(el) { target = el || null; schedule(); },
    hide() { target = null; schedule(); },
    refresh: schedule
  };
}
