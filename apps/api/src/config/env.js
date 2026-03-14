import dotenv from 'dotenv';
import { CURRENCIES, SUPPORTED_CURRENCIES } from '@paint-shop/shared';

dotenv.config();

const baseCurrency = process.env.BASE_CURRENCY || CURRENCIES.SYP;

if (!SUPPORTED_CURRENCIES.includes(baseCurrency)) {
  throw new Error(`Invalid BASE_CURRENCY: ${baseCurrency}`);
}

export const env = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  dbPath: process.env.DB_PATH || './apps/api/data/app.db',
  baseCurrency,
  nodeEnv: process.env.NODE_ENV || 'development'
};
