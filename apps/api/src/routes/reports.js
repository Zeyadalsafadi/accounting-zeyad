import express from 'express';
import { PERMISSIONS } from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requirePermission } from '../middleware/auth.js';

const router = express.Router();
router.use(authRequired);
router.use(requirePermission(PERMISSIONS.REPORTS_VIEW));

function startOfMonth(date) {
  return `${date.slice(0, 8)}01`;
}

function normalizeRange(query) {
  const today = new Date().toISOString().slice(0, 10);
  const from = String(query.from || startOfMonth(today));
  const to = String(query.to || today);
  return { from, to };
}

router.get('/profit-loss', (req, res) => {
  const { from, to } = normalizeRange(req.query);

  if (from > to) {
    return res.status(400).json({ success: false, error: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' });
  }

  const revenueRow = db.prepare(`
    SELECT
      COALESCE(SUM(s.total_base), 0) AS revenue,
      COALESCE(SUM(s.received_base), 0) AS collected,
      COUNT(*) AS invoice_count,
      COUNT(DISTINCT s.customer_id) AS customer_count
    FROM sales_invoices s
    WHERE s.status = 'ACTIVE'
      AND s.invoice_date >= ?
      AND s.invoice_date <= ?
      AND s.total_base > 0
  `).get(from, to);

  const cogsRow = db.prepare(`
    SELECT COALESCE(SUM(i.line_cogs_base), 0) AS cogs
    FROM sales_invoice_items i
    JOIN sales_invoices s ON s.id = i.sales_invoice_id
    WHERE s.status = 'ACTIVE'
      AND s.invoice_date >= ?
      AND s.invoice_date <= ?
  `).get(from, to);

  const expensesRow = db.prepare(`
    SELECT
      COALESCE(SUM(base_amount), 0) AS expenses,
      COUNT(*) AS expense_count
    FROM expenses
    WHERE status = 'ACTIVE'
      AND expense_date >= ?
      AND expense_date <= ?
  `).get(from, to);

  const expenseBreakdown = db.prepare(`
    SELECT
      expense_category AS category,
      COUNT(*) AS entry_count,
      COALESCE(SUM(base_amount), 0) AS amount
    FROM expenses
    WHERE status = 'ACTIVE'
      AND expense_date >= ?
      AND expense_date <= ?
    GROUP BY expense_category
    ORDER BY amount DESC, category ASC
  `).all(from, to);

  const salesByDate = db.prepare(`
    SELECT
      s.invoice_date AS period_date,
      COUNT(*) AS invoice_count,
      COUNT(DISTINCT s.customer_id) AS customer_count,
      COALESCE(SUM(s.total_base), 0) AS revenue,
      COALESCE(SUM(item_totals.cogs), 0) AS cogs
    FROM sales_invoices s
    LEFT JOIN (
      SELECT sales_invoice_id, COALESCE(SUM(line_cogs_base), 0) AS cogs
      FROM sales_invoice_items
      GROUP BY sales_invoice_id
    ) item_totals ON item_totals.sales_invoice_id = s.id
    WHERE s.status = 'ACTIVE'
      AND s.invoice_date >= ?
      AND s.invoice_date <= ?
      AND s.total_base > 0
    GROUP BY s.invoice_date
    ORDER BY s.invoice_date ASC
  `).all(from, to);

  const expensesByDate = db.prepare(`
    SELECT
      expense_date AS period_date,
      COALESCE(SUM(base_amount), 0) AS expenses
    FROM expenses
    WHERE status = 'ACTIVE'
      AND expense_date >= ?
      AND expense_date <= ?
    GROUP BY expense_date
    ORDER BY expense_date ASC
  `).all(from, to);

  const revenue = Number(revenueRow.revenue || 0);
  const cogs = Number(cogsRow.cogs || 0);
  const grossProfit = revenue - cogs;
  const expenses = Number(expensesRow.expenses || 0);
  const netProfit = grossProfit - expenses;

  const timelineMap = new Map();

  for (const row of salesByDate) {
    timelineMap.set(row.period_date, {
      periodDate: row.period_date,
      invoiceCount: Number(row.invoice_count || 0),
      customerCount: Number(row.customer_count || 0),
      revenue: Number(row.revenue || 0),
      cogs: Number(row.cogs || 0),
      expenses: 0
    });
  }

  for (const row of expensesByDate) {
    const current = timelineMap.get(row.period_date) || {
      periodDate: row.period_date,
      invoiceCount: 0,
      customerCount: 0,
      revenue: 0,
      cogs: 0,
      expenses: 0
    };
    current.expenses = Number(row.expenses || 0);
    timelineMap.set(row.period_date, current);
  }

  const timeline = Array.from(timelineMap.values())
    .sort((a, b) => a.periodDate.localeCompare(b.periodDate))
    .map((row) => {
      const gross = row.revenue - row.cogs;
      return {
        ...row,
        grossProfit: gross,
        netProfit: gross - row.expenses
      };
    });

  return res.json({
    success: true,
    data: {
      period: { from, to },
      currency: 'SYP',
      summary: {
        revenue,
        cogs,
        grossProfit,
        expenses,
        netProfit,
        grossMarginPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
        netMarginPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
        invoiceCount: Number(revenueRow.invoice_count || 0),
        customerCount: Number(revenueRow.customer_count || 0),
        averageInvoice: Number(revenueRow.invoice_count || 0) > 0 ? revenue / Number(revenueRow.invoice_count) : 0,
        expenseCount: Number(expensesRow.expense_count || 0)
      },
      expenseBreakdown,
      timeline
    }
  });
});

export default router;
