import { Notice } from '../components/Shared.jsx';

export default function LicensesView({
  t, licenses, selectedLicense, licenseFilters, setLicenseFilters, plans,
  statusLabel, formatDateTime, openLicenseDetails, startRenew, startReissue, handleCopy, loadLicenses
}) {
  return (
    <section className="page-grid">
      <div className="toolbar-card">
        <input placeholder={`${t('common.customer')} / ${t('common.licenseId')}`} value={licenseFilters.q} onChange={(event) => setLicenseFilters((current) => ({ ...current, q: event.target.value }))} />
        <select value={licenseFilters.planCode} onChange={(event) => setLicenseFilters((current) => ({ ...current, planCode: event.target.value }))}><option value="">{t('common.allPlans')}</option>{plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.code}</option>)}</select>
        <select value={licenseFilters.statusTag} onChange={(event) => setLicenseFilters((current) => ({ ...current, statusTag: event.target.value }))}><option value="">{t('common.allStates')}</option><option value="active">{t('common.active')}</option><option value="expiring-soon">{t('common.expiringSoon')}</option><option value="expired">{t('common.expired')}</option></select>
        <select value={licenseFilters.sort} onChange={(event) => setLicenseFilters((current) => ({ ...current, sort: event.target.value }))}><option value="issuedAt-desc">{t('licenses.newestFirst')}</option><option value="issuedAt-asc">{t('licenses.oldestFirst')}</option><option value="expiresAt-asc">{t('licenses.expirationSoonest')}</option><option value="expiresAt-desc">{t('licenses.expirationLatest')}</option></select>
        <button className="button" type="button" onClick={loadLicenses}>{t('common.apply')}</button>
      </div>
      <div className="split-panel">
        <div className="panel"><table className="table"><thead><tr><th>{t('common.customer')}</th><th>{t('common.licenseId')}</th><th>{t('common.plan')}</th><th>{t('common.issuedAt')}</th><th>{t('common.expires')}</th><th>{t('common.status')}</th></tr></thead><tbody>
          {licenses.map((item) => <tr key={item.id} onClick={() => openLicenseDetails(item.id)} className={selectedLicense?.id === item.id ? 'selected-row' : ''}><td>{item.customerName}</td><td>{item.licenseId}</td><td>{item.planCode}</td><td>{formatDateTime(item.issuedAt)}</td><td>{formatDateTime(item.expiresAt)}</td><td><span className={`status-pill ${item.statusTag}`}>{statusLabel(item.statusTag)}</span></td></tr>)}
        </tbody></table></div>
        <div className="panel detail-panel">{selectedLicense ? <>
          <div className="action-row"><button className="button" type="button" onClick={() => startRenew(selectedLicense)}>{t('licenses.renew')}</button><button className="button ghost" type="button" onClick={() => startReissue(selectedLicense)}>{t('licenses.reissue')}</button><button className="button ghost" type="button" onClick={() => handleCopy(selectedLicense.finalToken, 'licenses.copyToken')}>{t('licenses.copyToken')}</button></div>
          <div className="mini-stack">
            <div className="info-row"><span>{t('common.status')}</span><strong>{statusLabel(selectedLicense.lifecycleStatus || selectedLicense.statusTag)}</strong></div>
            <div className="info-row"><span>{t('licenses.daysRemaining')}</span><strong>{selectedLicense.daysRemaining ?? '-'}</strong></div>
            <div className="info-row"><span>{t('licenses.graceEnds')}</span><strong>{formatDateTime(selectedLicense.graceEndsAt)}</strong></div>
          </div>
          <div className="field"><label>{t('licenses.finalToken')}</label><textarea readOnly rows={6} value={selectedLicense.finalToken} /></div>
          <div className="field"><label>{t('licenses.payload')}</label><pre className="code-block">{JSON.stringify(selectedLicense.payload, null, 2)}</pre></div>
          <div className="field"><label>{t('licenses.history')}</label><ul className="history-list">{(selectedLicense.history || []).map((item) => <li key={item.id}><strong>{item.relationType}</strong><span>{item.licenseId}</span><small>{formatDateTime(item.createdAt)}</small></li>)}</ul></div>
        </> : <Notice tone="neutral">{t('licenses.noSelection')}</Notice>}</div>
      </div>
    </section>
  );
}
