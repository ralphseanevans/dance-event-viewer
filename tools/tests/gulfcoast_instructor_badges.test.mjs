import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { instructorBadges, instructorInitials, INSTRUCTOR_PHOTOS } from '../../gulfcoast/simple-core.mjs';

test('known instructors map to committed photos', () => {
  const b = instructorBadges(['Nina Outlaw', ' travis  outlaw ', 'Mike Spencer', 'Rachel Bowlby']);
  assert.deepEqual(b.map(x => x.photo), ['nina-outlaw', 'travis-outlaw', 'mike-spencer', 'rachel-bowlby'].map(s => `../graphics/instructors/${s}.webp`));
  for (const slug of Object.values(INSTRUCTOR_PHOTOS)) assert.ok(fs.existsSync(new URL(`../../graphics/instructors/${slug}.webp`, import.meta.url)), slug);
});
test('others get initials, no photo', () => {
  const [a, j, s] = instructorBadges(['Ariel Beck', 'Julie "Jewlz" Hansen', 'Zhen']);
  assert.equal(a.photo, null); assert.equal(a.initials, 'AB');
  assert.equal(j.initials, 'JH'); assert.equal(s.initials, 'ZH');
  assert.equal(instructorInitials(''), '?');
});
test('empty or string input', () => {
  assert.deepEqual(instructorBadges(null), []);
  assert.equal(instructorBadges('Brad Petrie')[0].initials, 'BP');
});
test('flow renders lazy badges', () => {
  const src = fs.readFileSync(new URL('../../gulfcoast/simple-flow.mjs', import.meta.url), 'utf8');
  assert.match(src, /instructorBadges\(ev\.instructors\)/); assert.match(src, /loading = 'lazy'/);
  assert.match(fs.readFileSync(new URL('../../gulfcoast/simple.css', import.meta.url), 'utf8'), /\.ib\+\.ib\{margin-left:-12px\}/);
});
