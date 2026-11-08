// Prints the gzip size of every built JS chunk and fails when the entry or the
// lazy scene chunks (summed) are over budget. Run after `npm run build`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const ASSETS = 'dist/assets';
const ENTRY = /^index-.*\.js$/;
const ENTRY_MAX_KB = 60;
// Every lazy chunk together, so a split of three/R3F/drei cannot dodge the budget.
const SCENE_MAX_KB = 350;

let files;
try {
  files = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
} catch {
  console.error(`${ASSETS} not found: run \`npm run build\` first.`);
  process.exit(1);
}

const kb = (file) => gzipSync(readFileSync(join(ASSETS, file)), { level: 9 }).length / 1000;
let failed = false;

for (const file of files.sort()) console.log(`${file.padEnd(32)} ${kb(file).toFixed(2)} kB gzip`);

const entry = files.filter((f) => ENTRY.test(f));
const scene = files.filter((f) => !ENTRY.test(f));
if (entry.length === 0) {
  console.error('FAIL entry: no chunk matching index-*.js');
  failed = true;
}
const check = (label, size, maxKb) => {
  const ok = size <= maxKb;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${size.toFixed(2)} kB / ${maxKb} kB`);
};
for (const file of entry) check('entry', kb(file), ENTRY_MAX_KB);
check(
  'scene (all lazy chunks)',
  scene.reduce((sum, f) => sum + kb(f), 0),
  SCENE_MAX_KB,
);

process.exit(failed ? 1 : 0);
