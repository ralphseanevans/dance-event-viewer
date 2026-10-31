import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cancellationFor } from '../event_schedule.mjs';

test('owner status shows "Officially canceled."; confirmed and likely unchanged', () => {
  assert.equal(cancellationFor({ cancel_status: 'owner' }).label, 'Officially canceled.');
  assert.equal(cancellationFor({ cancel_status: 'confirmed' }).label, 'CONFIRMED CANCELED');
  assert.equal(cancellationFor({ cancel_status: 'likely' }).label, 'LIKELY CANCELED');
});

test('missing, unknown or legacy cancel status never falls back to the owner text', () => {
  const cases = [
    { cancel_status: 'maybe' }, { cancel_status: 'Owner?' }, { canceled: true }, { cancelled: true },
    { canceled_dates: ['2026-10-14'] }, { canceled_dates: [{ date: '2026-10-14' }] },
    { canceled_dates: [{ date: '2026-10-14', cancel_status: 'bogus' }] },
  ];
  for (const ev of cases) {
    const c = cancellationFor(ev, '2026-10-14');
    assert.equal(c.status, 'likely', JSON.stringify(ev));
    assert.equal(c.label, 'LIKELY CANCELED');
  }
});

test('shared cancel-core.js and CSS: default is likely, owner text only on the owner variant', () => {
  const app = readFileSync(new URL('../../dance-event-viewer/js/cancel-core.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../dance-event-viewer/css/cancel-banner.css', import.meta.url), 'utf8');
  assert.match(app, /var DEFAULT_STATUS = "likely";/);
  assert.match(app, /owner: "Officially canceled\."/);
  assert.match(app, /confirmed: "CONFIRMED CANCELED"/);
  assert.match(app, /likely: "LIKELY CANCELED"/);
  assert.match(css, /\.is-canceled::after \{\s*content: "LIKELY CANCELED";/);
  const rules = css.split('\n').filter(l => /content: "Officially canceled\."/.test(l));
  assert.equal(rules.length, 1);
  assert.match(rules[0], /^\.cancel-banner--owner::after/);
});
