import express from 'express';

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', service: 'paint-shop-api' } });
});

export default router;
