export default function HelpView({ t }) {
  const sections = [
    {
      title: t('help.sections.start'),
      items: [t('help.steps.start1'), t('help.steps.start2')]
    },
    {
      title: t('help.sections.keys'),
      items: [t('help.steps.keys1'), t('help.steps.keys2')]
    },
    {
      title: t('help.sections.api'),
      items: [t('help.steps.api1'), t('help.steps.api2')]
    },
    {
      title: t('help.sections.issue'),
      items: [t('help.steps.issue1'), t('help.steps.issue2')]
    },
    {
      title: t('help.sections.customer'),
      items: [t('help.steps.customer1'), t('help.steps.customer2')]
    },
    {
      title: t('help.sections.renew'),
      items: [t('help.steps.renew1'), t('help.steps.renew2')]
    },
    {
      title: t('help.sections.validate'),
      items: [t('help.steps.validate1')]
    },
    {
      title: t('help.sections.security'),
      items: [t('help.steps.security1'), t('help.steps.security2')]
    }
  ];

  return (
    <section className="page-grid">
      <div className="panel">
        <h3>{t('help.title')}</h3>
        <p className="help-intro">{t('help.intro')}</p>
      </div>
      {sections.map((section) => (
        <div key={section.title} className="panel">
          <h3>{section.title}</h3>
          <ul className="history-list">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
