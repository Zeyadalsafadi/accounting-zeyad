import { ModuleSelector, Notice } from '../components/Shared.jsx';

export default function IssueView({
  t, issueForm, setIssueForm, plans, modules, moduleLabel, issuePreview, issuedLicense,
  activeKey, busyIssueAction, setBusyIssueAction, setError, setSuccess,
  setIssuedLicense, setSelectedLicense, loadBootstrap, validateIssueForm,
  handleCopy, downloadText, api
}) {
  return (
    <section className="split-panel">
      <div className="panel">
        <h3>{issueForm.relationType === 'renewed' ? t('issue.renewTitle') : issueForm.relationType === 'reissued' ? t('issue.reissueTitle') : t('issue.title')}</h3>
        <div className="form-grid">
          <div className="field"><label>{t('common.customerName')}</label><input value={issueForm.customerName} onChange={(event) => setIssueForm((current) => ({ ...current, customerName: event.target.value }))} /></div>
          <div className="field"><label>{t('common.licenseId')}</label><input value={issueForm.licenseId} onChange={(event) => setIssueForm((current) => ({ ...current, licenseId: event.target.value }))} /></div>
          <div className="field"><label>{t('common.plan')}</label><select value={issueForm.planCode} onChange={(event) => {
            const template = plans.find((item) => item.code === event.target.value);
            setIssueForm((current) => ({ ...current, planCode: event.target.value, graceDays: template?.defaultGraceDays ?? current.graceDays, maxDevices: template?.maxDevices ?? current.maxDevices, enabledModules: template?.enabledModules || current.enabledModules }));
          }}>{plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.code} - {plan.name}</option>)}</select></div>
          <div className="field"><label>{t('common.issuedAt')}</label><input type="datetime-local" value={issueForm.issuedAt} onChange={(event) => setIssueForm((current) => ({ ...current, issuedAt: event.target.value }))} /></div>
          <div className="field"><label>{t('common.expiresAt')}</label><input type="datetime-local" value={issueForm.expiresAt} onChange={(event) => setIssueForm((current) => ({ ...current, expiresAt: event.target.value }))} /></div>
          <div className="field"><label>{t('common.graceDays')}</label><input type="number" min="0" value={issueForm.graceDays} onChange={(event) => setIssueForm((current) => ({ ...current, graceDays: Number(event.target.value) }))} /></div>
          <div className="field"><label>{t('common.maxDevices')}</label><input type="number" min="1" value={issueForm.maxDevices || ''} onChange={(event) => setIssueForm((current) => ({ ...current, maxDevices: Number(event.target.value) || null }))} /></div>
          <div className="field checkbox-field"><label><input type="checkbox" checked={issueForm.allowDuplicateLicenseId} onChange={(event) => setIssueForm((current) => ({ ...current, allowDuplicateLicenseId: event.target.checked }))} />{t('issue.allowDuplicateLicenseId')}</label></div>
        </div>
        <div className="field"><label>{t('common.enabledModules')}</label><ModuleSelector modules={modules} value={issueForm.enabledModules} onChange={(nextModules) => setIssueForm((current) => ({ ...current, enabledModules: nextModules }))} getLabel={moduleLabel} /></div>
        <div className="field"><label>{t('common.internalNotes')}</label><textarea rows={4} value={issueForm.notes} onChange={(event) => setIssueForm((current) => ({ ...current, notes: event.target.value }))} /></div>
        <div className="action-row">
          <button className="button" type="button" disabled={!activeKey?.hasPrivateKey || busyIssueAction} onClick={async () => {
            try {
              const validationError = validateIssueForm();
              if (validationError) {
                setError(validationError);
                return;
              }
              setBusyIssueAction(true);
              setError('');
              setSuccess('');
              const created = await api.issueLicense({ ...issueForm, issuedAt: new Date(issueForm.issuedAt).toISOString(), expiresAt: new Date(issueForm.expiresAt).toISOString() });
              setIssuedLicense(created);
              setSelectedLicense(created);
              setSuccess(t('notices.licenseIssued', { licenseId: created.licenseId }));
              await loadBootstrap(true);
            } catch (requestError) {
              setError(requestError.message);
            } finally {
              setBusyIssueAction(false);
            }
          }}>{busyIssueAction ? t('issue.issuing') : t('issue.issueLicense')}</button>
          <button className="button ghost" type="button" onClick={async () => {
            try {
              setError('');
              const nextId = (await api.getNextLicenseId()).licenseId;
              setIssueForm((current) => ({ ...current, licenseId: nextId }));
            } catch (requestError) {
              setError(requestError.message);
            }
          }}>{t('issue.generateLicenseId')}</button>
        </div>
      </div>
      <div className="panel">
        <h3>{t('issue.payloadPreview')}</h3>
        <pre className="code-block">{JSON.stringify(issuePreview, null, 2)}</pre>
        {issuedLicense ? <>
          <h3>{t('issue.issuedToken')}</h3>
          <textarea readOnly rows={8} value={issuedLicense.finalToken} />
          <div className="action-row">
            <button className="button" type="button" onClick={() => handleCopy(issuedLicense.finalToken, 'issue.copyToken')}>{t('issue.copyToken')}</button>
            <button className="button ghost" type="button" onClick={() => downloadText(`${issuedLicense.licenseId}.txt`, issuedLicense.finalToken)}>{t('issue.exportToken')}</button>
            <button className="button ghost" type="button" onClick={() => downloadText(`${issuedLicense.licenseId}.json`, JSON.stringify(issuedLicense, null, 2))}>{t('issue.exportRecord')}</button>
          </div>
        </> : <Notice tone="neutral">{t('issue.issueNotice')}</Notice>}
      </div>
    </section>
  );
}
