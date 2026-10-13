// keepWarm only helps the functions it lists. This fails when the app starts
// calling one that is in neither WARM_TARGETS nor NOT_WARMED, or when a listed
// name is not a deployed function (a typo would be pinged forever, as a 404).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

const listOf = (name) => {
  const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`));
  if (!match) throw new Error(`${name} not found in index.js`);
  return [...match[1].matchAll(/^\s*'(\w+)'/gm)].map((m) => m[1]);
};

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
  return /\.(js|vue)$/.test(entry.name) ? [full] : [];
});

const exported = new Set([...source.matchAll(/^exports\.(\w+) = /gm)].map((m) => m[1]));
const warm = listOf('WARM_TARGETS');
const notWarmed = listOf('NOT_WARMED');

const called = new Set();
for (const dir of ['src', 'lemonade-chrome-extension', 'lemonade-firefox-extension']) {
  for (const file of walk(path.join(root, dir))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const name of exported) {
      if (new RegExp(`['\`/]${name}\\b`).test(text)) called.add(name);
    }
  }
}

const problems = [
  ...warm.filter((name) => !exported.has(name)).map((name) => `${name}: listed but not exported`),
  ...warm.filter((name, i) => warm.indexOf(name) !== i).map((name) => `${name}: listed twice`),
  ...warm.filter((name) => notWarmed.includes(name)).map((name) => `${name}: in both lists`),
  ...[...called]
    .filter((name) => !warm.includes(name) && !notWarmed.includes(name))
    .map((name) => `${name}: called by the app but never kept warm`)
];

if (called.size < 40) problems.push(`only ${called.size} called functions found: the scan is broken`);

if (problems.length) {
  console.error(`  FAIL warm targets\n    ${problems.join('\n    ')}`);
  process.exit(1);
}
console.log(`  ok   warm targets (${warm.length} warm, ${called.size} called by the app)`);
