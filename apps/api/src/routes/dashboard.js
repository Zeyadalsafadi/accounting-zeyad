import express from 'express';
import db from '../db.js';
import { authRequired } from '../middleware/auth.js';

const router = express.Router();
router.use(authRequired);

router.get('/summary', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const salesBase = db.prepare(`
    SELECT COALESCE(SUM(total_base), 0) AS v
    FROM sales_invoices
    WHERE status = 'ACTIVE' AND invoice_date = ?
  `).get(today).v;

  const purchasesBase = db.prepare(`
    SELECT COALESCE(SUM(total_base), 0) AS v
    FROM purchase_invoices
    WHERE status = 'ACTIVE' AND invoice_date = ?
  `).get(today).v;

  const expensesBase = db.prepare(`
    SELECT COALESCE(SUM(base_amount), 0) AS v
    FROM expenses
    WHERE status = 'ACTIVE' AND expense_date = ?
  `).get(today).v;

  const cogsBase = db.prepare(`
    SELECT COALESCE(SUM(i.line_cogs_base), 0) AS v
    FROM sales_invoice_items i
    JOIN sales_invoices s ON s.id = i.sales_invoice_id
    WHERE s.status = 'ACTIVE' AND s.invoice_date = ?
  `).get(today).v;

  const grossProfit = salesBase - cogsBase;
  const netProfit = grossProfit - expensesBase;

  const cashBalances = db.prepare(`
    SELECT a.id, a.name, a.currency,
      COALESCE(SUM(CASE WHEN m.direction='IN' THEN m.original_amount ELSE -m.original_amount END),0) AS balance
    FROM cash_accounts a
    LEFT JOIN cash_movements m ON m.cash_account_id = a.id
    GROUP BY a.id, a.name, a.currency
    ORDER BY a.id
  `).all();

  const lowStock = db.prepare(`
    SELECT id, name_ar, sku, current_qty, min_stock_level
    FROM products
    WHERE is_active = 1 AND current_qty <= min_stock_level
    ORDER BY (min_stock_level - current_qty) DESC, id DESC
    LIMIT 20
  `).all();

  const latestActivities = db.prepare(`
    SELECT event_time, entity_name, entity_id, action, reason, metadata_json
    FROM audit_logs
    ORDER BY id DESC
    LIMIT 15
  `).all();

  return res.json({
    success: true,
    data: {
      today,
      totals: {
        salesBase,
        purchasesBase,
        expensesBase,
        cogsBase,
        grossProfit,
        netProfit
      },
      cashBalances,
      lowStock,
      latestActivities
    }
  });
});

export default router;
