const DATASET_SCHEMAS = {
  categories: [
    { key: 'name', label: 'name' },
    { key: 'description', label: 'description' },
    { key: 'isActive', label: 'isActive' }
  ],
  customers: [
    { key: 'name', label: 'name' },
    { key: 'phone', label: 'phone' },
    { key: 'email', label: 'email' },
    { key: 'address', label: 'address' },
    { key: 'notes', label: 'notes' },
    { key: 'openingBalance', label: 'openingBalance' },
    { key: 'currency', label: 'currency' },
    { key: 'isActive', label: 'isActive' }
  ],
  suppliers: [
    { key: 'name', label: 'name' },
    { key: 'phone', label: 'phone' },
    { key: 'email', label: 'email' },
    { key: 'address', label: 'address' },
    { key: 'notes', label: 'notes' },
    { key: 'openingBalance', label: 'openingBalance' },
    { key: 'currency', label: 'currency' },
    { key: 'isActive', label: 'isActive' }
  ],
  products: [
    { key: 'name', label: 'name' },
    { key: 'sku', label: 'sku' },
    { key: 'barcode', label: 'barcode' },
    { key: 'categoryName', label: 'categoryName' },
    { key: 'unit', label: 'unit' },
    { key: 'currency', label: 'currency' },
    { key: 'purchasePrice', label: 'purchasePrice' },
    { key: 'sellingPrice', label: 'sellingPrice' },
    { key: 'currentStock', label: 'currentStock' },
    { key: 'minStockLevel', label: 'minStockLevel' },
    { key: 'notes', label: 'notes' }
  ]
};

function escapeCsvValue(value) {
  if (value == null) return '';
  const stringValue = String(value);
  if (/[,"\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function getDatasetSchema(dataset) {
  return DATASET_SCHEMAS[dataset] || [{ key: 'name', label: 'name' }];
}

export function buildDatasetTemplateRows(dataset) {
  return [{ ...Object.fromEntries(getDatasetSchema(dataset).map((field) => [field.key, ''])) }];
}

export function rowsToCsv(dataset, rows) {
  const schema = getDatasetSchema(dataset);
  const headers = schema.map((field) => field.key);
  const lines = [
    headers.join(','),
    ...(rows || []).map((row) => headers.map((key) => escapeCsvValue(row?.[key] ?? '')).join(','))
  ];
  return lines.join('\n');
}

export function parseCsv(text) {
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current);
      current = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      continue;
    }

    current += char;
  }

  if (current !== '' || row.length) {
    row.push(current);
    if (row.some((value) => value !== '')) rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0].map((header) => String(header || '').trim());
  return rows.slice(1).map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? '';
    });
    return record;
  });
}

