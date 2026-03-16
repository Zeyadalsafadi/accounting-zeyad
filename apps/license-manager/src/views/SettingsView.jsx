import { ModuleSelector } from '../components/Shared.jsx';

export default function SettingsView({
  t, settingsForm, setSettingsForm, modules, moduleLabel, busySettingsAction,
  setBusySettingsAction, setError, setSuccess, loadBootstrap, api, bootstrap
}) {
  return (
    <section className="page-grid">
      <div className="panel"><div className="form-grid">
        <div className="field"><label>{t('settings.keyStoragePath')}</label><input value={settingsForm.keyStoragePath} onChange={(event) => setSettingsForm((current) => ({ ...current, keyStoragePath: event.target.value }))} placeholder={bootstrap?.settings?.defaultKeyStoragePath} /></div>
        <div className="field"><label>{t('settings.defaultGraceDays')}</label><input type="number" min="0" value={settingsForm.defaultGraceDays} onChange={(event) => setSettingsForm((current) => ({ ...current, defaultGraceDays: Number(event.target.value) }))} /></div>
        <div className="field"><label>{t('settings.expiringSoonThreshold')}</label><input type="number" min="1" value={settingsForm.expiringSoonDays} onChange={(event) => setSettingsForm((current) => ({ ...current, expiringSoonDays: Number(event.target.value) }))} /></div>
        <div className="field"><label>{t('settings.licenseIdPrefix')}</label><input value={settingsForm.licenseIdPrefix} onChange={(event) => setSettingsForm((current) => ({ ...current, licenseIdPrefix: event.target.value.toUpperCase() }))} /></div>
      </div></div>
      <div className="panel"><div className="action-row"><button className="button ghost" type="button" onClick={() => setSettingsForm((current) => ({ ...current, planTemplates: [...current.planTemplates, { code: 'NEW', name: 'New Plan', defaultGraceDays: current.defaultGraceDays, maxDevices: 1, enabledModules: [] }] }))}>{t('settings.addPlan')}</button></div>
        <div className="plan-list">{settingsForm.planTemplates.map((plan, index) => <div key={`${plan.code}-${index}`} className="panel"><div className="form-grid">
          <div className="field"><label>{t('common.code')}</label><input value={plan.code} onChange={(event) => setSettingsForm((current) => ({ ...current, planTemplates: current.planTemplates.map((item, itemIndex) => itemIndex === index ? { ...item, code: event.target.value.toUpperCase() } : item) }))} /></div>
          <div className="field"><label>{t('common.name')}</label><input value={plan.name} onChange={(event) => setSettingsForm((current) => ({ ...current, planTemplates: current.planTemplates.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} /></div>
          <div className="field"><label>{t('settings.defaultGraceDays')}</label><input type="number" min="0" value={plan.defaultGraceDays} onChange={(event) => setSettingsForm((current) => ({ ...current, planTemplates: current.planTemplates.map((item, itemIndex) => itemIndex === index ? { ...item, defaultGraceDays: Number(event.target.value) } : item) }))} /></div>
          <div className="field"><label>{t('common.maxDevices')}</label><input type="number" min="1" value={plan.maxDevices || ''} onChange={(event) => setSettingsForm((current) => ({ ...current, planTemplates: current.planTemplates.map((item, itemIndex) => itemIndex === index ? { ...item, maxDevices: Number(event.target.value) || null } : item) }))} /></div>
        </div><ModuleSelector modules={modules} value={plan.enabledModules} onChange={(nextModules) => setSettingsForm((current) => ({ ...current, planTemplates: current.planTemplates.map((item, itemIndex) => itemIndex === index ? { ...item, enabledModules: nextModules } : item) }))} getLabel={moduleLabel} /><button className="button danger" type="button" onClick={() => setSettingsForm((current) => ({ ...current, planTemplates: current.planTemplates.filter((_, itemIndex) => itemIndex !== index) }))}>{t('settings.removePlan')}</button></div>)}</div>
      </div>
      <div className="action-row"><button className="button" type="button" disabled={busySettingsAction} onClick={async () => {
        try {
          setBusySettingsAction(true);
          setError('');
          setSuccess('');
          const updated = await api.saveSettings(settingsForm);
          setSettingsForm({ keyStoragePath: updated.keyStoragePath, defaultGraceDays: updated.defaultGraceDays, expiringSoonDays: updated.expiringSoonDays, licenseIdPrefix: updated.licenseIdPrefix, planTemplates: updated.planTemplates });
          setSuccess(t('notices.settingsSaved'));
          await loadBootstrap(true);
        } catch (requestError) {
          setError(requestError.message);
        } finally {
          setBusySettingsAction(false);
        }
      }}>{busySettingsAction ? t('settings.saving') : t('settings.saveSettings')}</button></div>
    </section>
  );
}
