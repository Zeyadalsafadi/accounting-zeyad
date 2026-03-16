import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';

function HelpSectionVisual({ kind }) {
  const common = {
    viewBox: '0 0 220 120',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  };

  if (kind === 'operations') {
    return (
      <svg {...common} className="help-visual-svg">
        <rect x="12" y="18" width="48" height="32" rx="8" />
        <rect x="86" y="18" width="48" height="32" rx="8" />
        <rect x="160" y="18" width="48" height="32" rx="8" />
        <path d="M60 34h26" />
        <path d="m78 26 8 8-8 8" />
        <path d="M134 34h26" />
        <path d="m152 26 8 8-8 8" />
        <rect x="52" y="74" width="116" height="26" rx="10" />
      </svg>
    );
  }

  if (kind === 'cash') {
    return (
      <svg {...common} className="help-visual-svg">
        <rect x="18" y="22" width="70" height="52" rx="10" />
        <circle cx="53" cy="48" r="12" />
        <path d="M116 36h72" />
        <path d="m172 24 16 12-16 12" />
        <path d="M188 84h-72" />
        <path d="m132 72-16 12 16 12" />
      </svg>
    );
  }

  if (kind === 'reports') {
    return (
      <svg {...common} className="help-visual-svg">
        <path d="M26 92V54" />
        <path d="M66 92V34" />
        <path d="M106 92V62" />
        <path d="M146 92V24" />
        <path d="M186 92V46" />
        <path d="M18 94h176" />
      </svg>
    );
  }

  return (
    <svg {...common} className="help-visual-svg">
      <rect x="18" y="20" width="184" height="80" rx="14" />
      <path d="M42 44h88" />
      <path d="M42 62h132" />
      <path d="M42 80h70" />
      <circle cx="170" cy="58" r="16" />
    </svg>
  );
}

function buildHelpContent(t) {
  return [
    {
      key: 'getting-started',
      title: t('helpSectionGettingStarted'),
      intro: t('helpGettingStartedIntro'),
      blocks: [
        {
          route: '/settings',
          title: t('helpBlockFirstLogin'),
          items: [
            t('helpFirstLogin1'),
            t('helpFirstLogin2'),
            t('helpFirstLogin3')
          ]
        },
        {
          route: '/',
          title: t('helpBlockDailyFlow'),
          items: [
            t('helpDailyFlow1'),
            t('helpDailyFlow2'),
            t('helpDailyFlow3'),
            t('helpDailyFlow4')
          ]
        }
      ]
    },
    {
      key: 'master-data',
      title: t('helpSectionMasterData'),
      intro: t('helpMasterDataIntro'),
      blocks: [
        {
          route: '/products',
          title: t('productsManagement'),
          items: [
            t('helpProducts1'),
            t('helpProducts2'),
            t('helpProducts3'),
            t('helpProducts4')
          ]
        },
        {
          route: '/customers',
          title: t('customerData'),
          items: [
            t('helpCustomers1'),
            t('helpCustomers2'),
            t('helpCustomers3')
          ]
        },
        {
          route: '/suppliers',
          title: t('suppliers'),
          items: [
            t('helpSuppliers1'),
            t('helpSuppliers2'),
            t('helpSuppliers3')
          ]
        }
      ]
    },
    {
      key: 'operations',
      title: t('helpSectionOperations'),
      intro: t('helpOperationsIntro'),
      blocks: [
        {
          route: '/purchases',
          title: t('purchasesInvoices'),
          items: [
            t('helpPurchases1'),
            t('helpPurchases2'),
            t('helpPurchases3'),
            t('helpPurchases4')
          ]
        },
        {
          route: '/sales',
          title: t('salesInvoices'),
          items: [
            t('helpSales1'),
            t('helpSales2'),
            t('helpSales3'),
            t('helpSales4')
          ]
        },
        {
          route: '/expenses',
          title: t('expensesModule'),
          items: [
            t('helpExpenses1'),
            t('helpExpenses2'),
            t('helpExpenses3')
          ]
        }
      ]
    },
    {
      key: 'cash-currency',
      title: t('helpSectionCashAndCurrency'),
      intro: t('helpCashIntro'),
      blocks: [
        {
          route: '/cash-management',
          title: t('cashbox'),
          items: [
            t('helpCash1'),
            t('helpCash2'),
            t('helpCash3')
          ]
        },
        {
          route: '/exchange-rate',
          title: t('exchangeRate'),
          items: [
            t('helpRate1'),
            t('helpRate2')
          ]
        },
        {
          route: '/currency-exchange',
          title: t('usdExchange'),
          items: [
            t('helpCurrencyExchange1'),
            t('helpCurrencyExchange2'),
            t('helpCurrencyExchange3')
          ]
        }
      ]
    },
    {
      key: 'reports-controls',
      title: t('helpSectionReportsAndControl'),
      intro: t('helpReportsIntro'),
      blocks: [
        {
          route: '/reports',
          title: t('reports'),
          items: [
            t('helpReports1'),
            t('helpReports2'),
            t('helpReports3'),
            t('helpReports4')
          ]
        },
        {
          route: '/settings',
          title: t('settingsAdmin'),
          items: [
            t('helpSettings1'),
            t('helpSettings2'),
            t('helpSettings3'),
            t('helpSettings4')
          ]
        }
      ]
    },
    {
      key: 'backup-year-end',
      title: t('helpSectionBackupYearEnd'),
      intro: t('helpBackupIntro'),
      blocks: [
        {
          route: '/settings?tab=data',
          title: t('backupManagement'),
          items: [
            t('helpBackup1'),
            t('helpBackup2'),
            t('helpBackup3')
          ]
        },
        {
          route: '/settings?tab=yearEnd',
          title: t('yearEndReset'),
          items: [
            t('helpYearEnd1'),
            t('helpYearEnd2'),
            t('helpYearEnd3'),
            t('helpYearEnd4')
          ]
        }
      ]
    }
  ];
}

