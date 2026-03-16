import { PERMISSIONS, USER_ROLES } from '@paint-shop/shared';
import { APP_BRAND } from '../i18n/translations.js';

export const APP_NAME = APP_BRAND;

export const ROLE_LABEL_KEYS = {
  [USER_ROLES.SUPER_ADMIN]: 'roleSuperAdmin',
  [USER_ROLES.ADMIN]: 'roleAdmin',
  [USER_ROLES.OWNER]: 'roleOwner',
  [USER_ROLES.CASHIER]: 'roleCashier',
  [USER_ROLES.ACCOUNTANT]: 'roleAccountant',
  [USER_ROLES.SALES]: 'roleSales',
  [USER_ROLES.PURCHASES]: 'rolePurchases',
  [USER_ROLES.INVENTORY]: 'roleInventory',
  [USER_ROLES.REPORTS]: 'roleReports'
};

export const WORKSPACE_ROUTE_META = {
  '/': {
    labelKey: 'dashboard',
    groupKey: 'system',
    descriptionKey: 'workspace.dashboard'
  },
  '/users': {
    labelKey: 'settingsAdmin',
    groupKey: 'menuAdministration',
    descriptionKey: 'workspace.settings'
  },
  '/settings': {
    labelKey: 'settingsAdmin',
    groupKey: 'menuAdministration',
    descriptionKey: 'workspace.settings'
  },
  '/categories': {
    labelKey: 'categories',
    groupKey: 'menuInventory',
    descriptionKey: 'workspace.categories'
  },
  '/products': {
    labelKey: 'productsManagement',
    groupKey: 'menuInventory',
    descriptionKey: 'workspace.products'
  },
  '/suppliers': {
    labelKey: 'suppliers',
    groupKey: 'menuFinancial',
    descriptionKey: 'workspace.suppliers'
  },
  '/customers': {
    labelKey: 'customerData',
    groupKey: 'menuCustomers',
    descriptionKey: 'workspace.customers'
  },
  '/purchases': {
    labelKey: 'purchasesInvoices',
    groupKey: 'menuFinancial',
    descriptionKey: 'workspace.purchases'
  },
  '/sales': {
    labelKey: 'salesInvoices',
    groupKey: 'menuSales',
    descriptionKey: 'workspace.sales'
  },
  '/reports': {
    labelKey: 'menuReports',
    groupKey: 'menuReports',
    descriptionKey: 'workspace.reports'
  },
  '/help': {
    labelKey: 'helpCenterTitle',
    groupKey: 'menuInfo',
    descriptionKey: 'workspace.help'
  },
  '/cash-management': {
    labelKey: 'cashbox',
    groupKey: 'menuFinancial',
    descriptionKey: 'workspace.cashManagement'
  },
  '/expenses': {
    labelKey: 'expensesModule',
    groupKey: 'menuFinancial',
    descriptionKey: 'workspace.expenses'
  },
  '/exchange-rate': {
    labelKey: 'exchangeRate',
    groupKey: 'menuFinancial',
    descriptionKey: 'workspace.exchangeRate'
  },
  '/currency-exchange': {
    labelKey: 'usdExchange',
    groupKey: 'menuFinancial',
    descriptionKey: 'workspace.currencyExchange'
  }
};

