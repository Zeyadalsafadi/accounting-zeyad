import { APP_BRAND } from '../i18n/translations.js';

function buildPrintStyles(dir) {
  const textAlign = dir === 'ltr' ? 'left' : 'right';

  return `
    :root {
      color-scheme: light;
      font-family: "Cairo", "Segoe UI", Tahoma, sans-serif;
      color: #162033;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      direction: ${dir};
      background: #ffffff;
      color: #162033;
    }
    .print-shell {
      max-width: 980px;
      margin: 0 auto;
    }
    .print-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 2px solid #d7e2ee;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }
    .print-header h1 {
      margin: 0;
      font-size: 24px;
    }
    .print-header p {
      margin: 4px 0 0;
      color: #5f6b79;
      font-size: 13px;
    }
    .print-title {
      margin: 0 0 16px;
      font-size: 20px;
    }
    .print-body {
      text-align: ${textAlign};
    }
    .table {
      width: 100%;
      border-collapse: collapse;
    }
    .table th,
    .table td {
      border: 1px solid #d7e2ee;
      padding: 10px 8px;
      text-align: ${textAlign};
      vertical-align: top;
    }
    .table th {
      background: #eef4fb;
      color: #27415e;
    }
    .card,
    .entry-section,
    .status-box {
      border: 1px solid #d7e2ee;
      border-radius: 12px;
      padding: 12px;
      background: #fff;
      box-shadow: none;
      margin-bottom: 12px;
    }
    .header-actions,
    .btn,
    .inline-create-toggle,
    .item-remove,
    .no-print {
      display: none !important;
    }
    .status-meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .summary-grid,
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }
    .summary-card {
      border: 1px solid #d7e2ee;
      border-radius: 12px;
      padding: 12px;
      background: #fff;
    }
    .summary-card strong,
    .summary-card small,
    .summary-card span {
      display: block;
    }
    @page {
      size: auto;
      margin: 12mm;
    }
  `;
}

export function printHtmlDocument({ title, html, lang = 'ar', dir = 'rtl' }) {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=900');
  if (!printWindow) {
    throw new Error('Unable to open print window');
  }

  const documentTitle = title || APP_BRAND;
  const styles = buildPrintStyles(dir);

  printWindow.document.write(`
    <!doctype html>
    <html lang="${lang}" dir="${dir}">
      <head>
        <meta charset="utf-8" />
        <title>${documentTitle}</title>
        <style>${styles}</style>
      </head>
      <body>
        <div class="print-shell">
          <div class="print-header">
            <div>
              <h1>${APP_BRAND}</h1>
              <p>${documentTitle}</p>
            </div>
            <p>${new Date().toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}</p>
          </div>
          <div class="print-body">${html}</div>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

