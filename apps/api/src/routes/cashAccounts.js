import express from 'express';
import db from '../db.js';
import { authRequired } from '../middleware/auth.js';

const router = express.Router();
router.use(authRequired);

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT id, name, currency, is_active FROM cash_accounts WHERE is_active = 1 ORDER BY id').all();
  return res.json({ success: true, data: rows });
});

export default router;
