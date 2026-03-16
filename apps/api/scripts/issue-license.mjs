import fs from 'node:fs';
import path from 'node:path';
import { createLicenseToken } from '@paint-shop/shared/src/license-node.js';

const privateKeyPath = process.argv[2];
const payloadPath = process.argv[3];

if (!privateKeyPath || !payloadPath) {
  console.error('Usage: node scripts/issue-license.mjs <private-key.pem> <license-payload.json>');
  process.exit(1);
}

const privateKeyPem = fs.readFileSync(path.resolve(process.cwd(), privateKeyPath), 'utf8');
const payload = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), payloadPath), 'utf8'));
console.log(createLicenseToken({
  graceDays: 7,
  enabledModules: [],
  ...payload
}, privateKeyPem));
