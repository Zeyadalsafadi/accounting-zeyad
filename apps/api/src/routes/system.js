import express from 'express';
import { ALL_USER_ROLES, SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import { env } from '../config/env.js';
import { getLicenseState } from '../utils/license.js';

const router = express.Router();

function buildPublicLicenseState() {
  const license = getLicenseState();
  return {
    status: license.status,
    message: license.message,
    expiresAt: license.payload?.expiresAt || null,
    customerName: license.payload?.customerName || null,
    planCode: license.payload?.planCode || null,
    daysRemaining: license.daysRemaining,
    graceEndsAt: license.graceEndsAt,
    writeAccessAllowed: license.writeAccessAllowed
  };
}

router.get('/config', (_req, res) => {
  res.json({
    success: true,
    data: {
      baseCurrency: env.baseCurrency,
      supportedCurrencies: SUPPORTED_CURRENCIES,
      roles: ALL_USER_ROLES,
      license: buildPublicLicenseState()
    }
  });
});

export default router;
