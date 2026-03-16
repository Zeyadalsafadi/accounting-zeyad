import db from '../db.js';

const EPSILON = 0.01;

function nearlyEqual(a, b) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= EPSILON;
}

function getAllowNegativeCash() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'ALLOW_NEGATIVE_CASH'").get();
  return String(row?.value || 'false').toLowerCase() === 'true';
}

export function runAccountingDiagnostics() {
  const customerBalanceIssues = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.currency,
      c.opening_balance,
      c.current_balance,
      COALESCE(sales.outstanding, 0) AS outstanding_sales,
      COALESCE(cols.total_collections, 0) AS total_collections
    FROM customers c
    LEFT JOIN (
      SELECT customer_id, SUM(total_original - received_original) AS outstanding
      FROM sales_invoices
      WHERE status != 'CANCELLED' AND customer_id IS NOT NULL
      GROUP BY customer_id
    ) sales ON sales.customer_id = c.id
    LEFT JOIN (
      SELECT customer_id, SUM(total_settled_syp) AS total_collections
      FROM customer_collections
      GROUP BY customer_id
    ) cols ON cols.customer_id = c.id
    WHERE c.is_active = 1
  `).all().filter((row) => {
    const expected = Number(row.opening_balance || 0) + Number(row.outstanding_sales || 0) - Number(row.total_collections || 0);
    return !nearlyEqual(expected, row.current_balance);
  }).map((row) => ({
    customerId: row.id,
    customerName: row.name,
    currency: row.currency,
    currentBalance: Number(row.current_balance || 0),
    expectedBalance: Number(row.opening_balance || 0) + Number(row.outstanding_sales || 0) - Number(row.total_collections || 0),
    openingBalance: Number(row.opening_balance || 0),
    outstandingSales: Number(row.outstanding_sales || 0),
    collections: Number(row.total_collections || 0)
  }));

  const supplierBalanceIssues = db.prepare(`
    SELECT
      s.id,
      s.name,
      s.currency,
      s.opening_balance,
      s.current_balance,
      COALESCE(pur.outstanding, 0) AS outstanding_purchases,
      COALESCE(sett.total_settlements, 0) AS total_settlements
    FROM suppliers s
    LEFT JOIN (
      SELECT supplier_id, SUM(total_original - paid_original) AS outstanding
      FROM purchase_invoices
      WHERE status != 'CANCELLED'
      GROUP BY supplier_id
    ) pur ON pur.supplier_id = s.id
    LEFT JOIN (
      SELECT supplier_id, SUM(amount) AS total_settlements
      FROM supplier_settlements
      GROUP BY supplier_id
    ) sett ON sett.supplier_id = s.id
    WHERE s.is_active = 1
  `).all().filter((row) => {
    const expected = Number(row.opening_balance || 0) + Number(row.outstanding_purchases || 0) - Number(row.total_settlements || 0);
    return !nearlyEqual(expected, row.current_balance);
  }).map((row) => ({
    supplierId: row.id,
    supplierName: row.name,
    currency: row.currency,
    currentBalance: Number(row.current_balance || 0),
    expectedBalance: Number(row.opening_balance || 0) + Number(row.outstanding_purchases || 0) - Number(row.total_settlements || 0),
    openingBalance: Number(row.opening_balance || 0),
    outstandingPurchases: Number(row.outstanding_purchases || 0),
    settlements: Number(row.total_settlements || 0)
  }));

  const salesInvoiceIssues = db.prepare(`
    SELECT
      s.id,
      s.invoice_no,
      s.invoice_date,
      s.currency,
      s.exchange_rate,
      s.subtotal_original,
      s.discount_original,
      s.total_original,
      s.received_original,
      s.paid_syp,
      s.paid_usd,
      COALESCE(items.lines_total, 0) AS lines_total
    FROM sales_invoices s
    LEFT JOIN (
      SELECT sales_invoice_id, SUM(line_total_original) AS lines_total
      FROM sales_invoice_items
      GROUP BY sales_invoice_id
    ) items ON items.sales_invoice_id = s.id
    WHERE s.status != 'CANCELLED'
  `).all().filter((row) => {
    const expectedTotal = Math.max(0, Number(row.lines_total || 0) - Number(row.discount_original || 0));
    const expectedReceived = Number(row.paid_syp || 0) + (Number(row.paid_usd || 0) * Number(row.exchange_rate || 0));
    return !nearlyEqual(expectedTotal, row.total_original) || !nearlyEqual(expectedReceived, row.received_original);
  }).map((row) => ({
    invoiceId: row.id,
    invoiceNo: row.invoice_no,
    invoiceDate: row.invoice_date,
    currentTotal: Number(row.total_original || 0),
    expectedTotal: Math.max(0, Number(row.lines_total || 0) - Number(row.discount_original || 0)),
    currentReceived: Number(row.received_original || 0),
    expectedReceived: Number(row.paid_syp || 0) + (Number(row.paid_usd || 0) * Number(row.exchange_rate || 0))
  }));

  const purchaseInvoiceIssues = db.prepare(`
    SELECT
      p.id,
      p.invoice_no,
      p.invoice_date,
      p.currency,
      p.exchange_rate,
      p.discount_original,
      p.total_original,
      p.paid_original,
      p.paid_base,
      COALESCE(items.lines_total, 0) AS lines_total
    FROM purchase_invoices p
    LEFT JOIN (
      SELECT purchase_invoice_id, SUM(line_total_original) AS lines_total
      FROM purchase_invoice_items
      GROUP BY purchase_invoice_id
    ) items ON items.purchase_invoice_id = p.id
    WHERE p.status != 'CANCELLED'
  `).all().filter((row) => {
    const expectedTotal = Math.max(0, Number(row.lines_total || 0) - Number(row.discount_original || 0));
    const expectedPaidBase = Number(row.paid_original || 0) * Number(row.exchange_rate || 0);
    return !nearlyEqual(expectedTotal, row.total_original) || !nearlyEqual(expectedPaidBase, row.paid_base);
  }).map((row) => ({
    invoiceId: row.id,
    invoiceNo: row.invoice_no,
    invoiceDate: row.invoice_date,
    currentTotal: Number(row.total_original || 0),
    expectedTotal: Math.max(0, Number(row.lines_total || 0) - Number(row.discount_original || 0)),
    currentPaidBase: Number(row.paid_base || 0),
    expectedPaidBase: Number(row.paid_original || 0) * Number(row.exchange_rate || 0)
  }));

  const expenseIssues = db.prepare(`
    SELECT id, expense_date, expense_category, currency, original_amount, exchange_rate, base_amount
    FROM expenses
    WHERE status != 'CANCELLED'
  `).all().filter((row) => !nearlyEqual(Number(row.original_amount || 0) * Number(row.exchange_rate || 0), row.base_amount))
    .map((row) => ({
      expenseId: row.id,
      expenseDate: row.expense_date,
      category: row.expense_category,
      currentBaseAmount: Number(row.base_amount || 0),
      expectedBaseAmount: Number(row.original_amount || 0) * Number(row.exchange_rate || 0),
      currency: row.currency
    }));

  const inventoryIssues = db.prepare(`
    SELECT id, name_ar, current_qty, avg_cost_base, is_active
    FROM products
  `).all().filter((row) => Number(row.current_qty || 0) < 0 || (row.is_active !== 1 && Number(row.current_qty || 0) !== 0))
    .map((row) => ({
      productId: row.id,
      productName: row.name_ar,
      currentQty: Number(row.current_qty || 0),
      avgCostBase: Number(row.avg_cost_base || 0),
      issue: Number(row.current_qty || 0) < 0 ? 'NEGATIVE_STOCK' : 'INACTIVE_WITH_STOCK'
    }));

  const cashBalanceIssues = db.prepare(`
    SELECT
      a.id,
      a.name,
      a.currency,
      a.is_active,
      COALESCE(SUM(CASE WHEN m.direction = 'IN' THEN m.original_amount ELSE -m.original_amount END), 0) AS balance
    FROM cash_accounts a
    LEFT JOIN cash_movements m ON m.cash_account_id = a.id
    GROUP BY a.id, a.name, a.currency, a.is_active
  `).all().filter((row) => (!getAllowNegativeCash() && Number(row.balance || 0) < 0) || (row.is_active !== 1 && Number(row.balance || 0) !== 0))
    .map((row) => ({
      accountId: row.id,
      accountName: row.name,
      currency: row.currency,
      balance: Number(row.balance || 0),
      issue: Number(row.balance || 0) < 0 ? 'NEGATIVE_BALANCE' : 'INACTIVE_WITH_BALANCE'
    }));

  const checks = [
    { key: 'customerBalances', label: 'Customer balances', severity: customerBalanceIssues.length > 0 ? 'high' : 'ok', count: customerBalanceIssues.length, rows: customerBalanceIssues },
    { key: 'supplierBalances', label: 'Supplier balances', severity: supplierBalanceIssues.length > 0 ? 'high' : 'ok', count: supplierBalanceIssues.length, rows: supplierBalanceIssues },
    { key: 'salesInvoices', label: 'Sales invoice math', severity: salesInvoiceIssues.length > 0 ? 'medium' : 'ok', count: salesInvoiceIssues.length, rows: salesInvoiceIssues },
    { key: 'purchaseInvoices', label: 'Purchase invoice math', severity: purchaseInvoiceIssues.length > 0 ? 'medium' : 'ok', count: purchaseInvoiceIssues.length, rows: purchaseInvoiceIssues },
    { key: 'expenses', label: 'Expense math', severity: expenseIssues.length > 0 ? 'medium' : 'ok', count: expenseIssues.length, rows: expenseIssues },
    { key: 'inventory', label: 'Inventory state', severity: inventoryIssues.some((row) => row.issue === 'NEGATIVE_STOCK') ? 'high' : (inventoryIssues.length > 0 ? 'medium' : 'ok'), count: inventoryIssues.length, rows: inventoryIssues },
    { key: 'cashAccounts', label: 'Cash accounts', severity: cashBalanceIssues.some((row) => row.issue === 'NEGATIVE_BALANCE') ? 'high' : (cashBalanceIssues.length > 0 ? 'medium' : 'ok'), count: cashBalanceIssues.length, rows: cashBalanceIssues }
  ];

  return {
    generatedAt: new Date().toISOString(),
    healthy: checks.every((check) => check.count === 0),
    issueCount: checks.reduce((sum, check) => sum + check.count, 0),
    severitySummary: {
      high: checks.filter((check) => check.severity === 'high').reduce((sum, check) => sum + check.count, 0),
      medium: checks.filter((check) => check.severity === 'medium').reduce((sum, check) => sum + check.count, 0),
      low: checks.filter((check) => check.severity === 'low').reduce((sum, check) => sum + check.count, 0)
    },
    checks
  };
}
