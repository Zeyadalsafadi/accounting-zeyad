import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.dirname(fileURLToPath(import.meta.url));
const appDataRoot = process.env.APPDATA || path.join(os.homedir(), '.local', 'share');
const appHome = process.env.LICENSE_MANAGER_HOME
  ? path.resolve(process.env.LICENSE_MANAGER_HOME)
  : path.join(appDataRoot, 'dukanti-license-manager');
const dataDir = path.join(appHome, 'data');
const defaultKeyStoragePath = path.join(appHome, 'keys');

export function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
}

export function getAppHome() {
  return ensureDirectory(appHome);
}

export function getDataDir() {
  return ensureDirectory(dataDir);
}

export function getDatabasePath() {
  return path.join(getDataDir(), 'license-manager.db');
}

export function getDefaultKeyStoragePath() {
  return ensureDirectory(defaultKeyStoragePath);
}

export function resolveKeyStoragePath(configuredPath = '') {
  if (!configuredPath) {
    return getDefaultKeyStoragePath();
  }

  return ensureDirectory(path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(getAppHome(), configuredPath));
}

export function writeTextFile(filePath, contents) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

export function readTextFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export function fileExists(filePath) {
  return Boolean(filePath) && fs.existsSync(filePath);
}

export function getDistPath() {
  return path.resolve(serverRoot, '../dist');
}
