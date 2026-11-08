// Prints the gzip size of every built JS chunk and fails when the entry or the
// lazy scene chunk is over budget. Run after `npm run build`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const ASSETS = 'dist/assets';
const BUDGETS = [
  { label: 'entry', pattern: /^index-.*\.js$/, maxKb: 60 },
  { label: 'scene (App)', pattern: /^App-.*\.js$/, maxKb: 350 },
];

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

for (const { label, pattern, maxKb } of BUDGETS) {
  const matches = files.filter((f) => pattern.test(f));
  if (matches.length === 0) {
    console.error(`FAIL ${label}: no chunk matching ${pattern}`);
    failed = true;
    continue;
  }
  for (const file of matches) {
    const size = kb(file);
    const ok = size <= maxKb;
    if (!ok) failed = true;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${size.toFixed(2)} kB / ${maxKb} kB`);
  }
}

process.exit(failed ? 1 : 0);