export const MENU_SECTIONS = [
  {
    key: 'financial',
    labelKey: 'menuFinancial',
    items: [
      { labelKey: 'cashbox', to: '/cash-management', permission: PERMISSIONS.SETTINGS_MANAGE },
      { labelKey: 'bank', placeholder: true },
      { labelKey: 'checks', placeholder: true },
      { labelKey: 'revenuesExpenses', to: '/expenses', permission: PERMISSIONS.EXPENSES_VIEW },
      { labelKey: 'exchangeRate', to: '/exchange-rate', permission: PERMISSIONS.EXCHANGE_RATE_VIEW },
      { labelKey: 'usdExchange', to: '/currency-exchange', permission: PERMISSIONS.CURRENCY_EXCHANGE_VIEW }
    ]
  },
  {
    key: 'inventory',
    labelKey: 'menuInventory',
    items: [
      { labelKey: 'addProduct', to: '/products', permission: PERMISSIONS.INVENTORY_VIEW },
      { labelKey: 'productsManagement', to: '/products', permission: PERMISSIONS.INVENTORY_VIEW },
      { labelKey: 'stockQuantities', to: '/products', permission: PERMISSIONS.INVENTORY_VIEW },
      { labelKey: 'lowStockAlerts', to: '/products', permission: PERMISSIONS.INVENTORY_VIEW },
      { labelKey: 'inventoryValuation', placeholder: true, noteKey: 'inventoryValuationNote' }
    ]
  },
  {
    key: 'sales',
    labelKey: 'menuSales',
    items: [
      { labelKey: 'directSale', to: '/sales', permission: PERMISSIONS.SALES_VIEW },
      { labelKey: 'cardSale', placeholder: true },
      { labelKey: 'installmentSale', placeholder: true },
      { labelKey: 'salesInvoices', to: '/sales', permission: PERMISSIONS.SALES_VIEW }
    ]
  },
  {
    key: 'customers',
    labelKey: 'menuCustomers',
    items: [
      { labelKey: 'customerData', to: '/customers', permission: PERMISSIONS.CUSTOMERS_VIEW },
      { labelKey: 'customerAccounts', to: '/customers', permission: PERMISSIONS.CUSTOMERS_VIEW },
      { labelKey: 'debtsCollections', to: '/customers', permission: PERMISSIONS.CUSTOMERS_VIEW },
      { labelKey: 'accountStatement', placeholder: true }
    ]
  },
  {
    key: 'reports',
    labelKey: 'menuReports',
    items: [
      { labelKey: 'salesReports', to: '/reports?view=sales', permission: PERMISSIONS.REPORTS_VIEW },
      { labelKey: 'profitLoss', to: '/reports?view=profit-loss', permission: PERMISSIONS.REPORTS_VIEW },
      { labelKey: 'inventoryReports', to: '/reports', permission: PERMISSIONS.REPORTS_VIEW },
      { labelKey: 'financialReports', to: '/cash-management', permission: PERMISSIONS.REPORTS_VIEW }
    ]
  },
  {
    key: 'administration',
    labelKey: 'menuAdministration',
    items: [
      { labelKey: 'dashboard', to: '/' },
      { labelKey: 'settingsAdmin', to: '/settings', permission: PERMISSIONS.SETTINGS_VIEW }
    ]
  },
  {
    key: 'information',
    labelKey: 'menuInfo',
    items: [
      { labelKey: 'helpCenterTitle', to: '/help' },
      { labelKey: 'addressBook', placeholder: true },
      { labelKey: 'reminders', placeholder: true },
      { labelKey: 'appointments', placeholder: true },
      { labelKey: 'sendMail', placeholder: true },
      { labelKey: 'sendSms', placeholder: true },
      { labelKey: 'users', to: '/settings', permission: PERMISSIONS.SETTINGS_VIEW }
    ]
  }
];

export const QUICK_ACTIONS = [
  { labelKey: 'newSale', to: '/sales', icon: 'S', permission: PERMISSIONS.SALES_VIEW },
  { labelKey: 'newPurchase', to: '/purchases', icon: 'P', permission: PERMISSIONS.PURCHASES_VIEW },
  { labelKey: 'usdExchange', to: '/currency-exchange', icon: 'FX', permission: PERMISSIONS.CURRENCY_EXCHANGE_VIEW }
];

export const SHELL_ICON_ACTIONS = [
  { labelKey: 'iconProducts', to: '/products', icon: 'product', permission: PERMISSIONS.INVENTORY_VIEW },
  { labelKey: 'iconCustomers', to: '/customers', icon: 'customers', permission: PERMISSIONS.CUSTOMERS_VIEW },
  { labelKey: 'iconSuppliers', to: '/suppliers', icon: 'suppliers', permission: PERMISSIONS.SUPPLIERS_VIEW },
  { labelKey: 'iconCashbox', to: '/cash-management', icon: 'cashbox', permission: PERMISSIONS.SETTINGS_MANAGE },
  { labelKey: 'iconExpenses', to: '/expenses', icon: 'expenses', permission: PERMISSIONS.EXPENSES_VIEW },
  { labelKey: 'iconExchangeRate', to: '/exchange-rate', icon: 'exchange', permission: PERMISSIONS.EXCHANGE_RATE_VIEW }
];
