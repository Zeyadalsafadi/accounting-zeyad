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
  const categoryId = query.categoryId ? Number(query.categoryId) : null;
  const unitName = query.unitName ? String(query.unitName).trim() : null;
  const tierCode = query.tierCode ? String(query.tierCode).trim() : null;
  return {
    from,
    to,
    categoryId: Number.isFinite(categoryId) && categoryId > 0 ? categoryId : null,
    unitName: unitName || null,
    tierCode: tierCode || null
  };
}

function previousRange(from, to) {
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  const diffDays = Math.floor((toDate - fromDate) / 86400000) + 1;
  const previousTo = new Date(fromDate);
  previousTo.setDate(previousTo.getDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setDate(previousFrom.getDate() - diffDays + 1);
  const format = (value) => value.toISOString().slice(0, 10);
  return {
    from: format(previousFrom),
    to: format(previousTo)
  };
}

function buildLineFilters(filters, itemAlias = 'i', productAlias = 'p') {
  const clauses = [];
  const params = [];
  if (filters.categoryId) {
    clauses.push(`${productAlias}.category_id = ?`);
    params.push(filters.categoryId);
  }
  if (filters.unitName) {
    clauses.push(`${itemAlias}.selected_unit_name = ?`);
    params.push(filters.unitName);
  }
  if (filters.tierCode) {
    clauses.push(`${itemAlias}.selected_price_tier_code = ?`);
    params.push(filters.tierCode);
  }
  return {
    sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '',
    params
  };
}

function summaryForRange(from, to, filters) {
  const lineFilters = buildLineFilters(filters);
  const revenueRow = db.prepare(`
    SELECT
      COALESCE(SUM(i.line_total_base), 0) AS revenue,
      COALESCE(SUM(i.line_cogs_base), 0) AS cogs,
      COUNT(DISTINCT s.id) AS invoice_count,
      COUNT(DISTINCT s.customer_id) AS customer_count
    FROM sales_invoice_items i
    JOIN sales_invoices s ON s.id = i.sales_invoice_id
    JOIN products p ON p.id = i.product_id
    WHERE s.status = 'ACTIVE'
      AND s.invoice_date >= ?
      AND s.invoice_date <= ?
      ${lineFilters.sql}
  `).get(from, to, ...lineFilters.params);

  const expensesRow = db.prepare(`
    SELECT
      COALESCE(SUM(base_amount), 0) AS expenses,
      COUNT(*) AS expense_count
    FROM expenses
    WHERE status = 'ACTIVE'
      AND expense_date >= ?
      AND expense_date <= ?
  `).get(from, to);

  const revenue = Number(revenueRow.revenue || 0);
  const cogs = Number(revenueRow.cogs || 0);
  const grossProfit = revenue - cogs;
  const expenses = Number(expensesRow.expenses || 0);
  const netProfit = grossProfit - expenses;

  return {
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
  };
}

router.get('/profit-loss', (req, res) => {
  const { from, to, categoryId, unitName, tierCode } = normalizeRange(req.query);

  if (from > to) {
    return res.status(400).json({ success: false, error: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' });
  }

  const lineFilters = { categoryId, unitName, tierCode };
  const summary = summaryForRange(from, to, lineFilters);
  const comparisonRange = previousRange(from, to);
  const previousSummary = summaryForRange(comparisonRange.from, comparisonRange.to, lineFilters);
  const currentLineFilters = buildLineFilters(lineFilters);

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
      COUNT(DISTINCT s.id) AS invoice_count,
      COUNT(DISTINCT s.customer_id) AS customer_count,
      COALESCE(SUM(i.line_total_base), 0) AS revenue,
      COALESCE(SUM(i.line_cogs_base), 0) AS cogs
    FROM sales_invoice_items i
    JOIN sales_invoices s ON s.id = i.sales_invoice_id
    JOIN products p ON p.id = i.product_id
    WHERE s.status = 'ACTIVE'
      AND s.invoice_date >= ?
      AND s.invoice_date <= ?
      ${currentLineFilters.sql}
    GROUP BY s.invoice_date
    ORDER BY s.invoice_date ASC
  `).all(from, to, ...currentLineFilters.params);

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

  const productProfitability = db.prepare(`
    SELECT
      i.product_id AS productId,
      p.name_ar AS productName,
      c.name_ar AS categoryName,
      SUM(i.qty) AS qtySold,
      COALESCE(SUM(i.line_total_base), 0) AS revenue,
      COALESCE(SUM(i.line_cogs_base), 0) AS cogs,
      COALESCE(SUM(i.line_profit_base), 0) AS profit,
      COUNT(DISTINCT i.sales_invoice_id) AS invoiceCount
    FROM sales_invoice_items i
    JOIN sales_invoices s ON s.id = i.sales_invoice_id
    JOIN products p ON p.id = i.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE s.status = 'ACTIVE'
      AND s.invoice_date >= ?
      AND s.invoice_date <= ?
      ${currentLineFilters.sql}
    GROUP BY i.product_id, p.name_ar, c.name_ar
    ORDER BY profit DESC, revenue DESC, productName ASC
    LIMIT 15
  `).all(from, to, ...currentLineFilters.params).map((row) => ({
    ...row,
    qtySold: Number(row.qtySold || 0),
    revenue: Number(row.revenue || 0),
    cogs: Number(row.cogs || 0),
    profit: Number(row.profit || 0),
    invoiceCount: Number(row.invoiceCount || 0),
    marginPct: Number(row.revenue || 0) > 0 ? (Number(row.profit || 0) / Number(row.revenue || 0)) * 100 : 0
  }));

  const customerProfitability = db.prepare(`
    SELECT
      s.customer_id AS customerId,
      COALESCE(c.name, 'Cash Customer') AS customerName,
      COUNT(DISTINCT s.id) AS invoiceCount,
      COALESCE(SUM(i.line_total_base), 0) AS revenue,
      COALESCE(SUM(i.line_cogs_base), 0) AS cogs,
      COALESCE(SUM(i.line_profit_base), 0) AS profit
    FROM sales_invoice_items i
    JOIN sales_invoices s ON s.id = i.sales_invoice_id
    LEFT JOIN customers c ON c.id = s.customer_id
    JOIN products p ON p.id = i.product_id
    WHERE s.status = 'ACTIVE'
      AND s.invoice_date >= ?
      AND s.invoice_date <= ?
      ${currentLineFilters.sql}
    GROUP BY s.customer_id, COALESCE(c.name, 'Cash Customer')
    ORDER BY profit DESC, revenue DESC, customerName ASC
    LIMIT 15
  `).all(from, to, ...currentLineFilters.params).map((row) => ({
    ...row,
    invoiceCount: Number(row.invoiceCount || 0),
    revenue: Number(row.revenue || 0),
    cogs: Number(row.cogs || 0),
    profit: Number(row.profit || 0),
    marginPct: Number(row.revenue || 0) > 0 ? (Number(row.profit || 0) / Number(row.revenue || 0)) * 100 : 0
  }));

  const invoiceProfitability = db.prepare(`
    SELECT
      s.id AS invoiceId,
      s.invoice_no AS invoiceNo,
      s.invoice_date AS invoiceDate,
      COALESCE(c.name, 'Cash Customer') AS customerName,
      COALESCE(SUM(i.line_total_base), 0) AS revenue,
      COALESCE(SUM(i.line_cogs_base), 0) AS cogs,
      COALESCE(SUM(i.line_profit_base), 0) AS profit,
      COUNT(*) AS linesCount
    FROM sales_invoice_items i
    JOIN sales_invoices s ON s.id = i.sales_invoice_id
    LEFT JOIN customers c ON c.id = s.customer_id
    JOIN products p ON p.id = i.product_id
    WHERE s.status = 'ACTIVE'
      AND s.invoice_date >= ?
      AND s.invoice_date <= ?
      ${currentLineFilters.sql}
    GROUP BY s.id, s.invoice_no, s.invoice_date, COALESCE(c.name, 'Cash Customer')
    ORDER BY profit DESC, revenue DESC, s.invoice_date ASC
    LIMIT 20
  `).all(from, to, ...currentLineFilters.params).map((row) => ({
    ...row,
    revenue: Number(row.revenue || 0),
    cogs: Number(row.cogs || 0),
    profit: Number(row.profit || 0),
    linesCount: Number(row.linesCount || 0),
    marginPct: Number(row.revenue || 0) > 0 ? (Number(row.profit || 0) / Number(row.revenue || 0)) * 100 : 0
  }));

  const topProducts = [...productProfitability].slice(0, 5);
  const bottomProducts = [...productProfitability].sort((a, b) => a.profit - b.profit || a.revenue - b.revenue).slice(0, 5);
  const topCustomers = [...customerProfitability].slice(0, 5);
  const bottomCustomers = [...customerProfitability].sort((a, b) => a.profit - b.profit || a.revenue - b.revenue).slice(0, 5);

  const salesByUnit = db.prepare(`
    SELECT
      i.selected_unit_name AS unitName,
      COUNT(*) AS linesCount,
      COALESCE(SUM(i.qty), 0) AS qtySold,
      COALESCE(SUM(i.line_total_base), 0) AS revenue,
      COALESCE(SUM(i.line_profit_base), 0) AS profit
    FROM sales_invoice_items i
    JOIN sales_invoices s ON s.id = i.sales_invoice_id
    JOIN products p ON p.id = i.product_id
    WHERE s.status = 'ACTIVE'
      AND s.invoice_date >= ?
      AND s.invoice_date <= ?
      ${currentLineFilters.sql}
    GROUP BY i.selected_unit_name
    ORDER BY revenue DESC, unitName ASC
  `).all(from, to, ...currentLineFilters.params).map((row) => ({
    ...row,
    qtySold: Number(row.qtySold || 0),
    revenue: Number(row.revenue || 0),
    profit: Number(row.profit || 0),
    linesCount: Number(row.linesCount || 0)
  }));

  const salesByPriceTier = db.prepare(`
    SELECT
      COALESCE(i.selected_price_tier_code, 'UNSPECIFIED') AS tierCode,
      COALESCE(i.selected_price_tier_name, COALESCE(i.selected_price_tier_code, 'Unspecified')) AS tierName,
      COUNT(*) AS linesCount,
      COALESCE(SUM(i.qty), 0) AS qtySold,
      COALESCE(SUM(i.line_total_base), 0) AS revenue,
      COALESCE(SUM(i.line_profit_base), 0) AS profit
    FROM sales_invoice_items i
    JOIN sales_invoices s ON s.id = i.sales_invoice_id
    JOIN products p ON p.id = i.product_id
    WHERE s.status = 'ACTIVE'
      AND s.invoice_date >= ?
      AND s.invoice_date <= ?
      ${currentLineFilters.sql}
    GROUP BY COALESCE(i.selected_price_tier_code, 'UNSPECIFIED'), COALESCE(i.selected_price_tier_name, COALESCE(i.selected_price_tier_code, 'Unspecified'))
    ORDER BY revenue DESC, tierName ASC
  `).all(from, to, ...currentLineFilters.params).map((row) => ({
    ...row,
    qtySold: Number(row.qtySold || 0),
    revenue: Number(row.revenue || 0),
    profit: Number(row.profit || 0),
    linesCount: Number(row.linesCount || 0)
  }));

  const topUnits = [...salesByUnit].sort((a, b) => b.profit - a.profit || b.revenue - a.revenue).slice(0, 5);
  const bottomUnits = [...salesByUnit].sort((a, b) => a.profit - b.profit || a.revenue - b.revenue).slice(0, 5);
  const topPriceTiers = [...salesByPriceTier].sort((a, b) => b.profit - a.profit || b.revenue - a.revenue).slice(0, 5);
  const bottomPriceTiers = [...salesByPriceTier].sort((a, b) => a.profit - b.profit || a.revenue - b.revenue).slice(0, 5);

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
      filters: { categoryId, unitName, tierCode },
      summary,
      comparison: {
        previousPeriod: comparisonRange,
        previousSummary,
        deltas: {
          revenue: summary.revenue - previousSummary.revenue,
          cogs: summary.cogs - previousSummary.cogs,
          grossProfit: summary.grossProfit - previousSummary.grossProfit,
          expenses: summary.expenses - previousSummary.expenses,
          netProfit: summary.netProfit - previousSummary.netProfit
        }
      },
      expenseBreakdown,
      timeline,
      productProfitability,
      customerProfitability,
      invoiceProfitability,
      salesByUnit,
      salesByPriceTier,
      topUnits,
      bottomUnits,
      topPriceTiers,
      bottomPriceTiers,
      topProducts,
      bottomProducts,
      topCustomers,
      bottomCustomers
    }
  });
});

export default router;
