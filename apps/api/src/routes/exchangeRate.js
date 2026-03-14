import express from 'express';
import { PERMISSIONS } from '@paint-shop/shared';
import { authRequired, requirePermission } from '../middleware/auth.js';
import { getExchangeRateConfig, refreshAutomaticExchangeRate, saveExchangeRateConfig } from '../utils/exchangeRate.js';

const router = express.Router();
router.use(authRequired);

router.get('/', (_req, res) => {
  return res.json({ success: true, data: getExchangeRateConfig() });
});

router.patch('/', requirePermission(PERMISSIONS.EXCHANGE_RATE_MANAGE), (req, res) => {
  const mode = String(req.body.mode || '').toUpperCase();
  const manualRate = Number(req.body.manualRate);

  if (!['MANUAL', 'AUTO'].includes(mode)) {
    return res.status(400).json({ success: false, error: 'وضع سعر الصرف غير صالح' });
  }

  if (mode === 'MANUAL' && !(manualRate > 0)) {
    return res.status(400).json({ success: false, error: 'سعر الصرف اليدوي يجب أن يكون أكبر من صفر' });
  }

  const now = new Date().toISOString();
  const next = mode === 'MANUAL'
    ? saveExchangeRateConfig({
      mode,
      manualRate,
      activeRate: manualRate,
      source: 'MANUAL',
      lastUpdatedAt: now,
      autoStatus: 'IDLE',
      lastError: null
    })
    : saveExchangeRateConfig({
      mode,
      source: 'AUTO',
      autoStatus: 'IDLE',
      lastError: null
    });

  return res.json({ success: true, data: next });
});

router.post('/refresh', requirePermission(PERMISSIONS.EXCHANGE_RATE_MANAGE), async (_req, res) => {
  const next = await refreshAutomaticExchangeRate();
  const success = next.autoStatus === 'SUCCESS';
  return res.status(success ? 200 : 502).json({
    success,
    data: next,
    error: success ? undefined : next.lastError || 'فشل تحديث سعر الصرف'
  });
});

export default router;
