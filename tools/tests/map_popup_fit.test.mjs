// Map view marker popups must fit inside the map (2026-10-27 fix). A popup taller than the map
// made Leaflet's autoPan pin the popup's top to the map's top, which pushed the marker and the
// card's title, details and links far off-screen (map "jumped" to central AL/MS).
// Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../dance-event-viewer/', import.meta.url);
const read = f => readFileSync(new URL(f, root), 'utf8');
const app = read('js/app.js');

// Pull the real mapPopupOptions() out of app.js (a classic script, not a module).
const src = app.match(/function mapPopupOptions\([\s\S]*?\n\}\n/);
assert.ok(src, 'mapPopupOptions() exists in app.js');
const mapPopupOptions = vm.runInNewContext(`(${src[0]})`);

// Leaflet 1.9 popup chrome around the content box: wrapper padding/border (2) + content
// margins (20) + tip (20) + bottom margin (20, counted by _adjustPan) = ~62px.
const CHROME_H = 62, CHROME_W = 22, ZOOM_CONTROL_W = 44;

for (const [label, w, h] of [['desktop 1280', 1000, 480], ['phone 390', 358, 360], ['phone 320', 288, 360]]) {
  test(`${label}: a full-height popup plus autoPan padding fits in a ${w}x${h} map`, () => {
    const o = mapPopupOptions(w, h);
    const tallest = o.maxHeight + CHROME_H + o.autoPanPaddingTopLeft[1] + o.autoPanPaddingBottomRight[1];
    assert.ok(tallest <= h, `popup ${tallest}px must fit in ${h}px so autoPan never shoves the marker off the map`);
    const widest = o.maxWidth + CHROME_W + o.autoPanPaddingTopLeft[0] + o.autoPanPaddingBottomRight[0];
    assert.ok(widest <= w, `popup ${widest}px wide must fit beside the zoom control in ${w}px`);
    assert.ok(o.autoPanPaddingTopLeft[0] >= ZOOM_CONTROL_W, 'left autoPan padding clears the +/- control');
    assert.ok(o.maxHeight >= 140 && o.maxWidth >= 160, 'popup stays usable');
  });
}

test('map markers bind their popups with the map-sized options', () => {
  assert.match(app, /const popupFit = mapPopupOptions\(canvas\.clientWidth, canvas\.clientHeight\);/);
  assert.match(app, /marker\.bindPopup\(popupEl, popupFit\);/);
});

test('popup card uses a short fixed-height flyer and no Leaflet <p> margins', () => {
  const css = read('css/styles.css');
  assert.match(css, /\.map-pin-popup \.card-art\.has-flyer \.card-art-trigger \{ aspect-ratio: auto; height: \d+px; \}/);
  assert.match(css, /\.map-pin-popup \.card-art \{ margin: 0 0 8px;/);
  assert.match(css, /\.map-pin-popup \.card p \{ margin: 0; \}/);
});
