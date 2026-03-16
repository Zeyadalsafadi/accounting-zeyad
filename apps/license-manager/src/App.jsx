import { useEffect, useMemo, useState } from 'react';
import { api } from './services/api.js';
import { createTranslator, LANGUAGE_OPTIONS } from './i18n.js';
import { Notice } from './components/Shared.jsx';
import DashboardView from './views/DashboardView.jsx';
import KeysView from './views/KeysView.jsx';
import IssueView from './views/IssueView.jsx';
import LicensesView from './views/LicensesView.jsx';
import ValidateView from './views/ValidateView.jsx';
import SettingsView from './views/SettingsView.jsx';
import HelpView from './views/HelpView.jsx';

const VIEWS = ['dashboard', 'keys', 'issue', 'licenses', 'validate', 'settings', 'help'];
const LANGUAGE_STORAGE_KEY = 'license-manager-language';

function emptyIssueForm(defaults = {}) {
  return {
    customerName: '',
    licenseId: defaults.licenseId || '',
    planCode: defaults.planCode || 'STANDARD',
    issuedAt: defaults.issuedAt || new Date().toISOString().slice(0, 16),
    expiresAt: defaults.expiresAt || '',
    graceDays: defaults.graceDays ?? 7,
    maxDevices: defaults.maxDevices ?? 1,
    enabledModules: defaults.enabledModules || [],
    notes: defaults.notes || '',
    relationType: defaults.relationType || 'issued',
    parentLicenseRecordId: defaults.parentLicenseRecordId || null,
    allowDuplicateLicenseId: Boolean(defaults.allowDuplicateLicenseId)
  };
}

