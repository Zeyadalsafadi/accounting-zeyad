import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateAndStoreKeys,
  getBootstrapData,
  getLicenseDetails,
  getManagerSettings,
  getKeysState,
  importKeys,
  issueLicense,
  listLicenses,
  revealPrivateKey,
  suggestNextLicenseId,
  updateManagerSettings,
  validateLicenseTokenLocally
} from './service.js';
import { getDistPath } from './storage.js';

const distPath = getDistPath();

export function createLicenseManagerApp() {
  const app = express();

  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.get('/api/bootstrap', (_req, res) => {
    res.json({ success: true, data: getBootstrapData() });
  });

  app.get('/api/settings', (_req, res) => {
    res.json({ success: true, data: getManagerSettings() });
  });

  app.patch('/api/settings', (req, res) => {
    res.json({ success: true, data: updateManagerSettings(req.body || {}) });
  });

  app.get('/api/keys', (_req, res) => {
    res.json({ success: true, data: getKeysState() });
  });

  app.post('/api/keys/generate', (req, res) => {
    res.json({ success: true, data: generateAndStoreKeys(req.body || {}) });
  });

  app.post('/api/keys/import', (req, res) => {
    res.json({ success: true, data: importKeys(req.body || {}) });
  });

  app.post('/api/keys/reveal-private', (_req, res) => {
    res.json({ success: true, data: revealPrivateKey() });
  });

  app.get('/api/licenses/next-id', (_req, res) => {
    res.json({ success: true, data: { licenseId: suggestNextLicenseId() } });
  });

  app.get('/api/licenses', (req, res) => {
    res.json({ success: true, data: listLicenses(req.query || {}) });
  });

  app.get('/api/licenses/:id', (req, res) => {
    res.json({ success: true, data: getLicenseDetails(req.params.id) });
  });

  app.post('/api/licenses/issue', (req, res) => {
    res.json({ success: true, data: issueLicense(req.body || {}) });
  });

  app.post('/api/licenses/validate', (req, res) => {
    res.json({ success: true, data: validateLicenseTokenLocally(req.body || {}) });
  });

  app.use((error, _req, res, _next) => {
    res.status(400).json({
      success: false,
      error: error?.message || 'Unexpected error'
    });
  });

  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

export function startLicenseManagerServer({ port = Number(process.env.LICENSE_MANAGER_PORT || 4174), host = '127.0.0.1' } = {}) {
  const app = createLicenseManagerApp();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      console.log(`License Manager running on http://${host}:${actualPort}`);
      resolve({
        app,
        server,
        host,
        port: actualPort,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => {
            if (error) {
              closeReject(error);
              return;
            }
            closeResolve();
          });
        })
      });
    });

    server.on('error', reject);
  });
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const currentPath = fileURLToPath(import.meta.url);

if (entryPath && entryPath === currentPath) {
  startLicenseManagerServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
