(() => {
  'use strict';

  const REFERENCE_PIXELS_PER_SECOND = 72 / 0.7;
  const route = document.getElementById('selectedStyleRoute');
  const picker = document.querySelector('.location-picker');
  const results = document.getElementById('results');
  const resultList = document.getElementById('resultList');
  const styleChoices = document.getElementById('styleChoices');

  if (!route || !picker || !results || !resultList || !styleChoices) return;

  let currentPixels = 0;
  let targetPixels = 0;
  let trunkLength = 1;
  let lastTime = performance.now();
  let applying = false;

  function removeBallroomChoice() {
    styleChoices.querySelectorAll('[data-style]').forEach((button) => {
      if (/^ballroom$/i.test(button.dataset.style || button.textContent || '')) button.remove();
    });
  }

  function captureOriginalTarget() {
    const trunk = route.querySelector('.selected-style-trunk');
    if (!trunk) return;
    const dash = Number.parseFloat(trunk.style.strokeDasharray || '0');
    const offset = Number.parseFloat(trunk.style.strokeDashoffset || '0');
    if (!Number.isFinite(dash) || dash <= 0 || !Number.isFinite(offset)) return;
    trunkLength = dash;
    targetPixels = Math.max(0, Math.min(trunkLength, trunkLength - offset));
  }

  function makeContinuationPath(trunk) {
    const pickerRect = picker.getBoundingClientRect();
    const resultsRect = results.getBoundingClientRect();
    const listRect = resultList.getBoundingClientRect();
    const x = Number.parseFloat(trunk.getAttribute('x1') || '0');
    const startY = Math.max(0, resultsRect.top - pickerRect.top);
    const listBottom = Math.max(startY + 80, listRect.bottom - pickerRect.top + 44);
    const loopRadius = Math.min(44, Math.max(26, picker.clientWidth * 0.055));
    const loopX = Math.min(picker.clientWidth - loopRadius * 2 - 12, x + loopRadius * 1.25);
    const endY = Math.min(Math.max(listBottom, startY + 120), Math.max(startY + 120, picker.scrollHeight - loopRadius * 2 - 8));

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'selected-style-continuation');
    path.setAttribute('d', [
      `M ${x} ${startY}`,
      `L ${x} ${Math.max(startY, endY - loopRadius * 1.2)}`,
      `C ${x} ${endY + loopRadius * 0.35}, ${loopX + loopRadius * 2} ${endY + loopRadius * 0.35}, ${loopX + loopRadius * 2} ${endY - loopRadius}`,
      `C ${loopX + loopRadius * 2} ${endY - loopRadius * 2.2}, ${loopX - loopRadius * 0.35} ${endY - loopRadius * 2.2}, ${loopX - loopRadius * 0.35} ${endY - loopRadius}`,
      `C ${loopX - loopRadius * 0.35} ${endY - loopRadius * 0.1}, ${loopX + loopRadius * 0.65} ${endY + loopRadius * 0.2}, ${loopX + loopRadius * 1.05} ${endY - loopRadius * 0.45}`
    ].join(' '));
    return path;
  }

  function decorateRoute() {
    if (applying) return;
    applying = true;
    try {
      removeBallroomChoice();
      const trunk = route.querySelector('.selected-style-trunk');
      if (!trunk) return;
      captureOriginalTarget();
      trunk.style.strokeDashoffset = String(Math.max(0, trunkLength - currentPixels));
      if (!route.querySelector('.selected-style-continuation') && !results.hidden && resultList.children.length) {
        route.appendChild(makeContinuationPath(trunk));
      }
    } finally {
      applying = false;
    }
  }

  function animate(now) {
    const elapsed = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    const step = REFERENCE_PIXELS_PER_SECOND * elapsed;
    if (currentPixels < targetPixels) currentPixels = Math.min(targetPixels, currentPixels + step);
    else if (currentPixels > targetPixels) currentPixels = Math.max(targetPixels, currentPixels - step);

    const trunk = route.querySelector('.selected-style-trunk');
    if (trunk) {
      trunk.style.strokeDashoffset = String(Math.max(0, trunkLength - currentPixels));
      const continuation = route.querySelector('.selected-style-continuation');
      if (continuation) {
        const pathLength = continuation.getTotalLength();
        continuation.style.strokeDasharray = String(pathLength);
        const trunkFinished = trunkLength <= 1 || currentPixels >= trunkLength - 0.5;
        const viewportBottom = window.scrollY + window.innerHeight;
        const listBottom = resultList.getBoundingClientRect().bottom + window.scrollY;
        const continuationTarget = trunkFinished
          ? Math.max(0, Math.min(1, (viewportBottom - (listBottom - window.innerHeight * 0.35)) / Math.max(160, window.innerHeight * 0.6)))
          : 0;
        const desired = pathLength * continuationTarget;
        const shown = Number.parseFloat(continuation.dataset.shown || '0');
        const nextShown = shown < desired ? Math.min(desired, shown + step) : Math.max(desired, shown - step);
        continuation.dataset.shown = String(nextShown);
        continuation.style.strokeDashoffset = String(pathLength - nextShown);
      }
    }
    requestAnimationFrame(animate);
  }

  const observer = new MutationObserver(() => {
    if (applying) return;
    requestAnimationFrame(decorateRoute);
  });
  observer.observe(route, { childList: true });
  observer.observe(styleChoices, { childList: true, subtree: true });

  window.addEventListener('scroll', () => requestAnimationFrame(() => {
    captureOriginalTarget();
    decorateRoute();
  }), { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(decorateRoute));

  decorateRoute();
  requestAnimationFrame(animate);
})();