function getInitialPlan(data) {
  return (data.settings.planTemplates || []).find((item) => item.code === 'STANDARD') || data.settings.planTemplates?.[0];
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function downloadText(filename, contents) {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'ar');
  const [view, setView] = useState('dashboard');
  const [bootstrap, setBootstrap] = useState(null);
  const [licenses, setLicenses] = useState([]);
  const [selectedLicense, setSelectedLicense] = useState(null);
  const [settingsForm, setSettingsForm] = useState(null);
  const [issueForm, setIssueForm] = useState(emptyIssueForm());
  const [issuedLicense, setIssuedLicense] = useState(null);
  const [importForm, setImportForm] = useState({ label: 'Imported Key', privateKeyPem: '', publicKeyPem: '' });
  const [keyLabel, setKeyLabel] = useState('Owner Signing Key');
  const [revealedPrivateKey, setRevealedPrivateKey] = useState('');
  const [licenseFilters, setLicenseFilters] = useState({ q: '', planCode: '', statusTag: '', sort: 'issuedAt-desc' });
  const [validationToken, setValidationToken] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyKeyAction, setBusyKeyAction] = useState(false);
  const [busyIssueAction, setBusyIssueAction] = useState(false);
  const [busySettingsAction, setBusySettingsAction] = useState(false);

  const { t, dir } = useMemo(() => createTranslator(language), [language]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [language, dir]);

  const activeKey = bootstrap?.keyInfo?.activeKey || null;
  const plans = bootstrap?.settings?.planTemplates || [];
  const modules = bootstrap?.availableModules || [];
  const dashboard = bootstrap?.dashboard || {};

  const issuePreview = useMemo(() => ({
    licenseId: issueForm.licenseId,
    customerName: issueForm.customerName,
    planCode: issueForm.planCode,
    issuedAt: issueForm.issuedAt ? new Date(issueForm.issuedAt).toISOString() : null,
    expiresAt: issueForm.expiresAt ? new Date(issueForm.expiresAt).toISOString() : null,
    graceDays: Number(issueForm.graceDays || 0),
    maxDevices: Number(issueForm.maxDevices || 0) || null,
    enabledModules: issueForm.enabledModules,
    metadata: { notes: issueForm.notes }
  }), [issueForm]);

  function viewLabel(key) {
    return t(`views.${key}`);
  }

  function statusLabel(value) {
    return t(`statuses.${value}`);
  }

  function moduleLabel(module) {
    return t(`modules.${module.value}`) || module.label;
  }

  async function loadBootstrap(keepIssue = false) {
    setLoading(true);
    try {
      const data = await api.getBootstrap();
      setBootstrap(data);
      setLicenses(data.licenses || []);
      setSettingsForm({
        keyStoragePath: data.settings.keyStoragePath || '',
        defaultGraceDays: data.settings.defaultGraceDays,
        expiringSoonDays: data.settings.expiringSoonDays,
        licenseIdPrefix: data.settings.licenseIdPrefix,
        planTemplates: data.settings.planTemplates || []
      });
      if (!keepIssue) {
        const plan = getInitialPlan(data);
        setIssueForm(emptyIssueForm({
          licenseId: data.nextLicenseId,
          planCode: plan?.code || 'STANDARD',
          graceDays: plan?.defaultGraceDays ?? data.settings.defaultGraceDays,
          maxDevices: plan?.maxDevices ?? 1,
          enabledModules: plan?.enabledModules || []
        }));
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadLicenses() {
    try {
      setLicenses(await api.getLicenses(licenseFilters));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => {
    loadBootstrap();
  }, []);

  useEffect(() => {
    if (bootstrap) {
      loadLicenses();
    }
  }, [licenseFilters.q, licenseFilters.planCode, licenseFilters.statusTag, licenseFilters.sort]);

  function validateIssueForm() {
    if (!issueForm.customerName.trim()) return t('validation.customerNameRequired');
    if (!issueForm.licenseId.trim()) return t('validation.licenseIdRequired');
    if (!issueForm.planCode.trim()) return t('validation.planRequired');
    if (!issueForm.expiresAt) return t('validation.expirationRequired');
    if ((issueForm.enabledModules || []).length === 0) return t('validation.atLeastOneModule');
    const issuedAt = new Date(issueForm.issuedAt);
    const expiresAt = new Date(issueForm.expiresAt);
    if (Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) return t('validation.invalidDates');
    if (expiresAt.getTime() < issuedAt.getTime()) return t('validation.expirationBeforeIssue');
    return '';
  }

  async function handleCopy(value, labelKey) {
    const label = t(labelKey);
    try {
      await navigator.clipboard.writeText(value);
      setSuccess(t('notices.copied', { label }));
      setError('');
    } catch {
      setError(t('notices.copyFailed', { label }));
    }
  }

  async function openLicenseDetails(id) {
    try {
      setError('');
      setSelectedLicense(await api.getLicenseDetails(id));
      setView('licenses');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function startRenew(record) {
    try {
      setIssuedLicense(null);
      setError('');
      const nextId = (await api.getNextLicenseId()).licenseId;
      setIssueForm(emptyIssueForm({
        customerName: record.customerName,
        licenseId: nextId,
        planCode: record.planCode,
        issuedAt: new Date().toISOString().slice(0, 16),
        expiresAt: record.expiresAt.slice(0, 16),
        graceDays: record.graceDays,
        maxDevices: record.maxDevices || 1,
        enabledModules: record.enabledModules,
        notes: record.notes,
        relationType: 'renewed',
        parentLicenseRecordId: record.id
      }));
      setView('issue');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function startReissue(record) {
    setIssuedLicense(null);
    setIssueForm(emptyIssueForm({
      customerName: record.customerName,
      licenseId: record.licenseId,
      planCode: record.planCode,
      issuedAt: new Date().toISOString().slice(0, 16),
      expiresAt: record.expiresAt.slice(0, 16),
      graceDays: record.graceDays,
      maxDevices: record.maxDevices || 1,
      enabledModules: record.enabledModules,
      notes: record.notes,
      relationType: 'reissued',
      parentLicenseRecordId: record.id,
      allowDuplicateLicenseId: true
    }));
    setView('issue');
  }

  if (loading && !bootstrap) {
    return <div className="screen-loading">{viewLabel('dashboard')}...</div>;
  }

  return (
    <div className="manager-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">{t('brand.localOwnerUtility')}</p>
          <h1>{t('brand.title')}</h1>
          <p className="brand-subtitle">{t('brand.subtitle')}</p>
        </div>
        <nav className="nav-stack">
          {VIEWS.map((item) => (
            <button key={item} type="button" className={`nav-item ${view === item ? 'active' : ''}`} onClick={() => setView(item)}>
              {viewLabel(item)}
            </button>
          ))}
        </nav>
        <div className="sidebar-card">
          <span>{t('sidebar.signingKey')}</span>
          <strong>{activeKey?.hasPrivateKey ? t('sidebar.readyToIssue') : activeKey ? t('sidebar.publicOnlyLoaded') : t('sidebar.notConfigured')}</strong>
          <small>{activeKey?.publicKeyFingerprint ? activeKey.publicKeyFingerprint.slice(0, 16) : t('sidebar.generateOrImportFirst')}</small>
        </div>
      </aside>
      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">{t('brand.ownerWorkflow')}</p>
            <h2>{viewLabel(view)}</h2>
          </div>
          <div className="header-actions">
            <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="language">
              {LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button className="button ghost" type="button" onClick={() => loadBootstrap(true)}>{t('header.refresh')}</button>
            {issuedLicense?.finalToken ? <button className="button" type="button" onClick={() => handleCopy(issuedLicense.finalToken, 'issue.copyToken')}>{t('header.copyLastToken')}</button> : null}
          </div>
        </header>

        <Notice tone="danger">{error}</Notice>
        <Notice tone="success">{success}</Notice>

        {view === 'dashboard' ? <DashboardView t={t} dashboard={dashboard} activeKey={activeKey} bootstrap={bootstrap} formatDateTime={formatDateTime} openLicenseDetails={openLicenseDetails} statusLabel={statusLabel} /> : null}
        {view === 'keys' ? <KeysView t={t} activeKey={activeKey} keyLabel={keyLabel} setKeyLabel={setKeyLabel} importForm={importForm} setImportForm={setImportForm} revealedPrivateKey={revealedPrivateKey} busyKeyAction={busyKeyAction} setBusyKeyAction={setBusyKeyAction} setError={setError} setSuccess={setSuccess} setRevealedPrivateKey={setRevealedPrivateKey} loadBootstrap={loadBootstrap} handleCopy={handleCopy} downloadText={downloadText} api={api} /> : null}
        {view === 'issue' ? <IssueView t={t} issueForm={issueForm} setIssueForm={setIssueForm} plans={plans} modules={modules} moduleLabel={moduleLabel} issuePreview={issuePreview} issuedLicense={issuedLicense} activeKey={activeKey} busyIssueAction={busyIssueAction} setBusyIssueAction={setBusyIssueAction} setError={setError} setSuccess={setSuccess} setIssuedLicense={setIssuedLicense} setSelectedLicense={setSelectedLicense} loadBootstrap={loadBootstrap} validateIssueForm={validateIssueForm} handleCopy={handleCopy} downloadText={downloadText} api={api} /> : null}
        {view === 'licenses' ? <LicensesView t={t} licenses={licenses} selectedLicense={selectedLicense} licenseFilters={licenseFilters} setLicenseFilters={setLicenseFilters} plans={plans} statusLabel={statusLabel} formatDateTime={formatDateTime} openLicenseDetails={openLicenseDetails} startRenew={startRenew} startReissue={startReissue} handleCopy={handleCopy} loadLicenses={loadLicenses} /> : null}
        {view === 'validate' ? <ValidateView t={t} validationToken={validationToken} setValidationToken={setValidationToken} validationResult={validationResult} setValidationResult={setValidationResult} setError={setError} formatDateTime={formatDateTime} statusLabel={statusLabel} api={api} /> : null}
        {view === 'settings' && settingsForm ? <SettingsView t={t} settingsForm={settingsForm} setSettingsForm={setSettingsForm} modules={modules} moduleLabel={moduleLabel} busySettingsAction={busySettingsAction} setBusySettingsAction={setBusySettingsAction} setError={setError} setSuccess={setSuccess} loadBootstrap={loadBootstrap} api={api} bootstrap={bootstrap} /> : null}
        {view === 'help' ? <HelpView t={t} /> : null}
      </main>
    </div>
  );
}
