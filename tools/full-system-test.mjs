import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';

const rootDir = path.resolve(process.cwd());
const dbDir = path.join(rootDir, 'apps', 'api', 'data');
const dbPath = path.join(dbDir, 'app.db');
const reportPath = path.join(dbDir, 'full-system-test-report.json');
const port = 4010;
const baseUrl = `http://127.0.0.1:${port}/api/v1`;

process.env.PORT = String(port);
process.env.DB_PATH = dbPath;
process.env.NODE_ENV = 'development';
process.env.LICENSE_ENFORCEMENT = 'off';

const report = {
  startedAt: new Date().toISOString(),
  baseUrl,
  dbPath,
  steps: [],
  created: {},
  summaries: {},
  findings: [],
  failures: []
};

function logStep(name, status, details = {}) {
  report.steps.push({
    at: new Date().toISOString(),
    name,
    status,
    details
  });
}

function addFinding(title, details = {}) {
  report.findings.push({
    at: new Date().toISOString(),
    title,
    ...details
  });
}

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function round2(value) {
  return Number(Number(value ?? 0).toFixed(2));
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(method, route, { token, body, expected = [200] } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!expected.includes(response.status)) {
    const error = new Error(`${method} ${route} failed with ${response.status}`);
    error.response = data;
    throw error;
  }

  return { status: response.status, body: data };
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/system/config`);
      if (response.ok) return;
    } catch {
      // wait and retry
    }
    await sleep(200);
  }

  throw new Error('API server did not start in time');
}

function queryDb(sql, ...params) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

function getOne(sql, ...params) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare(sql).get(...params);
  } finally {
    db.close();
  }
}

async function main() {
  removeIfExists(dbPath);
  removeIfExists(`${dbPath}-wal`);
  removeIfExists(`${dbPath}-shm`);
  logStep('reset-database-files', 'passed');

  await import('../apps/api/src/initDb.js');
  logStep('init-db', 'passed');

  await import('../apps/api/src/server.js');
  await waitForServer();
  logStep('start-api-server', 'passed', { port });

  const systemConfig = await request('GET', '/system/config', { expected: [200] });
  assert(systemConfig.body?.success === true, 'System config endpoint did not return success');
  logStep('system-config', 'passed', { baseCurrency: systemConfig.body.data.baseCurrency });

  const login = await request('POST', '/auth/login', {
    body: { username: 'admin', password: 'admin123' },
    expected: [200]
  });
  const token = login.body.data.token;
  assert(token, 'Admin token was not returned');
  logStep('admin-login', 'passed', { user: login.body.data.user?.username });

  const generalSettings = await request('GET', '/settings/general', { token });
  const rolesCatalog = await request('GET', '/settings/roles', { token });
  const diagnostics = await request('GET', '/settings/diagnostics', { token });
  logStep('admin-read-checks', 'passed', {
    settingsKeys: Object.keys(generalSettings.body.data.values || {}).length,
    roles: (rolesCatalog.body.data.roles || []).length,
    diagnosticsChecks: Array.isArray(diagnostics.body.data) ? diagnostics.body.data.length : Object.keys(diagnostics.body.data || {}).length
  });

  await request('PATCH', '/exchange-rate', {
    token,
    body: { mode: 'MANUAL', manualRate: 15000 },
    expected: [200]
  });
  const autoRate = await request('PATCH', '/exchange-rate', {
    token,
    body: { mode: 'AUTO' },
    expected: [200]
  });
  await request('PATCH', '/exchange-rate', {
    token,
    body: { mode: 'MANUAL', manualRate: 15000 },
    expected: [200]
  });
  logStep('exchange-rate-modes', 'passed', {
    autoMode: autoRate.body.data.mode,
    activeRateAfterReset: 15000
  });

  const categoryPayloads = [
    { name: 'دهانات داخلية', nameEn: 'Interior Paints', notes: 'اختبار الفئة الداخلية' },
    { name: 'أدوات الدهان', nameEn: 'Painting Tools', notes: 'اختبار الأدوات' },
    { name: 'مواد مساعدة', nameEn: 'Support Materials', notes: 'اختبار المواد المساعدة' },
    { name: 'تصنيف اختبار للتعطيل', nameEn: 'Disable Test Category', notes: 'فئة لاختبار التعطيل' }
  ];
  const categoryIds = {};
  for (const payload of categoryPayloads) {
    const response = await request('POST', '/categories', { token, body: payload, expected: [201] });
    categoryIds[payload.name] = response.body.data.id;
  }
  await request('PATCH', `/categories/${categoryIds['تصنيف اختبار للتعطيل']}/disable`, { token, expected: [200] });
  await request('PATCH', `/categories/${categoryIds['تصنيف اختبار للتعطيل']}/reactivate`, { token, expected: [200] });
  report.created.categories = categoryIds;
  logStep('categories', 'passed', { count: Object.keys(categoryIds).length });

  const sypAccount = await request('POST', '/cash-management/accounts', {
    token,
    body: { name: 'صندوق الليرة السورية', currency: 'SYP', isActive: true },
    expected: [201]
  });
  const usdAccount = await request('POST', '/cash-management/accounts', {
    token,
    body: { name: 'صندوق الدولار', currency: 'USD', isActive: true },
    expected: [201]
  });
  const sypAccountId = sypAccount.body.data.id;
  const usdAccountId = usdAccount.body.data.id;
  report.created.cashAccounts = { sypAccountId, usdAccountId };

  await request('POST', '/cash-management/opening-balance', {
    token,
    body: { accountId: sypAccountId, amount: 5000000, date: '2026-03-10', notes: 'رصيد افتتاحي ليرة' },
    expected: [201]
  });
  await request('POST', '/cash-management/opening-balance', {
    token,
    body: { accountId: usdAccountId, amount: 2000, date: '2026-03-10', notes: 'رصيد افتتاحي دولار' },
    expected: [201]
  });
  await request('POST', '/cash-management/deposit', {
    token,
    body: { accountId: sypAccountId, amount: 200000, date: '2026-03-10', notes: 'إيداع اختبار' },
    expected: [201]
  });
  await request('POST', '/cash-management/withdraw', {
    token,
    body: { accountId: usdAccountId, amount: 50, date: '2026-03-10', notes: 'سحب اختبار' },
    expected: [201]
  });
  logStep('cash-opening-and-manual-movements', 'passed');

  const supplierPayloads = [
    { name: 'مؤسسة الندى التجارية', phone: '0933000001', address: 'دمشق', openingBalance: 250000, currency: 'SYP', notes: 'مورد محلي' },
    { name: 'Atlas Coatings Import', phone: '0933000002', address: 'حلب', openingBalance: 100, currency: 'USD', notes: 'مورد خارجي' }
  ];
  const supplierIds = {};
  for (const payload of supplierPayloads) {
    const response = await request('POST', '/suppliers', { token, body: payload, expected: [201] });
    supplierIds[payload.name] = response.body.data.id;
  }
  report.created.suppliers = supplierIds;

  const customerPayloads = [
    { name: 'مكتب الأفق الهندسي', phone: '0944000001', address: 'دمشق', openingBalance: 120000, currency: 'SYP', notes: 'عميل رئيسي' },
    { name: 'الدار للمقاولات', phone: '0944000002', address: 'حلب', openingBalance: 0, currency: 'SYP', notes: 'عميل نقدي ومشاريع' },
    { name: 'ورشة البيان', phone: '0944000003', address: 'حمص', openingBalance: 0, currency: 'SYP', notes: 'عميل آجل' },
    { name: 'العميل الدولاري', phone: '0944000004', address: 'اللاذقية', openingBalance: 0, currency: 'USD', notes: 'عميل لاختبار البيع بالدولار' }
  ];
  const customerIds = {};
  for (const payload of customerPayloads) {
    const response = await request('POST', '/customers', { token, body: payload, expected: [201] });
    customerIds[payload.name] = response.body.data.id;
  }
  report.created.customers = customerIds;
  logStep('customers-and-suppliers', 'passed', {
    suppliers: Object.keys(supplierIds).length,
    customers: Object.keys(customerIds).length
  });

  const userCreate = await request('POST', '/users', {
    token,
    body: {
      username: 'audituser',
      password: 'audit123',
      fullName: 'مستخدم اختبار تشغيلي',
      accessRole: 'ADMIN',
      phone: '0999999999',
      email: 'audit@example.com',
      notes: 'تم إنشاؤه أثناء الاختبار الشامل',
      isActive: true
    },
    expected: [201]
  });
  const usersList = await request('GET', '/users', { token });
  report.created.userId = userCreate.body.data.id;
  logStep('user-management', 'passed', { usersCount: (usersList.body.data || []).length });

  const productPayloads = [
    {
      key: 'paint',
      name: 'دهان داخلي اقتصادي',
      nameEn: 'Economy Interior Paint',
      categoryId: categoryIds['دهانات داخلية'],
      sku: 'PRD-INT-001',
      barcode: '869111000001',
      unit: 'bucket',
      purchasePrice: 80000,
      sellingPrice: 115000,
      defaultCurrency: 'SYP',
      currentStock: 50,
      minStockAlert: 10,
      averageCost: 80000,
      notes: 'منتج رئيسي للبيع',
      units: [{ unitName: 'bucket', conversionFactor: 1, isBase: true, sortOrder: 0 }],
      priceTiers: [
        { tierCode: 'WHOLESALE', tierName: 'جملة', unitName: 'bucket', priceSyp: 110000 },
        { tierCode: 'RETAIL', tierName: 'مفرق', unitName: 'bucket', priceSyp: 115000 }
      ],
      customerPrices: [
        {
          customerId: customerIds['مكتب الأفق الهندسي'],
          unitName: 'bucket',
          priceSyp: 107000,
          notes: 'سعر خاص للعميل الرئيسي'
        }
      ]
    },
    {
      key: 'brush',
      name: 'فرشاة احترافية',
      nameEn: 'Professional Brush',
      categoryId: categoryIds['أدوات الدهان'],
      sku: 'PRD-TLS-010',
      barcode: '869111000010',
      unit: 'piece',
      purchasePrice: 25000,
      sellingPrice: 40000,
      defaultCurrency: 'SYP',
      currentStock: 100,
      minStockAlert: 20,
      averageCost: 25000,
      notes: 'أداة عالية الدوران',
      units: [{ unitName: 'piece', conversionFactor: 1, isBase: true, sortOrder: 0 }],
      priceTiers: [
        { tierCode: 'WHOLESALE', tierName: 'جملة', unitName: 'piece', priceSyp: 38000 },
        { tierCode: 'RETAIL', tierName: 'مفرق', unitName: 'piece', priceSyp: 40000 }
      ],
      customerPrices: []
    },
    {
      key: 'imported',
      name: 'معجون خارجي مستورد',
      nameEn: 'Imported Exterior Filler',
      categoryId: categoryIds['مواد مساعدة'],
      sku: 'PRD-EXT-020',
      barcode: '869111000020',
      unit: 'bag',
      purchasePrice: 12,
      sellingPrice: 18,
      defaultCurrency: 'USD',
      currentStock: 30,
      minStockAlert: 8,
      averageCost: 12,
      notes: 'مسعّر بالاستيراد',
      units: [{ unitName: 'bag', conversionFactor: 1, isBase: true, sortOrder: 0 }],
      priceTiers: [],
      customerPrices: []
    },
    {
      key: 'lowStock',
      name: 'سيليكون مانع',
      nameEn: 'Sealant',
      categoryId: categoryIds['مواد مساعدة'],
      sku: 'PRD-LST-030',
      barcode: '869111000030',
      unit: 'tube',
      purchasePrice: 18000,
      sellingPrice: 28000,
      defaultCurrency: 'SYP',
      currentStock: 4,
      minStockAlert: 5,
      averageCost: 18000,
      notes: 'لاختبار تنبيه المخزون',
      units: [{ unitName: 'tube', conversionFactor: 1, isBase: true, sortOrder: 0 }],
      priceTiers: [],
      customerPrices: []
    },
    {
      key: 'disableTest',
      name: 'منتج اختبار للتعطيل',
      nameEn: 'Disable Test Product',
      categoryId: categoryIds['تصنيف اختبار للتعطيل'],
      sku: 'PRD-DIS-040',
      barcode: '869111000040',
      unit: 'piece',
      purchasePrice: 5000,
      sellingPrice: 9000,
      defaultCurrency: 'SYP',
      currentStock: 8,
      minStockAlert: 2,
      averageCost: 5000,
      notes: 'منتج مساعد لاختبار التعطيل',
      units: [{ unitName: 'piece', conversionFactor: 1, isBase: true, sortOrder: 0 }],
      priceTiers: [],
      customerPrices: []
    }
  ];

  const productIds = {};
  for (const payload of productPayloads) {
    const response = await request('POST', '/products', { token, body: payload, expected: [201] });
    productIds[payload.key] = response.body.data.id;
  }
  await request('PATCH', `/products/${productIds.disableTest}/disable`, { token, expected: [200] });
  report.created.products = productIds;

  const barcodeLookup = await request('GET', '/products?q=869111000001', { token });
  assert((barcodeLookup.body.data || []).some((item) => item.id === productIds.paint), 'Barcode lookup did not find the target product');
  logStep('products-and-barcode', 'passed', {
    products: Object.keys(productIds).length,
    barcodeMatch: productIds.paint
  });

  const purchase1 = await request('POST', '/purchases', {
    token,
    body: {
      supplierId: supplierIds['مؤسسة الندى التجارية'],
      invoiceDate: '2026-03-11',
      currency: 'SYP',
      discount: 0,
      paymentType: 'PARTIAL',
      paidSyp: 1500000,
      paidUsd: 0,
      notes: 'شراء محلي جزئي الدفع',
      items: [
        { productId: productIds.paint, qty: 20, unitPrice: 85000, unitName: 'bucket' },
        { productId: productIds.brush, qty: 50, unitPrice: 26000, unitName: 'piece' }
      ]
    },
    expected: [201]
  });
  const purchase2 = await request('POST', '/purchases', {
    token,
    body: {
      supplierId: supplierIds['Atlas Coatings Import'],
      invoiceDate: '2026-03-12',
      currency: 'USD',
      discount: 0,
      paymentType: 'PARTIAL',
      paidSyp: 750000,
      paidUsd: 20,
      notes: 'شراء خارجي جزئي الدفع بعملتين',
      items: [
        { productId: productIds.imported, qty: 10, unitPrice: 13, unitName: 'bag' }
      ]
    },
    expected: [201]
  });
  const purchase3 = await request('POST', '/purchases', {
    token,
    body: {
      supplierId: supplierIds['مؤسسة الندى التجارية'],
      invoiceDate: '2026-03-12',
      currency: 'SYP',
      discount: 0,
      paymentType: 'CASH',
      paidSyp: 135000,
      paidUsd: 0,
      notes: 'فاتورة شراء ستلغى لاختبار العكس',
      items: [
        { productId: productIds.brush, qty: 5, unitPrice: 27000, unitName: 'piece' }
      ]
    },
    expected: [201]
  });
  await request('POST', `/purchases/${purchase1.body.data.id}/approve`, { token, expected: [200] });
  await request('POST', `/purchases/${purchase2.body.data.id}/approve`, { token, expected: [200] });
  await request('POST', `/purchases/${purchase3.body.data.id}/cancel`, {
    token,
    body: { reason: 'إلغاء فاتورة الاختبار' },
    expected: [200]
  });
  report.created.purchases = {
    purchase1: purchase1.body.data.id,
    purchase2: purchase2.body.data.id,
    purchase3: purchase3.body.data.id
  };
  logStep('purchases', 'passed', report.created.purchases);

  const sale1 = await request('POST', '/sales', {
    token,
    body: {
      customerId: null,
      invoiceDate: '2026-03-13',
      paymentType: 'CASH',
      paidSyp: 400000,
      paidUsd: 0,
      discount: 0,
      notes: 'بيع نقدي مباشر',
      items: [
        { productId: productIds.brush, qty: 10, unitPrice: 40000, unitName: 'piece' }
      ]
    },
    expected: [201]
  });
  const sale2 = await request('POST', '/sales', {
    token,
    body: {
      customerId: customerIds['مكتب الأفق الهندسي'],
      invoiceDate: '2026-03-14',
      paymentType: 'PARTIAL',
      paidSyp: 500000,
      paidUsd: 20,
      discount: 0,
      notes: 'بيع جزئي السداد بعملتين',
      items: [
        { productId: productIds.paint, qty: 15, unitPrice: 107000, unitName: 'bucket' },
        { productId: productIds.brush, qty: 5, unitPrice: 39000, unitName: 'piece' }
      ]
    },
    expected: [201]
  });
  const sale3 = await request('POST', '/sales', {
    token,
    body: {
      customerId: customerIds['مكتب الأفق الهندسي'],
      invoiceDate: '2026-03-15',
      paymentType: 'CASH',
      paidSyp: 100000,
      paidUsd: 0,
      discount: 0,
      notes: 'قبض فقط بدون أصناف لاختبار تبويب القبض',
      items: []
    },
    expected: [201]
  });
  const sale4 = await request('POST', '/sales', {
    token,
    body: {
      customerId: null,
      invoiceDate: '2026-03-15',
      paymentType: 'CASH',
      paidSyp: 230000,
      paidUsd: 0,
      discount: 0,
      notes: 'فاتورة بيع ستلغى لاختبار العكس',
      items: [
        { productId: productIds.paint, qty: 2, unitPrice: 115000, unitName: 'bucket' }
      ]
    },
    expected: [201]
  });
  const sale5 = await request('POST', '/sales', {
    token,
    body: {
      customerId: customerIds['العميل الدولاري'],
      invoiceDate: '2026-03-15',
      currency: 'USD',
      paymentType: 'PARTIAL',
      paidSyp: 0,
      paidUsd: 10,
      discount: 0,
      notes: 'بيع فعلي بالدولار',
      items: [
        { productId: productIds.imported, qty: 2, unitPrice: 18, unitName: 'bag' }
      ]
    },
    expected: [201]
  });
  await request('POST', `/sales/${sale1.body.data.id}/approve`, { token, expected: [200] });
  await request('POST', `/sales/${sale2.body.data.id}/approve`, { token, expected: [200] });
  await request('POST', `/sales/${sale5.body.data.id}/approve`, { token, expected: [200] });
  await request('POST', `/sales/${sale4.body.data.id}/cancel`, {
    token,
    body: { reason: 'إلغاء فاتورة البيع التجريبية' },
    expected: [200]
  });
  report.created.sales = {
    sale1: sale1.body.data.id,
    sale2: sale2.body.data.id,
    sale3: sale3.body.data.id,
    sale4: sale4.body.data.id,
    sale5: sale5.body.data.id
  };
  logStep('sales', 'passed', report.created.sales);

  await request('POST', `/customers/${customerIds['مكتب الأفق الهندسي']}/collections`, {
    token,
    body: {
      date: '2026-03-15',
      receivedSyp: 200000,
      receivedUsd: 10,
      reference: 'COL-001',
      notes: 'تحصيل مباشر من العميل'
    },
    expected: [201]
  });
  await request('POST', `/suppliers/${supplierIds['مؤسسة الندى التجارية']}/settlements`, {
    token,
    body: {
      date: '2026-03-15',
      amount: 300000,
      currency: 'SYP',
      reference: 'SET-SYP-001',
      notes: 'سداد مورد محلي'
    },
    expected: [201]
  });
  await request('POST', `/suppliers/${supplierIds['Atlas Coatings Import']}/settlements`, {
    token,
    body: {
      date: '2026-03-15',
      amount: 20,
      currency: 'USD',
      reference: 'SET-USD-001',
      notes: 'سداد مورد خارجي'
    },
    expected: [201]
  });
  logStep('collections-and-settlements', 'passed');

  const expense1 = await request('POST', '/expenses', {
    token,
    body: {
      expenseDate: '2026-03-15',
      type: 'نقل',
      amount: 150000,
      currency: 'SYP',
      beneficiary: 'شركة النقل',
      notes: 'مصروف نقل أولي'
    },
    expected: [201]
  });
  await request('PATCH', `/expenses/${expense1.body.data.id}`, {
    token,
    body: {
      expenseDate: '2026-03-15',
      type: 'نقل',
      amount: 175000,
      currency: 'SYP',
      beneficiary: 'شركة النقل',
      notes: 'تم تعديل المصروف'
    },
    expected: [200]
  });
  await request('POST', `/expenses/${expense1.body.data.id}/approve`, { token, expected: [200] });

  const expense2 = await request('POST', '/expenses', {
    token,
    body: {
      expenseDate: '2026-03-15',
      type: 'تحميل',
      amount: 10,
      currency: 'USD',
      beneficiary: 'المنفذ الحدودي',
      notes: 'مصروف بالدولار'
    },
    expected: [201]
  });

  await request('POST', `/expenses/${expense2.body.data.id}/cancel`, {
    token,
    body: { reason: 'اختبار حذف مصروف' },
    expected: [200]
  });
  report.created.expenses = {
    expense1: expense1.body.data.id,
    expense2: expense2.body.data.id
  };
  logStep('expenses', 'passed', report.created.expenses);

  const balancesBeforeExchange = await request('GET', '/cash-management/accounts', { token });
  const beforeSyp = (balancesBeforeExchange.body.data || []).find((item) => item.id === sypAccountId)?.balance ?? 0;
  const beforeUsd = (balancesBeforeExchange.body.data || []).find((item) => item.id === usdAccountId)?.balance ?? 0;

  await request('POST', '/currency-exchange', {
    token,
    body: {
      type: 'SELL_USD',
      date: '2026-03-15',
      usdAmount: 50,
      exchangeRate: 15000,
      counterparty: 'عميل صرف 1',
      notes: 'اختبار بيع الدولار'
    },
    expected: [201]
  });
  const balancesAfterSell = await request('GET', '/cash-management/accounts', { token });
  const afterSellSyp = (balancesAfterSell.body.data || []).find((item) => item.id === sypAccountId)?.balance ?? 0;
  const afterSellUsd = (balancesAfterSell.body.data || []).find((item) => item.id === usdAccountId)?.balance ?? 0;

  if (!(afterSellUsd < beforeUsd && afterSellSyp > beforeSyp)) {
    addFinding('SELL_USD moves cash in the opposite direction', {
      impact: 'Selling USD should reduce USD cash and increase SYP cash, but the tested balances changed the other way around.',
      before: { syp: beforeSyp, usd: beforeUsd },
      after: { syp: afterSellSyp, usd: afterSellUsd }
    });
  }

  await request('POST', '/currency-exchange', {
    token,
    body: {
      type: 'BUY_USD',
      date: '2026-03-15',
      usdAmount: 30,
      exchangeRate: 15000,
      counterparty: 'عميل صرف 2',
      notes: 'اختبار شراء الدولار'
    },
    expected: [201]
  });
  const balancesAfterBuy = await request('GET', '/cash-management/accounts', { token });
  const afterBuySyp = (balancesAfterBuy.body.data || []).find((item) => item.id === sypAccountId)?.balance ?? 0;
  const afterBuyUsd = (balancesAfterBuy.body.data || []).find((item) => item.id === usdAccountId)?.balance ?? 0;

  if (!(afterBuyUsd > afterSellUsd && afterBuySyp < afterSellSyp)) {
    addFinding('BUY_USD moves cash in the opposite direction', {
      impact: 'Buying USD should increase USD cash and decrease SYP cash, but the tested balances changed the other way around.',
      before: { syp: afterSellSyp, usd: afterSellUsd },
      after: { syp: afterBuySyp, usd: afterBuyUsd }
    });
  }

  const exchangeLog = await request('GET', '/currency-exchange', { token });
  logStep('currency-exchange', 'passed', {
    transactions: (exchangeLog.body.data.transactions || []).length
  });

  const sypDailySummary = await request('GET', `/cash-management/daily-summary?accountId=${sypAccountId}&date=2026-03-15`, { token });
  const countedAmount = round2(Number(sypDailySummary.body.data.expectedBalance || 0) - 5000);
  await request('POST', '/cash-management/closing-balance', {
    token,
    body: {
      accountId: sypAccountId,
      countedAmount,
      date: '2026-03-15',
      notes: 'إغلاق يومي اختباري مع فرق عهدة'
    },
    expected: [201]
  });
  const closingHistory = await request('GET', `/cash-management/closing-history?accountId=${sypAccountId}`, { token });
  logStep('daily-closing', 'passed', {
    closingEntries: (closingHistory.body.data || []).length,
    countedAmount
  });

  const customerSummary = await request('GET', `/customers/${customerIds['مكتب الأفق الهندسي']}/summary`, { token });
  const supplierSypSummary = await request('GET', `/suppliers/${supplierIds['مؤسسة الندى التجارية']}/summary`, { token });
  const supplierUsdSummary = await request('GET', `/suppliers/${supplierIds['Atlas Coatings Import']}/summary`, { token });
  const customerAging = await request('GET', '/customers/reports/aging?asOfDate=2026-03-15', { token });
  const supplierAging = await request('GET', '/suppliers/reports/aging?asOfDate=2026-03-15', { token });
  const salesReport = await request('GET', '/sales', { token });
  const purchasesReport = await request('GET', '/purchases', { token });
  const profitLoss = await request('GET', '/reports/profit-loss?from=2026-03-10&to=2026-03-15', { token });

  if (round2(customerSummary.body.data.current_balance) !== 670000) {
    addFinding('Customer balance summary mismatch', {
      impact: 'Customer current balance did not match the expected end-of-test balance after sales and collections.',
      actual: customerSummary.body.data.current_balance,
      expected: 670000
    });
  }

  if (round2(customerSummary.body.data.outstanding_from_sales) !== 550000) {
    addFinding('Customer summary outstanding figure is still inconsistent', {
      impact: 'Outstanding sales should reflect invoice receipts plus standalone collections, excluding the opening balance.',
      summary: customerSummary.body.data,
      expectedOutstandingFromSales: 550000
    });
  }

  if (round2(supplierSypSummary.body.data.current_balance) !== 1450000) {
    addFinding('Supplier SYP balance summary mismatch', {
      impact: 'Supplier current balance did not match the expected end-of-test balance after purchases and settlement.',
      actual: supplierSypSummary.body.data.current_balance,
      expected: 1450000
    });
  }

  if (round2(supplierSypSummary.body.data.outstanding_from_purchases) !== 1200000) {
    addFinding('Supplier summary outstanding figure is still inconsistent', {
      impact: 'Outstanding purchases should reflect invoice payments plus standalone settlements, excluding the opening balance.',
      summary: supplierSypSummary.body.data,
      expectedOutstandingFromPurchases: 1200000
    });
  }

  const usdSale = (salesReport.body.data || []).find((row) => row.id === sale5.body.data.id);
  if (!usdSale || usdSale.currency !== 'USD' || round2(usdSale.remaining_original) !== 26) {
    addFinding('Native USD sales invoice is still not working correctly', {
      impact: 'The system should create and keep a USD-denominated sales invoice with the remaining balance in USD.',
      usdSale: usdSale || null
    });
  }

  const productsTable = queryDb(`
    SELECT id, name_ar, current_qty, min_stock_level, is_active, default_currency, barcode
    FROM products
    ORDER BY id
  `);
  const lowStockRows = productsTable.filter((row) => Number(row.current_qty) <= Number(row.min_stock_level) && Number(row.is_active) === 1);
  const cashBalances = queryDb(`
    SELECT
      a.id,
      a.name,
      a.currency,
      COALESCE(SUM(CASE WHEN m.direction = 'IN' THEN m.original_amount ELSE -m.original_amount END), 0) AS balance
    FROM cash_accounts a
    LEFT JOIN cash_movements m ON m.cash_account_id = a.id
    GROUP BY a.id, a.name, a.currency
    ORDER BY a.id
  `);

  if (!lowStockRows.some((row) => row.id === productIds.lowStock)) {
    addFinding('Low-stock threshold did not flag the dedicated low-stock product', {
      impact: 'The product created with quantity below its alert threshold was not returned by direct stock inspection.',
      lowStockRows
    });
  }

  const backupResult = await request('POST', '/settings/data-management/backup', {
    token,
    body: {},
    expected: [201]
  });
  logStep('manual-backup', 'passed', {
    backupFile: backupResult.body.data.fileName || backupResult.body.data.filename || null
  });

  report.summaries = {
    customerSummary: customerSummary.body.data,
    supplierSypSummary: supplierSypSummary.body.data,
    supplierUsdSummary: supplierUsdSummary.body.data,
    customerAging: customerAging.body.data,
    supplierAging: supplierAging.body.data,
    salesInvoices: salesReport.body.data,
    purchaseInvoices: purchasesReport.body.data,
    profitLoss: profitLoss.body.data,
    lowStockRows,
    cashBalances,
    products: productsTable
  };

  logStep('reports-and-cross-checks', 'passed', {
    activeSales: (salesReport.body.data || []).filter((row) => row.status === 'ACTIVE').length,
    activePurchases: (purchasesReport.body.data || []).filter((row) => row.status === 'ACTIVE').length,
    lowStockCount: lowStockRows.length
  });

  report.completedAt = new Date().toISOString();
  report.status = report.findings.length ? 'completed-with-findings' : 'passed';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    status: report.status,
    findings: report.findings.length,
    reportPath
  }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  report.completedAt = new Date().toISOString();
  report.status = 'failed';
  report.failures.push({
    at: new Date().toISOString(),
    message: error.message,
    details: error.details || error.response || null
  });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.error(JSON.stringify({
    status: 'failed',
    message: error.message,
    details: error.details || error.response || null,
    reportPath
  }, null, 2));
  process.exit(1);
});
