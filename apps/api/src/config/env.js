import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENCIES, SUPPORTED_CURRENCIES } from '@paint-shop/shared';

dotenv.config();
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const baseCurrency = process.env.BASE_CURRENCY || CURRENCIES.SYP;

if (!SUPPORTED_CURRENCIES.includes(baseCurrency)) {
  throw new Error(`Invalid BASE_CURRENCY: ${baseCurrency}`);
}

export const env = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  dbPath: path.isAbsolute(process.env.DB_PATH || '')
    ? process.env.DB_PATH
    : path.resolve(apiRoot, process.env.DB_PATH || 'data/app.db'),
  baseCurrency,
  nodeEnv: process.env.NODE_ENV || 'development'
};
