// Map tiles must be keyless: OSM standard tiles, no CARTO / keyed providers. Run: node --test tools/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../dance-event-viewer/', import.meta.url);
const read = f => readFileSync(new URL(f, root), 'utf8');
const sha8 = f => createHash('sha1').update(readFileSync(new URL(f, root))).digest('hex').slice(0, 8);
const app = read('js/app.js');

test('map uses keyless OpenStreetMap standard tiles with OSM attribution', () => {
  assert.match(app, /const MAP_TILE_URL = "https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png";/);
  assert.match(app, /MAP_TILE_ATTRIB = '&copy; <a href="https:\/\/www\.openstreetmap\.org\/copyright">OpenStreetMap<\/a> contributors';/);
  assert.equal((app.match(/L\.tileLayer\(MAP_TILE_URL, MAP_TILE_OPTIONS\)/g) || []).length, 2, 'both maps use it');
  assert.equal((app.match(/L\.tileLayer\(/g) || []).length, 2, 'no other tile layers');
});

test('no keyed or broken tile providers anywhere in the site code', () => {
  for (const f of ['js/app.js', 'index.html', 'css/moonlit-ember-theme.css']) {
    assert.doesNotMatch(read(f), /basemaps\.cartocdn\.com|stadiamaps|thunderforest|maptiler|api\.mapbox\.com/i, f);
  }
});

test('OSM tiles are dimmed for the dark theme and cache busters match', () => {
  assert.match(read('css/moonlit-ember-theme.css'), /\.leaflet-layer\.map-tiles-osm \{ filter:brightness\(/);
  const html = read('index.html');
  assert.ok(html.includes(`js/app.js?v=${sha8('js/app.js')}`), 'app.js stamp');
  assert.ok(html.includes(`css/moonlit-ember-theme.css?v=${sha8('css/moonlit-ember-theme.css')}`), 'theme css stamp');
});
