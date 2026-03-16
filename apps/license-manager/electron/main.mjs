import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLicenseManagerServer } from '../server/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
let serverHandle = null;

async function createMainWindow() {
  serverHandle = await startLicenseManagerServer({ port: 0, host: '127.0.0.1' });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    title: 'Dukanti MyShop License Manager',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`http://127.0.0.1:${serverHandle.port}`);
}

app.whenReady().then(async () => {
  try {
    await createMainWindow();
  } catch (error) {
    dialog.showErrorBox('License Manager Startup Failed', error?.message || String(error));
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    if (serverHandle?.close) {
      await serverHandle.close();
    }
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (serverHandle?.close) {
    await serverHandle.close();
  }
});
