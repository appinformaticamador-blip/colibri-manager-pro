import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'src', 'App.jsx');
const cssPath = path.join(root, 'src', 'styles.css');
const app = fs.readFileSync(appPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

if (app.includes('paymentTimeWindow') && css.includes('paymentTimeFields')) {
  console.log('COLIBRI ERP 5.1.4 patch already applied.');
  process.exit(0);
}

const partsDir = path.join(root, '.github', 'patches');
const parts = fs.readdirSync(partsDir)
  .filter((name) => /^colibri-5\.1\.4\.part\d+\.b64$/.test(name))
  .sort();
if (!parts.length) throw new Error('Missing COLIBRI ERP 5.1.4 patch parts.');

const b64 = parts.map((name) => fs.readFileSync(path.join(partsDir, name), 'utf8').trim()).join('');
const patch = Buffer.from(b64, 'base64');
const args = ['apply', '--whitespace=nowarn', '--include=src/App.jsx', '--include=src/styles.css', '-'];
const result = spawnSync('git', args, { cwd: root, input: patch, encoding: 'utf8' });
if (result.status !== 0) {
  const appNow = fs.readFileSync(appPath, 'utf8');
  const cssNow = fs.readFileSync(cssPath, 'utf8');
  if (appNow.includes('paymentTimeWindow') && cssNow.includes('paymentTimeFields')) {
    console.log('COLIBRI ERP 5.1.4 patch already present after apply check.');
    process.exit(0);
  }
  console.error(result.stdout || '');
  console.error(result.stderr || '');
  throw new Error('Could not apply COLIBRI ERP 5.1.4 source patch.');
}

const appFinal = fs.readFileSync(appPath, 'utf8');
const cssFinal = fs.readFileSync(cssPath, 'utf8');
if (!appFinal.includes('paymentTimeWindow') || !cssFinal.includes('paymentTimeFields')) {
  throw new Error('COLIBRI ERP 5.1.4 patch verification failed.');
}
console.log('COLIBRI ERP 5.1.4 source patch applied successfully.');
