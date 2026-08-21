import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const targets = new Set(['src/App.jsx', 'src/styles.css']);
const appPath = path.join(root, 'src', 'App.jsx');
const cssPath = path.join(root, 'src', 'styles.css');

const alreadyApplied = () =>
  fs.readFileSync(appPath, 'utf8').includes('paymentTimeWindow') &&
  fs.readFileSync(cssPath, 'utf8').includes('paymentTimeFields');

if (alreadyApplied()) {
  console.log('COLIBRI ERP 5.1.4 patch already applied.');
  process.exit(0);
}

const partsDir = path.join(root, '.github', 'patches');
const parts = fs.readdirSync(partsDir)
  .filter((name) => /^colibri-5\.1\.4\.part\d+\.b64$/.test(name))
  .sort();
if (!parts.length) throw new Error('Missing COLIBRI ERP 5.1.4 patch parts.');
const b64 = parts.map((name) => fs.readFileSync(path.join(partsDir, name), 'utf8').trim()).join('');
const patchText = Buffer.from(b64, 'base64').toString('utf8').replace(/\r\n/g, '\n');

function applyHunks(original, hunks, file) {
  const hadFinalNewline = original.endsWith('\n');
  const lines = original.replace(/\r\n/g, '\n').split('\n');
  if (hadFinalNewline) lines.pop();
  let delta = 0;
  for (const hunk of hunks) {
    const m = hunk.header.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!m) throw new Error(`Invalid hunk header in ${file}: ${hunk.header}`);
    let index = Number(m[1]) - 1 + delta;
    const expected = [];
    const replacement = [];
    for (const line of hunk.lines) {
      if (line.startsWith('\\ No newline')) continue;
      const tag = line[0];
      const text = line.slice(1);
      if (tag === ' ' || tag === '-') expected.push(text);
      if (tag === ' ' || tag === '+') replacement.push(text);
    }
    const actual = lines.slice(index, index + expected.length);
    const exact = actual.length === expected.length && actual.every((v, i) => v === expected[i]);
    if (!exact) {
      const needle = expected.join('\n');
      const hay = lines.join('\n');
      const charPos = hay.indexOf(needle);
      if (charPos < 0) throw new Error(`Patch context not found for ${file}: ${hunk.header}`);
      index = hay.slice(0, charPos).split('\n').length - 1;
    }
    lines.splice(index, expected.length, ...replacement);
    delta += replacement.length - expected.length;
  }
  return lines.join('\n') + (hadFinalNewline ? '\n' : '');
}

const sections = patchText.split(/^diff --git /m).slice(1);
let changed = 0;
for (const section of sections) {
  const firstLineEnd = section.indexOf('\n');
  const firstLine = section.slice(0, firstLineEnd);
  const match = firstLine.match(/^a\/(.+?) b\/(.+)$/);
  if (!match) continue;
  const file = match[2];
  if (!targets.has(file)) continue;
  const body = section.slice(firstLineEnd + 1);
  const lines = body.split('\n');
  const hunks = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith('@@ ')) {
      current = { header: line, lines: [] };
      hunks.push(current);
    } else if (current && (/^[ +\\-]/.test(line))) {
      current.lines.push(line);
    }
  }
  if (!hunks.length) continue;
  const full = path.join(root, file);
  const original = fs.readFileSync(full, 'utf8');
  const updated = applyHunks(original, hunks, file);
  fs.writeFileSync(full, updated, 'utf8');
  changed++;
}

if (changed !== targets.size || !alreadyApplied()) {
  throw new Error(`COLIBRI ERP 5.1.4 patch verification failed. Files changed: ${changed}`);
}
console.log('COLIBRI ERP 5.1.4 source patch applied successfully.');