function buildFaqItems(t) {
  return [
    { q: t('faqQ1'), a: t('faqA1'), route: '/settings' },
    { q: t('faqQ2'), a: t('faqA2'), route: '/products' },
    { q: t('faqQ3'), a: t('faqA3'), route: '/sales' },
    { q: t('faqQ4'), a: t('faqA4'), route: '/reports?view=profit-loss' },
    { q: t('faqQ5'), a: t('faqA5'), route: '/settings?tab=data' },
    { q: t('faqQ6'), a: t('faqA6'), route: '/settings?tab=yearEnd' }
  ];
}

export default function HelpPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [activeHelpPanel, setActiveHelpPanel] = useState('guide');

  const sections = useMemo(() => buildHelpContent(t), [t]);
  const faqItems = useMemo(() => buildFaqItems(t), [t]);
  const normalizedQuery = query.trim().toLowerCase();

  const visibleSections = useMemo(() => {
    if (!normalizedQuery) return sections;
    return sections
      .map((section) => {
        const visibleBlocks = section.blocks.filter((block) => {
          const haystack = [
            section.title,
            section.intro,
            block.title,
            ...(block.items || [])
          ].join(' ').toLowerCase();
          return haystack.includes(normalizedQuery);
        });
        if (!visibleBlocks.length) return null;
        return { ...section, blocks: visibleBlocks };
      })
      .filter(Boolean);
  }, [normalizedQuery, sections]);
  const visibleFaqs = useMemo(() => {
    if (!normalizedQuery) return faqItems;
    return faqItems.filter((item) => `${item.q} ${item.a}`.toLowerCase().includes(normalizedQuery));
  }, [faqItems, normalizedQuery]);

  const printHelpGuide = () => {
    const dir = document?.documentElement?.dir || 'rtl';
    const printable = window.open('', '_blank', 'width=1100,height=780');
    if (!printable) return;
    const sectionsHtml = sections.map((section) => `
      <section>
        <h2>${section.title}</h2>
        <p>${section.intro}</p>
        ${section.blocks.map((block) => `
          <div style="margin: 14px 0 0;">
            <h3>${block.title}</h3>
            <ul>
              ${block.items.map((item) => `<li>${item}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      </section>
    `).join('');
    const faqHtml = faqItems.map((item) => `
      <div style="margin: 12px 0;">
        <h3>${item.q}</h3>
        <p>${item.a}</p>
      </div>
    `).join('');

    printable.document.write(`
      <html dir="${dir}">
        <head>
          <title>${t('helpPrintableTitle')}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #172033; padding: 28px; line-height: 1.8; }
            h1, h2, h3 { margin: 0 0 10px; }
            h1 { margin-bottom: 18px; }
            section { margin-bottom: 28px; }
            ul { margin: 0; padding-inline-start: 20px; }
            li { margin-bottom: 6px; }
            .muted { color: #4b5a78; margin-bottom: 18px; }
          </style>
        </head>
        <body>
          <h1>${t('helpPrintableTitle')}</h1>
          <p class="muted">${t('helpCenterIntro')}</p>
          ${sectionsHtml}
          <section>
            <h2>${t('faqTitle')}</h2>
            ${faqHtml}
          </section>
        </body>
      </html>
    `);
    printable.document.close();
    printable.focus();
    printable.print();
  };

  return (
    <main className="container help-page">
      <div className="cash-tabs" role="tablist" aria-label={t('helpCenterTitle')}>
        <button
          className={`cash-tab${activeHelpPanel === 'guide' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeHelpPanel === 'guide'}
          onClick={() => setActiveHelpPanel('guide')}
        >
          {t('helpCenterTitle')}
        </button>
        <button
          className={`cash-tab${activeHelpPanel === 'faq' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeHelpPanel === 'faq'}
          onClick={() => setActiveHelpPanel('faq')}
        >
          {t('faqTitle')}
        </button>
      </div>

      <section className="card">
        <div className="header-actions help-toolbar-actions">
          <button className="btn secondary" type="button" onClick={printHelpGuide}>{t('printHelpGuide')}</button>
        </div>
        <p className="hint">{t('helpCenterIntro')}</p>
      </section>

      <section className="card">
        <div className="form-grid" style={{ alignItems: 'end' }}>
          <div className="form-field">
            <label className="field-label">{t('helpSearchLabel')}</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('helpSearchPlaceholder')}
            />
          </div>
        </div>
      </section>

      {activeHelpPanel === 'guide' ? (
        <>
          <section className="card">
            <h3>{t('helpIndexTitle')}</h3>
            <div className="form-grid">
              {visibleSections.map((section) => (
                <a key={section.key} className="summary-card" href={`#${section.key}`}>
                  <span>{section.title}</span>
                  <strong>{section.blocks.length} {t('helpBlocksCount')}</strong>
                </a>
              ))}
            </div>
          </section>

          {visibleSections.map((section) => (
            <section key={section.key} id={section.key} className="card">
              <h2>{section.title}</h2>
              <p className="hint">{section.intro}</p>
              <div className="help-visual">
                <HelpSectionVisual
                  kind={
                    section.key === 'operations'
                      ? 'operations'
                      : section.key === 'cash-currency'
                        ? 'cash'
                        : section.key === 'reports-controls'
                          ? 'reports'
                          : 'general'
                  }
                />
              </div>
              {section.blocks.map((block) => (
                <div key={`${section.key}-${block.title}`} style={{ marginTop: 16 }}>
                  <div className="header-row" style={{ alignItems: 'center' }}>
                    <h3>{block.title}</h3>
                    {block.route ? (
                      <Link className="btn secondary" to={block.route}>{t('openRelatedScreen')}</Link>
                    ) : null}
                  </div>
                  <ul className="page-list">
                    {block.items.map((item) => (
                      <li key={`${section.key}-${block.title}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </>
      ) : (
        <section className="card">
          <h2>{t('faqTitle')}</h2>
          <p className="hint">{t('faqIntro')}</p>
          {visibleFaqs.map((item) => (
            <div key={item.q} style={{ marginTop: 16 }}>
              <div className="header-row" style={{ alignItems: 'center' }}>
                <h3>{item.q}</h3>
                {item.route ? (
                  <Link className="btn secondary" to={item.route}>{t('openRelatedScreen')}</Link>
                ) : null}
              </div>
              <p>{item.a}</p>
            </div>
          ))}
        </section>
      )}

      {!visibleSections.length && !visibleFaqs.length ? (
        <section className="card">
          <p className="hint">{t('helpNoResults')}</p>
        </section>
      ) : null}
    </main>
  );
}
