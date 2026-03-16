import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import './initDb.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import systemRouter from './routes/system.js';
import usersRouter from './routes/users.js';
import settingsRouter from './routes/settings.js';
import categoriesRouter from './routes/categories.js';
import productsRouter from './routes/products.js';
import suppliersRouter from './routes/suppliers.js';
import customersRouter from './routes/customers.js';
import purchasesRouter from './routes/purchases.js';
import cashAccountsRouter from './routes/cashAccounts.js';
import salesRouter from './routes/sales.js';
import reportsRouter from './routes/reports.js';
import cashManagementRouter from './routes/cashManagement.js';
import expensesRouter from './routes/expenses.js';
import exchangeRateRouter from './routes/exchangeRate.js';
import currencyExchangeRouter from './routes/currencyExchange.js';
import { maybeRunScheduledBackup } from './utils/dataManagement.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/v1/health', healthRouter);
app.use('/api/v1/system', systemRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/settings', settingsRouter);
app.use('/api/v1/categories', categoriesRouter);
app.use('/api/v1/products', productsRouter);
app.use('/api/v1/suppliers', suppliersRouter);
app.use('/api/v1/customers', customersRouter);
app.use('/api/v1/purchases', purchasesRouter);
app.use('/api/v1/cash-accounts', cashAccountsRouter);
app.use('/api/v1/sales', salesRouter);
app.use('/api/v1/reports', reportsRouter);
app.use('/api/v1/cash-management', cashManagementRouter);
app.use('/api/v1/expenses', expensesRouter);
app.use('/api/v1/exchange-rate', exchangeRateRouter);
app.use('/api/v1/currency-exchange', currencyExchangeRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ success: false, error: 'حدث خطأ داخلي' });
});

try {
  maybeRunScheduledBackup();
} catch (error) {
  console.error('Automatic backup check failed:', error);
}

app.listen(env.port, () => {
  console.log(`API running on http://localhost:${env.port}`);
});
