import express from 'express';
import { ALL_USER_ROLES, SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import { env } from '../config/env.js';

const router = express.Router();

router.get('/config', (_req, res) => {
  res.json({
    success: true,
    data: {
      baseCurrency: env.baseCurrency,
      supportedCurrencies: SUPPORTED_CURRENCIES,
      roles: ALL_USER_ROLES
    }
  });
});

export default router;
