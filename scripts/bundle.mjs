// Zips dist-fb/ into release/digdon-fb-<version>.zip with index.html at the root, as Facebook requires,
// and fails if the bundle grows past the size budget.
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const dist = join(root, 'dist-fb');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const BUDGET_BYTES = 5 * 1024 * 1024;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = {};
let raw = 0;
for (const path of walk(dist)) {
  const data = readFileSync(path);
  raw += data.length;
  files[relative(dist, path).replaceAll('\\', '/')] = [data, { level: 9 }];
}
if (!files['index.html']) throw new Error('dist-fb/index.html missing: run npm run build:fb first');
if (!files['fbapp-config.json']) throw new Error('dist-fb/fbapp-config.json missing');
const config = JSON.parse(files['fbapp-config.json'][0].toString());
if (config.instant_games?.navigation_menu_version !== 'NAV_FLOATING') {
  throw new Error('Unexpected Instant Games bundle configuration');
}
const html = files['index.html'][0].toString();
if (!html.includes('fbinstant')) throw new Error('index.html does not load the FBInstant SDK');

const zip = zipSync(files);
mkdirSync(join(root, 'release'), { recursive: true });
const out = join(root, 'release', `digdon-fb-${version}.zip`);
writeFileSync(out, zip);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`${Object.keys(files).length} files, ${kb(raw)} raw, ${kb(zip.length)} zipped -> ${relative(root, out)}`);
if (zip.length > BUDGET_BYTES) {
  console.error(`Bundle is over the ${kb(BUDGET_BYTES)} initial-download budget`);
  process.exit(1);
}
