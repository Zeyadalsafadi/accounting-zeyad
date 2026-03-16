import fs from 'node:fs';
import path from 'node:path';
import { generateLicenseKeyPair } from '@paint-shop/shared/src/license-node.js';

const outputDir = path.resolve(process.cwd(), process.argv[2] || 'license-keys');
fs.mkdirSync(outputDir, { recursive: true });

const { publicKey, privateKey } = generateLicenseKeyPair();

fs.writeFileSync(path.join(outputDir, 'license-public.pem'), publicKey, 'utf8');
fs.writeFileSync(path.join(outputDir, 'license-private.pem'), privateKey, 'utf8');

console.log(`License keypair generated in: ${outputDir}`);
