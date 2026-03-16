export default function DashboardView({ t, dashboard, activeKey, bootstrap, formatDateTime, openLicenseDetails, statusLabel }) {
  return (
    <section className="page-grid">
      <div className="stats-grid">
        <article className="stat-card"><span>{t('dashboard.totalIssued')}</span><strong>{dashboard.totalLicenses || 0}</strong></article>
        <article className="stat-card accent-teal"><span>{t('dashboard.active')}</span><strong>{dashboard.activeLicenses || 0}</strong></article>
        <article className="stat-card accent-amber"><span>{t('dashboard.expiringSoon')}</span><strong>{dashboard.expiringSoonLicenses || 0}</strong></article>
        <article className="stat-card accent-red"><span>{t('dashboard.expired')}</span><strong>{dashboard.expiredLicenses || 0}</strong></article>
      </div>
      <div className="split-panel">
        <div className="panel">
          <h3>{t('dashboard.keyStatus')}</h3>
          <div className="mini-stack">
            <div className="info-row"><span>{t('common.publicKey')}</span><strong>{activeKey?.publicKeyFingerprint ? t('common.loaded') : t('common.missing')}</strong></div>
            <div className="info-row"><span>{t('common.privateKey')}</span><strong>{activeKey?.hasPrivateKey ? t('common.loaded') : t('common.missing')}</strong></div>
            <div className="info-row"><span>{t('common.storagePath')}</span><strong className="mono">{bootstrap?.keyInfo?.storagePath || '-'}</strong></div>
          </div>
        </div>
        <div className="panel">
          <h3>{t('dashboard.recentLicenses')}</h3>
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.customer')}</th>
                <th>{t('common.licenseId')}</th>
                <th>{t('common.expires')}</th>
                <th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {(dashboard.recentLicenses || []).map((item) => (
                <tr key={item.id} onClick={() => openLicenseDetails(item.id)}>
                  <td>{item.customerName}</td>
                  <td>{item.licenseId}</td>
                  <td>{formatDateTime(item.expiresAt)}</td>
                  <td><span className={`status-pill ${item.statusTag}`}>{statusLabel(item.statusTag)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
