import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';

export default function ContextGuide({ title, intro, steps = [] }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="card">
      <div className="header-row" style={{ alignItems: 'center' }}>
        <div>
          <h3>{title}</h3>
          <p className="hint">{intro}</p>
        </div>
        <button className="btn secondary" type="button" onClick={() => setExpanded((current) => !current)}>
          {expanded ? t('hideGuide') : t('showGuide')}
        </button>
      </div>
      {expanded ? (
        <ol className="guide-list">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
