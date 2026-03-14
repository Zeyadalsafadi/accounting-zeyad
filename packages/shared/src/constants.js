export const CURRENCIES = {
  SYP: 'SYP',
  USD: 'USD'
};

export const SUPPORTED_CURRENCIES = Object.values(CURRENCIES);

export const PRODUCT_UNITS = [
  { value: 'قطعة', label: 'قطعة' },
  { value: 'كيلوغرام', label: 'كيلوغرام' },
  { value: 'غرام', label: 'غرام' },
  { value: 'لتر', label: 'لتر' },
  { value: 'متر', label: 'متر' },
  { value: 'صندوق', label: 'صندوق' },
  { value: 'عبوة', label: 'عبوة' },
  { value: 'حبة', label: 'حبة' }
];

export const USER_ROLES = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  CASHIER: 'CASHIER',
  ACCOUNTANT: 'ACCOUNTANT'
};

export const ALL_USER_ROLES = Object.values(USER_ROLES);
