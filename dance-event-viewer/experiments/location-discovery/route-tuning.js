(() => {
  'use strict';

  const styleChoices = document.getElementById('styleChoices');
  if (!styleChoices) return;

  let syncingMixed = false;

  function ballroomButton() {
    return Array.from(styleChoices.querySelectorAll('[data-style]')).find((button) => /^ballroom$/i.test(button.dataset.style || button.textContent || ''));
  }

  function mixedButton() {
    return Array.from(styleChoices.querySelectorAll('[data-style]')).find((button) => /^mixed$/i.test(button.dataset.style || button.textContent || ''));
  }

  function hideBallroomChoice() {
    const button = ballroomButton();
    if (button) {
      button.hidden = true;
      button.setAttribute('aria-hidden', 'true');
      button.tabIndex = -1;
    }
  }

  function syncMixedWithBallroom() {
    if (syncingMixed) return;
    const mixed = mixedButton();
    const ballroom = ballroomButton();
    if (!mixed || !ballroom) return;

    const mixedPressed = mixed.getAttribute('aria-pressed') === 'true';
    const ballroomPressed = ballroom.getAttribute('aria-pressed') === 'true';
    if (mixedPressed === ballroomPressed) return;

    syncingMixed = true;
    ballroom.click();
    requestAnimationFrame(() => {
      syncingMixed = false;
      hideBallroomChoice();
    });
  }

  styleChoices.addEventListener('click', (event) => {
    const button = event.target.closest('[data-style]');
    if (!button || !/^mixed$/i.test(button.dataset.style || button.textContent || '')) return;
    requestAnimationFrame(() => requestAnimationFrame(syncMixedWithBallroom));
  }, true);

  const observer = new MutationObserver(() => requestAnimationFrame(hideBallroomChoice));
  observer.observe(styleChoices, { childList: true, subtree: true });

  hideBallroomChoice();
})();
