import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ALL_USER_ROLES, PERMISSIONS } from '@paint-shop/shared';
import api from '../services/api.js';
import { ROLE_LABEL_KEYS } from '../constants/app.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { getCurrentUser, hasPermission, saveLicenseStatus } from '../utils/auth.js';
import { buildDatasetTemplateRows, getDatasetSchema, parseCsv, rowsToCsv } from '../utils/dataTransfer.js';
import ContextGuide from '../components/ContextGuide.jsx';

const TAB_OPTIONS = [
  { key: 'general', labelKey: 'generalSettings' },
  { key: 'license', labelKey: 'licenseManagement' },
  { key: 'users', labelKey: 'userManagement' },
  { key: 'roles', labelKey: 'rolesPermissions' },
  { key: 'data', labelKey: 'dataManagement' },
  { key: 'security', labelKey: 'securityAudit' },
  { key: 'yearEnd', labelKey: 'yearEndReset' }
];

const initialUserForm = {
  id: null,
  username: '',
  fullName: '',
  accessRole: 'CASHIER',
  phone: '',
  email: '',
  notes: '',
  isActive: true,
  password: '',
  confirmPassword: ''
};

function groupPermissions(permissionGroups) {
  return Object.entries(permissionGroups || {}).sort(([a], [b]) => a.localeCompare(b));
}

export default function SettingsPage() {
  const { t } = useI18n();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultTab = location.pathname === '/users' ? 'users' : 'general';
  const activeTab = searchParams.get('tab') || defaultTab;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [generalDefinitions, setGeneralDefinitions] = useState([]);
  const [generalValues, setGeneralValues] = useState({});
  const [licenseData, setLicenseData] = useState(null);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [users, setUsers] = useState([]);
  const [rolesData, setRolesData] = useState({ roles: [], permissionGroups: {} });
  const [dataManagement, setDataManagement] = useState(null);
  const [auditRows, setAuditRows] = useState([]);
  const [diagnostics, setDiagnostics] = useState(null);
  const [auditFilters, setAuditFilters] = useState({ q: '', entity: '', action: '' });
  const [userForm, setUserForm] = useState(initialUserForm);
  const [selectedRole, setSelectedRole] = useState('ADMIN');
  const [selectedRolePermissions, setSelectedRolePermissions] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUserOverrides, setSelectedUserOverrides] = useState({});
  const [resetPassword, setResetPassword] = useState('');
  const [yearEndData, setYearEndData] = useState(null);
  const [yearEndWorkflow, setYearEndWorkflow] = useState('ARCHIVE_RESET');
  const [yearEndWizardStep, setYearEndWizardStep] = useState(1);
  const [yearEndExecutionResult, setYearEndExecutionResult] = useState(null);
  const [yearEndExecuting, setYearEndExecuting] = useState(false);
  const [yearEndExecutionPhase, setYearEndExecutionPhase] = useState('');
  const [yearEndMode, setYearEndMode] = useState('FULL_RESET');
  const [yearEndPassword, setYearEndPassword] = useState('');
  const [yearEndPhrase, setYearEndPhrase] = useState('');
  const [yearEndSourceYear, setYearEndSourceYear] = useState('');
  const [yearEndTargetYear, setYearEndTargetYear] = useState('');
  const [restoreArchiveId, setRestoreArchiveId] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restorePhrase, setRestorePhrase] = useState('');
  const [selectedDataset, setSelectedDataset] = useState('categories');
  const [selectedDataFormat, setSelectedDataFormat] = useState('json');
  const [importPayloadText, setImportPayloadText] = useState('');
  const [backupSettingsForm, setBackupSettingsForm] = useState({
    autoBackupEnabled: false,
    intervalDays: 7,
    retentionCount: 10
  });
  const currentUser = getCurrentUser();
  const canManageSettings = hasPermission(currentUser, PERMISSIONS.SETTINGS_MANAGE);
  const canUseYearEnd = hasPermission(currentUser, PERMISSIONS.SETTINGS_YEAR_END);
  const canManageData = canManageSettings;
  const visibleTabs = TAB_OPTIONS.filter((tab) => {
    if (tab.key === 'yearEnd') return canUseYearEnd;
    if (tab.key === 'data') return canManageData;
    return true;
  });

  const permissionGroups = useMemo(
    () => groupPermissions(rolesData.permissionGroups),
    [rolesData.permissionGroups]
  );

  const selectedUser = useMemo(
    () => users.find((item) => Number(item.id) === Number(selectedUserId)) || null,
    [users, selectedUserId]
  );

  const roleLabel = (roleKey) => t(ROLE_LABEL_KEYS[roleKey] || roleKey);
  const generalDefinitionLabel = (definition) => {
    const labelMap = {
      COMPANY_NAME: 'settingCompanyName',
      COMPANY_LOGO_URL: 'settingCompanyLogoUrl',
      DEFAULT_CURRENCY: 'settingDefaultCurrency',
      LANGUAGE: 'settingLanguage',
      DATE_FORMAT: 'settingDateFormat',
      INVOICE_HEADER_TEXT: 'settingInvoiceHeader',
      INVOICE_FOOTER_TEXT: 'settingInvoiceFooter',
      EXCHANGE_RATE_DEFAULT_MODE: 'settingExchangeRateMode'
    };
    return t(labelMap[definition.key] || definition.label);
  };
  const permissionGroupLabel = (moduleName) => {
    const map = {
      inventory: 'permissionGroupInventory',
      customers: 'permissionGroupCustomers',
      suppliers: 'permissionGroupSuppliers',
      sales: 'permissionGroupSales',
      purchases: 'permissionGroupPurchases',
      expenses: 'permissionGroupExpenses',
      reports: 'permissionGroupReports',
      'exchange-rate': 'permissionGroupExchangeRate',
      'currency-exchange': 'permissionGroupCurrencyExchange',
      settings: 'permissionGroupSettings',
      users: 'permissionGroupUsers'
    };
    return t(map[moduleName] || moduleName);
  };
  const permissionLabel = (permission) => t(`permission.${permission.key}`) || permission.label;
  const yearEndModeLabel = (modeKey) => {
    if (modeKey === 'FULL_RESET') return t('archiveAndReset');
    if (modeKey === 'CARRY_FORWARD') return t('archiveResetCarryForward');
    return modeKey;
  };
  const formatCarrySummary = (summaryJson) => {
    if (!summaryJson) return '-';
    try {
      const summary = typeof summaryJson === 'string' ? JSON.parse(summaryJson) : summaryJson;
      const parts = [
        `${t('customers')}: ${summary.customersCarried ?? 0}`,
        `${t('suppliers')}: ${summary.suppliersCarried ?? 0}`,
        `${t('cashbox')}: ${summary.cashAccountsCarried ?? 0}`
      ];
      if (summary.inventoryProductsCarried != null) {
        parts.push(`${t('productsManagement')}: ${summary.inventoryProductsCarried}`);
      }
      return parts.join(' | ');
    } catch {
      return String(summaryJson);
    }
  };
  const formatAuditMetadata = (metadataJson) => {
    if (!metadataJson) return '-';
    try {
      const parsed = typeof metadataJson === 'string' ? JSON.parse(metadataJson) : metadataJson;
      return Object.entries(parsed).slice(0, 3).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join(' | ');
    } catch {
      return String(metadataJson);
    }
  };
  const parseAuditMetadata = (metadataJson) => {
    if (!metadataJson) return null;
    try {
      return typeof metadataJson === 'string' ? JSON.parse(metadataJson) : metadataJson;
    } catch {
      return null;
    }
  };
  const formatLicenseDate = (value) => value || '-';
  const licenseStatusLabel = (status) => {
    const map = {
      ACTIVE: 'licenseStatusActive',
      GRACE: 'licenseStatusGrace',
      EXPIRED: 'licenseStatusExpired',
      MISSING: 'licenseStatusMissing',
      INVALID: 'licenseStatusInvalid',
      UNCONFIGURED: 'licenseStatusUnconfigured'
    };
    return t(map[status] || 'licenseStatusUnknown');
  };
  const licenseStatusTone = (status) => {
    if (status === 'ACTIVE') return 'summary-success';
    if (status === 'GRACE') return 'summary-warning';
    return 'summary-danger';
  };
  const enforcementLabel = (mode) => (mode === 'strict' ? t('licenseEnforcementStrict') : t('licenseEnforcementOff'));
  const licenseVerificationLabel = (configured) => configured ? t('licenseVerificationConfigured') : t('licenseVerificationMissing');
  const licenseWriteLabel = (allowed) => allowed ? t('licenseWritesAllowed') : t('licenseWritesBlocked');
  const exportDiagnosticsReport = async () => {
    setError('');
    try {
      const res = await api.get('/settings/diagnostics/export');
      const payload = res.data.data || diagnostics || {};
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `accounting-diagnostics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || t('exportDiagnosticsFailed'));
    }
  };
  const diagnosticRouteMap = {
    customerBalances: '/customers',
    supplierBalances: '/suppliers',
    salesInvoices: '/sales',
    purchaseInvoices: '/purchases',
    expenses: '/expenses',
    inventory: '/products',
    cashAccounts: '/cash-management'
  };
  const severityLabel = (severity) => {
    if (severity === 'high') return t('severityHigh');
    if (severity === 'medium') return t('severityMedium');
    if (severity === 'low') return t('severityLow');
    return t('diagnosticsHealthy');
  };
  const selectedRestoreArchive = useMemo(
    () => (yearEndData?.archives || []).find((archive) => archive.archiveId === restoreArchiveId) || null,
    [yearEndData?.archives, restoreArchiveId]
  );
  const yearEndWorkflowOptions = [
    {
      key: 'ARCHIVE_RESET',
      title: t('archiveAndReset'),
      description: t('yearEndWorkflowArchiveReset')
    },
    {
      key: 'ARCHIVE_RESET_CARRY_FORWARD',
      title: t('archiveResetCarryForward'),
      description: t('yearEndWorkflowArchiveCarry')
    },
    {
      key: 'RESTORE_ARCHIVE',
      title: t('restoreArchive'),
      description: t('yearEndWorkflowRestore')
    }
  ];
  const resetYearEndWizard = () => {
    setYearEndWizardStep(1);
    setYearEndExecutionResult(null);
    setYearEndExecuting(false);
    setYearEndExecutionPhase('');
    setYearEndPassword('');
    setYearEndPhrase('');
    setYearEndSourceYear('');
    setYearEndTargetYear('');
    setRestorePassword('');
    setRestorePhrase('');
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [generalRes, licenseRes, usersRes, rolesRes, auditRes, diagnosticsRes] = await Promise.all([
        api.get('/settings/general'),
        api.get('/settings/license'),
        api.get('/users'),
        api.get('/settings/roles'),
        api.get('/settings/audit'),
        api.get('/settings/diagnostics')
      ]);

      setGeneralDefinitions(generalRes.data.data?.definitions || []);
      setGeneralValues(generalRes.data.data?.values || {});
      setLicenseData(licenseRes.data.data || null);
      saveLicenseStatus(licenseRes.data.data || null);
      setUsers(usersRes.data.data || []);
      setRolesData(rolesRes.data.data || { roles: [], permissionGroups: {} });
      setAuditRows(auditRes.data.data || []);
      setDiagnostics(diagnosticsRes.data.data || null);

      if (canManageData) {
        const dataRes = await api.get('/settings/data-management');
        setDataManagement(dataRes.data.data || null);
        setBackupSettingsForm(dataRes.data.data?.settings || {
          autoBackupEnabled: false,
          intervalDays: 7,
          retentionCount: 10
        });
      }

      const firstRole = rolesRes.data.data?.roles?.[0]?.roleKey || 'ADMIN';
      setSelectedRole((current) => current || firstRole);
      const currentRole = (rolesRes.data.data?.roles || []).find((item) => item.roleKey === (selectedRole || firstRole));
      setSelectedRolePermissions(currentRole?.permissions || []);

      if (canUseYearEnd) {
        const yearEndRes = await api.get('/settings/year-end');
        setYearEndData(yearEndRes.data.data || null);
        setRestoreArchiveId(yearEndRes.data.data?.archives?.[0]?.archiveId || '');
      }
    } catch (err) {
      setError(err.response?.data?.error || t('loadingAdminFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadAuditAndDiagnostics = async () => {
    setError('');
    try {
      const [auditRes, diagnosticsRes] = await Promise.all([
        api.get('/settings/audit', {
          params: {
            q: auditFilters.q || undefined,
            entity: auditFilters.entity || undefined,
            action: auditFilters.action || undefined
          }
        }),
        api.get('/settings/diagnostics')
      ]);
      setAuditRows(auditRes.data.data || []);
      setDiagnostics(diagnosticsRes.data.data || null);
    } catch (err) {
      setError(err.response?.data?.error || t('loadingAdminFailed'));
    }
  };

  const loadDataManagement = async () => {
    if (!canManageData) return;
    try {
      const res = await api.get('/settings/data-management');
      setDataManagement(res.data.data || null);
      setBackupSettingsForm(res.data.data?.settings || {
        autoBackupEnabled: false,
        intervalDays: 7,
        retentionCount: 10
      });
    } catch (err) {
      setError(err.response?.data?.error || t('loadingAdminFailed'));
    }
  };

  const loadLicenseStatus = async () => {
    try {
      const res = await api.get('/settings/license');
      setLicenseData(res.data.data || null);
      saveLicenseStatus(res.data.data || null);
    } catch (err) {
      setError(err.response?.data?.error || t('loadingAdminFailed'));
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const role = rolesData.roles.find((item) => item.roleKey === selectedRole);
    setSelectedRolePermissions(role?.permissions || []);
  }, [selectedRole, rolesData.roles]);

  useEffect(() => {
    if (!selectedUserId) return;
    api.get(`/users/${selectedUserId}/permissions`)
      .then((res) => {
        const overridesMap = {};
        for (const item of res.data.data?.overrides || []) {
          overridesMap[item.permissionKey] = item.isAllowed ? 'allow' : 'deny';
        }
        setSelectedUserOverrides(overridesMap);
      })
      .catch((err) => setError(err.response?.data?.error || t('loadingUserPermissionsFailed')));
  }, [selectedUserId]);

  const activateTab = (tabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabKey);
    setSearchParams(next);
    setSuccess('');
    setError('');
    if (tabKey === 'yearEnd') {
      resetYearEndWizard();
    }
  };

  const saveGeneral = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const payload = {};
      for (const definition of generalDefinitions) {
        payload[definition.key] = generalValues[definition.key] ?? '';
      }
      const res = await api.patch('/settings/general', { values: payload });
      setGeneralValues(res.data.data || generalValues);
      setSuccess(t('generalSaved'));
    } catch (err) {
      setError(err.response?.data?.error || t('generalSaveFailed'));
    }
  };

  const submitLicenseKey = async () => {
    if (!licenseKeyInput.trim()) {
      setError(t('licenseKeyRequired'));
      return;
    }

    setError('');
    setSuccess('');
    try {
      const res = await api.post('/settings/license', { licenseKey: licenseKeyInput.trim() });
      setLicenseData(res.data.data || null);
      saveLicenseStatus(res.data.data || null);
      setLicenseKeyInput('');
      setSuccess(t('licenseActivated'));
    } catch (err) {
      setError(err.response?.data?.error || t('licenseActivationFailed'));
    }
  };

  const clearLicenseKey = async () => {
    setError('');
    setSuccess('');
    try {
      const res = await api.delete('/settings/license');
      setLicenseData(res.data.data || null);
      saveLicenseStatus(res.data.data || null);
      setLicenseKeyInput('');
      setSuccess(t('licenseCleared'));
    } catch (err) {
      setError(err.response?.data?.error || t('licenseClearFailed'));
    }
  };

  const removeLicenseDevice = async (deviceId) => {
    setError('');
    setSuccess('');
    try {
      const res = await api.delete(`/settings/license/devices/${encodeURIComponent(deviceId)}`);
      setLicenseData(res.data.data || null);
      saveLicenseStatus(res.data.data || null);
      setSuccess(t('deviceRemoved'));
    } catch (err) {
      setError(err.response?.data?.error || t('deviceRemoveFailed'));
    }
  };

  const saveUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (userForm.password !== userForm.confirmPassword) {
      setError(t('passwordConfirmMismatch'));
      return;
    }

    const payload = {
      username: userForm.username,
      fullName: userForm.fullName,
      accessRole: userForm.accessRole,
      phone: userForm.phone,
      email: userForm.email,
      notes: userForm.notes,
      isActive: userForm.isActive
    };

    if (userForm.password) payload.password = userForm.password;

    try {
      if (userForm.id) {
        await api.patch(`/users/${userForm.id}`, payload);
        setSuccess(t('userUpdated'));
      } else {
        await api.post('/users', { ...payload, password: userForm.password });
        setSuccess(t('userCreated'));
      }
      setUserForm(initialUserForm);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || t('userSaveFailed'));
    }
  };

  const startEditUser = (user) => {
    setUserForm({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      accessRole: user.role,
      phone: user.phone || '',
      email: user.email || '',
      notes: user.notes || '',
      isActive: !!user.isActive,
      password: '',
      confirmPassword: ''
    });
    setSelectedUserId(user.id);
    activateTab('users');
  };

  const submitPasswordReset = async () => {
    if (!selectedUserId) {
      setError(t('selectUserFirst'));
      return;
    }
    if (resetPassword.length < 6) {
      setError(t('passwordMinLength'));
      return;
    }

    setError('');
    setSuccess('');
    try {
      await api.post(`/users/${selectedUserId}/reset-password`, { password: resetPassword });
      setResetPassword('');
      setSuccess(t('passwordResetDone'));
    } catch (err) {
      setError(err.response?.data?.error || t('passwordResetFailed'));
    }
  };

  const toggleRolePermission = (permissionKey) => {
    setSelectedRolePermissions((current) => current.includes(permissionKey)
      ? current.filter((item) => item !== permissionKey)
      : [...current, permissionKey]
    );
  };

  const saveRolePermissions = async () => {
    setError('');
    setSuccess('');
    try {
      await api.patch(`/settings/roles/${selectedRole}`, { permissions: selectedRolePermissions });
      setSuccess(t('rolePermissionsSaved'));
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || t('rolePermissionsFailed'));
    }
  };

  const saveUserOverrides = async () => {
    if (!selectedUserId) {
      setError(t('selectUserFirst'));
      return;
    }

    const overrides = Object.entries(selectedUserOverrides).map(([permissionKey, mode]) => ({
      permissionKey,
      mode
    }));

    setError('');
    setSuccess('');
    try {
      await api.patch(`/users/${selectedUserId}/permissions`, { overrides });
      setSuccess(t('userOverridesSaved'));
    } catch (err) {
      setError(err.response?.data?.error || t('userOverridesFailed'));
    }
  };

  const runYearEndReset = async (modeOverride = yearEndMode) => {
    if (modeOverride === 'CARRY_FORWARD' && !yearEndTargetYear) {
      setError(t('targetYearRequired'));
      return;
    }

    setError('');
    setSuccess('');
    setYearEndExecuting(true);
    setYearEndExecutionPhase(
      modeOverride === 'CARRY_FORWARD'
        ? t('yearEndPhaseArchiveResetCarry')
        : t('yearEndPhaseArchiveReset')
    );
    try {
      const endpoint = modeOverride === 'CARRY_FORWARD'
        ? '/settings/year-end/archive-reset-carry-forward'
        : '/settings/year-end/archive-reset';
      const payload = {
        mode: modeOverride,
        password: yearEndPassword,
        confirmationPhrase: yearEndPhrase
      };

      if (modeOverride === 'CARRY_FORWARD') {
        payload.sourceYear = yearEndSourceYear;
        payload.targetYear = yearEndTargetYear;
      }

      const res = await api.post(endpoint, payload);
      setYearEndPassword('');
      setYearEndPhrase('');
      setYearEndSourceYear('');
      setYearEndTargetYear('');
      setYearEndExecutionResult({
        workflow: modeOverride === 'CARRY_FORWARD' ? 'ARCHIVE_RESET_CARRY_FORWARD' : 'ARCHIVE_RESET',
        ...res.data.data
      });
      setYearEndData((current) => ({
        ...(current || {}),
        currentCounts: res.data.data.postResetCounts,
        archives: [res.data.data.archive, ...(current?.archives || [])],
        carryForwardRuns: res.data.data.carried
          ? [res.data.data.carried.run, ...(current?.carryForwardRuns || [])]
          : (current?.carryForwardRuns || [])
      }));
      setRestoreArchiveId(res.data.data.archive.archiveId);
      setSuccess(
        modeOverride === 'CARRY_FORWARD'
          ? `${t('archiveResetCarryForwardSuccess')} ${res.data.data.archive.archiveFileName}`
          : `${t('yearEndResetSuccess')} ${res.data.data.archive.archiveFileName}`
      );
      setYearEndWizardStep(4);
      await loadData();
    } catch (err) {
      setError(
        err.response?.data?.error
        || (modeOverride === 'CARRY_FORWARD' ? t('archiveResetCarryForwardFailed') : t('yearEndResetFailed'))
      );
    } finally {
      setYearEndExecuting(false);
      setYearEndExecutionPhase('');
    }
  };

  const restoreArchive = async () => {
    if (!restoreArchiveId) {
      setError(t('selectArchiveFirst'));
      return;
    }
    setError('');
    setSuccess('');
    setYearEndExecuting(true);
    setYearEndExecutionPhase(t('yearEndPhaseRestore'));
    try {
      const res = await api.post('/settings/year-end/restore', {
        archiveId: restoreArchiveId,
        password: restorePassword,
        confirmationPhrase: restorePhrase
      });
      setRestorePassword('');
      setRestorePhrase('');
      setYearEndExecutionResult({
        workflow: 'RESTORE_ARCHIVE',
        ...res.data.data
      });
      setSuccess(t('yearEndRestoreSuccess'));
      setYearEndWizardStep(4);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || t('yearEndRestoreFailed'));
    } finally {
      setYearEndExecuting(false);
      setYearEndExecutionPhase('');
    }
  };

  const createBackup = async () => {
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/settings/data-management/backup');
      setSuccess(`${t('backupCreatedSuccess')} ${res.data.data.fileName}`);
      await loadDataManagement();
    } catch (err) {
      setError(err.response?.data?.error || t('backupCreateFailed'));
    }
  };

  const saveBackupSettings = async () => {
    setError('');
    setSuccess('');
    try {
      const res = await api.patch('/settings/data-management/backup-settings', backupSettingsForm);
      setBackupSettingsForm(res.data.data || backupSettingsForm);
      setSuccess(t('backupSettingsSaved'));
      await loadDataManagement();
    } catch (err) {
      setError(err.response?.data?.error || t('backupSettingsSaveFailed'));
    }
  };

  const exportDatasetFile = async () => {
    setError('');
    try {
      const res = await api.get(`/settings/data-management/export/${selectedDataset}`);
      const payload = res.data.data || {};
      const rows = payload.rows || [];
      const fileContent = selectedDataFormat === 'csv'
        ? rowsToCsv(selectedDataset, rows)
        : JSON.stringify(payload, null, 2);
      const contentType = selectedDataFormat === 'csv'
        ? 'text/csv;charset=utf-8'
        : 'application/json;charset=utf-8';
      const extension = selectedDataFormat === 'csv' ? 'csv' : 'json';
      const blob = new Blob([fileContent], { type: contentType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${selectedDataset}-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || t('dataExportFailed'));
    }
  };

  const downloadDatasetTemplate = () => {
    setError('');
    const templateRows = buildDatasetTemplateRows(selectedDataset);
    const fileContent = selectedDataFormat === 'csv'
      ? rowsToCsv(selectedDataset, templateRows)
      : JSON.stringify({
        dataset: selectedDataset,
        exportedAt: new Date().toISOString(),
        rows: templateRows
      }, null, 2);
    const contentType = selectedDataFormat === 'csv'
      ? 'text/csv;charset=utf-8'
      : 'application/json;charset=utf-8';
    const extension = selectedDataFormat === 'csv' ? 'csv' : 'json';
    const blob = new Blob([fileContent], { type: contentType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selectedDataset}-template.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const importDatasetFile = async () => {
    setError('');
    setSuccess('');
    try {
      let rows = [];
      if (selectedDataFormat === 'csv') {
        rows = parseCsv(importPayloadText || '');
      } else {
        const parsed = JSON.parse(importPayloadText || '{}');
        rows = parsed.rows || [];
      }
      const res = await api.post(`/settings/data-management/import/${selectedDataset}`, { rows });
      setSuccess(`${t('dataImportSuccess')} ${res.data.data.importedCount}`);
      setImportPayloadText('');
      await loadDataManagement();
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('dataImportFailed'));
    }
  };

  const loadImportFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    setImportPayloadText(text);
    const lowerName = String(file.name || '').toLowerCase();
    if (lowerName.endsWith('.csv')) {
      setSelectedDataFormat('csv');
    } else if (lowerName.endsWith('.json')) {
      setSelectedDataFormat('json');
    }
  };
  const proceedYearEndWizard = () => {
    setError('');
    if (yearEndWorkflow === 'ARCHIVE_RESET_CARRY_FORWARD' && yearEndWizardStep === 2 && !yearEndTargetYear) {
      setError(t('targetYearRequired'));
      return;
    }
    if (yearEndWorkflow === 'RESTORE_ARCHIVE' && yearEndWizardStep === 2 && !restoreArchiveId) {
      setError(t('selectArchiveFirst'));
      return;
    }
    setYearEndWizardStep((current) => Math.min(current + 1, 4));
  };
  const goBackYearEndWizard = () => {
    setError('');
    setYearEndWizardStep((current) => Math.max(current - 1, 1));
  };
  const executeYearEndWorkflow = async () => {
    if (yearEndWorkflow === 'RESTORE_ARCHIVE') {
      await restoreArchive();
      return;
    }
    await runYearEndReset(yearEndWorkflow === 'ARCHIVE_RESET_CARRY_FORWARD' ? 'CARRY_FORWARD' : 'FULL_RESET');
  };
  const printYearEndReport = () => {
    if (!yearEndExecutionResult) return;
    const dir = document?.documentElement?.dir || 'rtl';
    const title = t('yearEndClosureDocument');
    const workflowTitle = yearEndExecutionResult?.workflow
      ? yearEndWorkflowOptions.find((item) => item.key === yearEndExecutionResult.workflow)?.title || '-'
      : '-';
    const archiveId = yearEndExecutionResult?.archive?.archiveId || yearEndExecutionResult?.archiveId || restoreArchiveId || '-';
    const archiveFile = yearEndExecutionResult?.archive?.archiveFileName || '-';
    const postResetRows = Object.entries(yearEndExecutionResult?.postResetCounts || {})
      .map(([key, value]) => `<tr><td>${key}</td><td>${value}</td></tr>`)
      .join('');
    const summary = yearEndExecutionResult?.carried?.summary || yearEndExecutionResult?.carried?.run?.summary_json;
    const printable = window.open('', '_blank', 'width=960,height=720');
    if (!printable) return;
    printable.document.write(`
      <html dir="${dir}">
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #172033; }
            h1, h2 { margin: 0 0 12px; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
            .card { border: 1px solid #d8e0ef; border-radius: 12px; padding: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #d8e0ef; padding: 8px; text-align: start; }
            .hint { margin-top: 12px; color: #4b5a78; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="grid">
            <div class="card"><strong>${t('selectedWorkflow')}</strong><div>${workflowTitle}</div></div>
            <div class="card"><strong>${t('reference')}</strong><div>${archiveId}</div></div>
            <div class="card"><strong>${t('status')}</strong><div>${t('completedStatus')}</div></div>
          </div>
          <div class="hint">${t('archiveFileLabel')}: ${archiveFile}</div>
          ${postResetRows ? `<h2>${t('postResetCounts')}</h2><table><thead><tr><th>${t('entity')}</th><th>${t('countLabel')}</th></tr></thead><tbody>${postResetRows}</tbody></table>` : ''}
          ${summary ? `<div class="hint">${t('summary')}: ${formatCarrySummary(summary)}</div>` : ''}
        </body>
      </html>
    `);
    printable.document.close();
    printable.focus();
    printable.print();
  };

  if (loading) {
    return <main className="container"><section className="card"><p>{t('loadingSettings')}</p></section></main>;
  }

  return (
    <main className="container settings-page">
      <div className="cash-tabs" role="tablist" aria-label={t('adminModuleTitle')}>
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            className={`cash-tab${activeTab === tab.key ? ' active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => activateTab(tab.key)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <section className="card">

        {activeTab === 'general' ? (
          <form onSubmit={saveGeneral}>
            <div className="form-grid">
              {generalDefinitions.map((definition) => (
                <div className="form-field" key={definition.key}>
                  <label className="field-label">{generalDefinitionLabel(definition)}</label>
                  <input
                    value={generalValues[definition.key] ?? ''}
                    onChange={(e) => setGeneralValues((current) => ({ ...current, [definition.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="header-actions" style={{ marginTop: 12 }}>
              <button className="btn" type="submit">{t('saveGeneralSettings')}</button>
            </div>
          </form>
        ) : null}

        {activeTab === 'license' ? (
          <>
            <section className="card">
              <h3>{t('licenseManagement')}</h3>
              <p className="hint">{t('licenseKeyHint')}</p>
              <div className="summary-grid" style={{ marginBottom: 12 }}>
                <div className={`summary-card ${licenseStatusTone(licenseData?.status)}`}>
                  <span>{t('licenseStatus')}</span>
                  <strong>{licenseStatusLabel(licenseData?.status)}</strong>
                  <small>{licenseData?.message || '-'}</small>
                </div>
                <div className="summary-card">
                  <span>{t('licensePlan')}</span>
                  <strong>{licenseData?.payload?.planCode || '-'}</strong>
                  <small>{licenseData?.payload?.customerName || '-'}</small>
                </div>
                <div className="summary-card">
                  <span>{t('licenseExpiresAt')}</span>
                  <strong>{formatLicenseDate(licenseData?.payload?.expiresAt)}</strong>
                  <small>{t('licenseDaysRemaining')}: {licenseData?.daysRemaining ?? '-'}</small>
                </div>
              </div>

              <div className="form-grid" style={{ marginBottom: 12 }}>
                <div className="form-field">
                  <label className="field-label">{t('licenseCustomerName')}</label>
                  <input value={licenseData?.payload?.customerName || '-'} readOnly />
                </div>
                <div className="form-field">
                  <label className="field-label">{t('licenseId')}</label>
                  <input value={licenseData?.payload?.licenseId || '-'} readOnly />
                </div>
                <div className="form-field">
                  <label className="field-label">{t('licenseIssuedAt')}</label>
                  <input value={formatLicenseDate(licenseData?.payload?.issuedAt)} readOnly />
                </div>
                <div className="form-field">
                  <label className="field-label">{t('licenseGraceDays')}</label>
                  <input value={licenseData?.payload?.graceDays ?? '-'} readOnly />
                </div>
                <div className="form-field">
                  <label className="field-label">{t('licenseVerification')}</label>
                  <input value={licenseVerificationLabel(licenseData?.verificationConfigured)} readOnly />
                </div>
                <div className="form-field">
                  <label className="field-label">{t('licenseEnforcement')}</label>
                  <input value={enforcementLabel(licenseData?.enforcementMode)} readOnly />
                </div>
                <div className="form-field">
                  <label className="field-label">{t('licenseWriteAccess')}</label>
                  <input value={licenseWriteLabel(licenseData?.writeAccessAllowed)} readOnly />
                </div>
                <div className="form-field">
                  <label className="field-label">{t('licenseActivatedAt')}</label>
                  <input value={formatLicenseDate(licenseData?.activatedAt)} readOnly />
                </div>
                <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                  <label className="field-label">{t('licenseModules')}</label>
                  <input value={(licenseData?.payload?.enabledModules || []).join(' | ') || '-'} readOnly />
                </div>
                <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                  <label className="field-label">{t('licenseKey')}</label>
                  <input value={licenseData?.keyPreview || '-'} readOnly />
                </div>
              </div>

              <div className="form-field">
                <label className="field-label">{t('licenseKey')}</label>
                <textarea
                  rows="4"
                  placeholder={t('licenseKeyPlaceholder')}
                  value={licenseKeyInput}
                  onChange={(e) => setLicenseKeyInput(e.target.value)}
                />
              </div>

              <div className="header-actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                {canManageSettings ? <button className="btn" type="button" onClick={submitLicenseKey}>{t('activateLicense')}</button> : null}
                {canManageSettings ? <button className="btn secondary" type="button" onClick={clearLicenseKey}>{t('clearLicense')}</button> : null}
                <button className="btn secondary" type="button" onClick={loadLicenseStatus}>{t('refresh')}</button>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === 'license' && Array.isArray(licenseData?.registeredDevices) && licenseData.registeredDevices.length > 0 ? (
          <section className="card">
            <div className="header-actions" style={{ marginBottom: 12 }}>
              <div>
                <h3>{t('registeredDevices')}</h3>
                <p className="hint">
                  {t('licenseMaxDevices')}: {licenseData?.maxDevices ?? '-'}
                </p>
              </div>
              <button className="btn secondary" type="button" onClick={loadLicenseStatus}>{t('refresh')}</button>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('deviceName')}</th>
                  <th>{t('deviceId')}</th>
                  <th>{t('firstSeenAt')}</th>
                  <th>{t('lastSeenAt')}</th>
                  <th>{t('action')}</th>
                </tr>
              </thead>
              <tbody>
                {licenseData.registeredDevices.map((device) => (
                  <tr key={device.deviceId}>
                    <td>{device.deviceName || '-'}</td>
                    <td>{device.deviceId}</td>
                    <td>{device.firstSeenAt || '-'}</td>
                    <td>{device.lastSeenAt || '-'}</td>
                    <td className="actions">
                      <button
                        className="btn danger"
                        type="button"
                        onClick={() => removeLicenseDevice(device.deviceId)}
                      >
                        {t('removeDevice')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {activeTab === 'users' ? (
          <>
            <div className="form-grid">
              <section className="card">
                <h3>{userForm.id ? t('editUser') : t('addNewUser')}</h3>
                <form className="form-grid" onSubmit={saveUser}>
                  <input placeholder={t('username')} value={userForm.username} onChange={(e) => setUserForm((current) => ({ ...current, username: e.target.value }))} required />
                  <input placeholder={t('fullName')} value={userForm.fullName} onChange={(e) => setUserForm((current) => ({ ...current, fullName: e.target.value }))} required />
                  <select value={userForm.accessRole} onChange={(e) => setUserForm((current) => ({ ...current, accessRole: e.target.value }))}>
                    {ALL_USER_ROLES.map((roleKey) => <option key={roleKey} value={roleKey}>{roleLabel(roleKey)}</option>)}
                  </select>
                  <input placeholder={t('phone')} value={userForm.phone} onChange={(e) => setUserForm((current) => ({ ...current, phone: e.target.value }))} />
                  <input placeholder={t('email')} value={userForm.email} onChange={(e) => setUserForm((current) => ({ ...current, email: e.target.value }))} />
                  <input placeholder={t('notes')} value={userForm.notes} onChange={(e) => setUserForm((current) => ({ ...current, notes: e.target.value }))} />
                  <input type="password" placeholder={userForm.id ? t('newUserPasswordOptional') : t('userPassword')} value={userForm.password} onChange={(e) => setUserForm((current) => ({ ...current, password: e.target.value }))} required={!userForm.id} />
                  <input type="password" placeholder={t('confirmPassword')} value={userForm.confirmPassword} onChange={(e) => setUserForm((current) => ({ ...current, confirmPassword: e.target.value }))} required={!userForm.id} />
                  <label className="field-label">
                    <input type="checkbox" checked={userForm.isActive} onChange={(e) => setUserForm((current) => ({ ...current, isActive: e.target.checked }))} />
                    {t('activeUser')}
                  </label>
                  <div className="header-actions">
                    <button className="btn" type="submit">{userForm.id ? t('saveEdit') : t('createUser')}</button>
                    <button className="btn secondary" type="button" onClick={() => setUserForm(initialUserForm)}>{t('clear')}</button>
                  </div>
                </form>
              </section>

              <section className="card">
                <h3>{t('managePasswordOverrides')}</h3>
                <div className="form-field">
                  <label className="field-label">{t('selectedUser')}</label>
                  <select value={selectedUserId || ''} onChange={(e) => setSelectedUserId(e.target.value || null)}>
                    <option value="">{t('chooseUser')}</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{user.fullName} ({user.username})</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label className="field-label">{t('resetPassword')}</label>
                  <input type="password" placeholder={t('newPassword')} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
                  <button className="btn secondary" type="button" onClick={submitPasswordReset}>{t('updatePassword')}</button>
                </div>
                {selectedUser ? (
                  <div style={{ marginTop: 12 }}>
                    <h4>{t('userPermissionOverrides')}</h4>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('permission')}</th>
                          <th>{t('mode')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {permissionGroups.flatMap(([, items]) => items).map((permission) => (
                          <tr key={permission.key}>
                            <td>{permissionLabel(permission)}</td>
                            <td>
                              <select
                                value={selectedUserOverrides[permission.key] || 'default'}
                                onChange={(e) => setSelectedUserOverrides((current) => ({ ...current, [permission.key]: e.target.value }))}
                              >
                                <option value="default">{t('roleDefault')}</option>
                                <option value="allow">{t('allow')}</option>
                                <option value="deny">{t('deny')}</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button className="btn" type="button" onClick={saveUserOverrides}>{t('saveUserOverrides')}</button>
                  </div>
                ) : null}
              </section>
            </div>

            <section className="card">
              <h3>{t('usersTable')}</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('fullName')}</th>
                    <th>{t('username')}</th>
                    <th>{t('role')}</th>
                    <th>{t('status')}</th>
                    <th>{t('lastLogin')}</th>
                    <th>{t('createdDate')}</th>
                    <th>{t('action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.fullName}</td>
                      <td>{user.username}</td>
                      <td>{roleLabel(user.role)}</td>
                      <td>{user.isActive ? t('active') : t('disabled')}</td>
                      <td>{user.lastLoginAt || '-'}</td>
                      <td>{user.createdAt}</td>
                      <td className="actions">
                        <button className="btn secondary" type="button" onClick={() => startEditUser(user)}>{t('edit')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        ) : null}

        {activeTab === 'roles' ? (
          <>
            <div className="form-field" style={{ maxWidth: 320 }}>
              <label className="field-label">{t('roleLabel')}</label>
              <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
                {rolesData.roles.map((role) => (
                  <option key={role.roleKey} value={role.roleKey}>{roleLabel(role.roleKey)}</option>
                ))}
              </select>
            </div>

            {permissionGroups.map(([moduleName, items]) => (
              <section className="card" key={moduleName}>
                <h3>{permissionGroupLabel(moduleName)}</h3>
                <div className="form-grid">
                  {items.map((permission) => (
                    <label key={permission.key} className="field-label">
                      <input
                        type="checkbox"
                        checked={selectedRolePermissions.includes(permission.key)}
                        onChange={() => toggleRolePermission(permission.key)}
                      />
                      {permissionLabel(permission)}
                    </label>
                  ))}
                </div>
              </section>
            ))}

            <button className="btn" type="button" onClick={saveRolePermissions}>{t('rolePermissionsSave')}</button>
          </>
        ) : null}

        {activeTab === 'data' && canManageData ? (
          <>
            <section className="card">
              <h3>{t('backupManagement')}</h3>
              <div className="summary-grid" style={{ marginBottom: 12 }}>
                <div className={`summary-card ${dataManagement?.backupStatus?.stale ? 'summary-danger' : 'summary-success'}`}>
                  <span>{t('backupStatus')}</span>
                  <strong>{dataManagement?.backupStatus?.exists ? (dataManagement?.backupStatus?.stale ? t('backupStale') : t('backupHealthy')) : t('backupMissing')}</strong>
                  <small>{dataManagement?.backupStatus?.latestCreatedAt || '-'}</small>
                </div>
              </div>
              {(dataManagement?.alerts || []).length ? (
                <div style={{ marginBottom: 12 }}>
                  <h4>{t('backupAlerts')}</h4>
                  <div className="form-grid">
                    {dataManagement.alerts.map((alert) => (
                      <div key={alert.code} className={`summary-card ${alert.severity === 'high' ? 'summary-danger' : 'summary-warning'}`}>
                        <strong>{alert.code === 'MISSING_BACKUP'
                          ? t('backupAlertMissing')
                          : alert.code === 'STALE_BACKUP'
                            ? t('backupAlertStale')
                            : t('backupAlertFailed')}</strong>
                        <small>{alert.message}</small>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="header-actions" style={{ marginBottom: 12 }}>
                <button className="btn" type="button" onClick={createBackup}>{t('createBackup')}</button>
                <button className="btn secondary" type="button" onClick={loadDataManagement}>{t('refresh')}</button>
              </div>
              <div className="form-grid" style={{ marginBottom: 16 }}>
                <label className="field-label">
                  <input
                    type="checkbox"
                    checked={!!backupSettingsForm.autoBackupEnabled}
                    onChange={(e) => setBackupSettingsForm((current) => ({
                      ...current,
                      autoBackupEnabled: e.target.checked
                    }))}
                  />
                  {t('autoBackupEnabled')}
                </label>
                <div className="form-field">
                  <label className="field-label">{t('backupIntervalDays')}</label>
                  <input
                    type="number"
                    min="1"
                    value={backupSettingsForm.intervalDays}
                    onChange={(e) => setBackupSettingsForm((current) => ({
                      ...current,
                      intervalDays: Number(e.target.value || 1)
                    }))}
                  />
                </div>
                <div className="form-field">
                  <label className="field-label">{t('backupRetentionCount')}</label>
                  <input
                    type="number"
                    min="1"
                    value={backupSettingsForm.retentionCount}
                    onChange={(e) => setBackupSettingsForm((current) => ({
                      ...current,
                      retentionCount: Number(e.target.value || 1)
                    }))}
                  />
                </div>
              </div>
              <div className="header-actions" style={{ marginBottom: 12 }}>
                <button className="btn secondary" type="button" onClick={saveBackupSettings}>{t('saveBackupSettings')}</button>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('reference')}</th>
                    <th>{t('time')}</th>
                    <th>{t('user')}</th>
                    <th>{t('source')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(dataManagement?.backups || []).map((backup) => (
                    <tr key={backup.backupId}>
                      <td>{backup.backupId}</td>
                      <td>{backup.createdAt}</td>
                      <td>{backup.createdByUsername || '-'}</td>
                      <td>{backup.dbPath}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card">
              <h3>{t('backupRunsHistory')}</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('time')}</th>
                    <th>{t('mode')}</th>
                    <th>{t('status')}</th>
                    <th>{t('user')}</th>
                    <th>{t('reference')}</th>
                    <th>{t('reason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(dataManagement?.recentRuns || []).map((run) => (
                    <tr key={run.id}>
                      <td>{run.startedAt || run.started_at || '-'}</td>
                      <td>{run.runMode || run.run_mode || '-'}</td>
                      <td>{run.status}</td>
                      <td>{run.createdByUsername || run.created_by_username || '-'}</td>
                      <td>{run.fileName || run.file_name || run.backupId || run.backup_id || '-'}</td>
                      <td>{run.errorMessage || run.error_message || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card">
              <h3>{t('dataImportExport')}</h3>
              <div className="form-grid">
                <div className="form-field">
                  <label className="field-label">{t('dataset')}</label>
                  <select value={selectedDataset} onChange={(e) => setSelectedDataset(e.target.value)}>
                    {(dataManagement?.supportedDatasets || []).map((dataset) => (
                      <option key={dataset} value={dataset}>{dataset}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label className="field-label">{t('fileFormat')}</label>
                  <select value={selectedDataFormat} onChange={(e) => setSelectedDataFormat(e.target.value)}>
                    <option value="json">{t('jsonFormat')}</option>
                    <option value="csv">{t('csvExcelFormat')}</option>
                  </select>
                </div>
              </div>
              <p className="hint">{t('csvExcelHint')}</p>
              <div className="form-field" style={{ marginTop: 12 }}>
                <label className="field-label">{t('datasetColumns')}</label>
                <div className="hint">
                  {getDatasetSchema(selectedDataset).map((field) => field.key).join(' | ')}
                </div>
              </div>
              <div className="header-actions" style={{ marginTop: 12, marginBottom: 12 }}>
                <button className="btn secondary" type="button" onClick={exportDatasetFile}>{t('exportData')}</button>
                <button className="btn secondary" type="button" onClick={downloadDatasetTemplate}>{t('downloadTemplate')}</button>
              </div>
              <div className="form-field">
                <label className="field-label">{t('importFile')}</label>
                <input type="file" accept=".json,.csv,application/json,text/csv" onChange={(e) => loadImportFile(e.target.files?.[0])} />
              </div>
              <div className="form-field">
                <label className="field-label">{t('importPayload')}</label>
                <textarea rows="10" value={importPayloadText} onChange={(e) => setImportPayloadText(e.target.value)} />
              </div>
              <div className="header-actions" style={{ marginTop: 12 }}>
                <button className="btn" type="button" onClick={importDatasetFile}>{t('importData')}</button>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === 'security' ? (
          <>
            <section className="card">
              <h3>{t('userSecurityState')}</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('user')}</th>
                    <th>{t('role')}</th>
                    <th>{t('status')}</th>
                    <th>{t('lastLogin')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.fullName}</td>
                      <td>{roleLabel(user.role)}</td>
                      <td>{user.isActive ? t('active') : t('disabled')}</td>
                      <td>{user.lastLoginAt || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card">
              <h3>{t('accountingDiagnostics')}</h3>
              <div className="summary-grid" style={{ marginBottom: 12 }}>
                <div className={`summary-card ${diagnostics?.healthy ? 'summary-success' : 'summary-danger'}`}>
                  <span>{t('diagnosticsStatus')}</span>
                  <strong>{diagnostics?.healthy ? t('diagnosticsHealthy') : t('diagnosticsIssuesFound')}</strong>
                  <small>{t('countLabel')}: {diagnostics?.issueCount ?? 0}</small>
                </div>
                <div className="summary-card">
                  <span>{t('severityHigh')}</span>
                  <strong>{diagnostics?.severitySummary?.high ?? 0}</strong>
                </div>
                <div className="summary-card">
                  <span>{t('severityMedium')}</span>
                  <strong>{diagnostics?.severitySummary?.medium ?? 0}</strong>
                </div>
              </div>
              <div className="header-actions" style={{ marginBottom: 12 }}>
                <button className="btn secondary" type="button" onClick={loadAuditAndDiagnostics}>{t('refreshDiagnostics')}</button>
                <button className="btn secondary" type="button" onClick={exportDiagnosticsReport}>{t('exportDiagnostics')}</button>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('checkName')}</th>
                    <th>{t('severity')}</th>
                    <th>{t('countLabel')}</th>
                    <th>{t('status')}</th>
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(diagnostics?.checks || []).map((check) => (
                    <tr key={check.key}>
                      <td>{t(`diagnostic.${check.key}`)}</td>
                      <td>{severityLabel(check.severity)}</td>
                      <td>{check.count}</td>
                      <td>{check.count === 0 ? t('diagnosticsHealthy') : t('diagnosticsIssuesFound')}</td>
                      <td className="actions">
                        {diagnosticRouteMap[check.key] ? <Link className="btn secondary" to={diagnosticRouteMap[check.key]}>{t('openWindow')}</Link> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card">
              <h3>{t('auditLog')}</h3>
              <div className="form-grid" style={{ marginBottom: 12 }}>
                <input placeholder={t('search')} value={auditFilters.q} onChange={(e) => setAuditFilters((current) => ({ ...current, q: e.target.value }))} />
                <input placeholder={t('entity')} value={auditFilters.entity} onChange={(e) => setAuditFilters((current) => ({ ...current, entity: e.target.value }))} />
                <input placeholder={t('action')} value={auditFilters.action} onChange={(e) => setAuditFilters((current) => ({ ...current, action: e.target.value }))} />
                <button className="btn secondary" type="button" onClick={loadAuditAndDiagnostics}>{t('refresh')}</button>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('time')}</th>
                    <th>{t('user')}</th>
                    <th>{t('entity')}</th>
                    <th>{t('action')}</th>
                    <th>{t('reason')}</th>
                    <th>{t('summary')}</th>
                    <th>{t('beforeAfter')}</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.event_time}</td>
                      <td>{row.user_name || '-'}</td>
                      <td>{row.entity_name}</td>
                      <td>{row.action}</td>
                      <td>{row.reason || '-'}</td>
                      <td>{formatAuditMetadata(row.metadata_json)}</td>
                      <td>
                        {(() => {
                          const metadata = parseAuditMetadata(row.metadata_json);
                          if (!metadata?.before && !metadata?.after) return '-';
                          const beforeKeys = Object.keys(metadata.before || {});
                          const afterKeys = Object.keys(metadata.after || {});
                          return `${t('beforeLabel')}: ${beforeKeys.length} | ${t('afterLabel')}: ${afterKeys.length}`;
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {(diagnostics?.checks || []).filter((check) => check.count > 0).map((check) => (
              <section className="card" key={`diagnostic-details-${check.key}`}>
                <div className="header-actions" style={{ marginBottom: 12 }}>
                  <h3>{t(`diagnostic.${check.key}`)}</h3>
                  {diagnosticRouteMap[check.key] ? <Link className="btn secondary" to={diagnosticRouteMap[check.key]}>{t('openRelatedModule')}</Link> : null}
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      {Object.keys(check.rows?.[0] || {}).map((column) => <th key={`${check.key}-${column}`}>{column}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(check.rows || []).map((row, index) => (
                      <tr key={`${check.key}-${index}`}>
                        {Object.entries(row).map(([column, value]) => <td key={`${check.key}-${index}-${column}`}>{String(value)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </>
        ) : null}

        {activeTab === 'yearEnd' && canUseYearEnd ? (
          <>
            <ContextGuide
              title={t('guideYearEndTitle')}
              intro={t('guideYearEndIntro')}
              steps={[t('guideYearEndStep1'), t('guideYearEndStep2'), t('guideYearEndStep3'), t('guideYearEndStep4')]}
            />
            <section className="card">
              <h3>{t('yearEndReset')}</h3>
              <p className="hint">{t('yearEndWizardHint')}</p>
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                {[1, 2, 3, 4].map((step) => (
                  <div key={step} className={`summary-card ${yearEndWizardStep === step ? 'summary-success' : ''}`}>
                    <span>{t('stepLabel')} {step}</span>
                    <strong>{t(`yearEndStep${step}`)}</strong>
                  </div>
                ))}
              </div>
              {yearEndExecuting ? (
                <div className="summary-card summary-warning" style={{ marginBottom: 16 }}>
                  <span>{t('yearEndExecutionInProgress')}</span>
                  <strong>{yearEndExecutionPhase || t('loading')}</strong>
                </div>
              ) : null}

              {yearEndWizardStep === 1 ? (
                <>
                  <h4>{t('chooseYearEndWorkflow')}</h4>
                  <div className="form-grid">
                    {yearEndWorkflowOptions.map((workflow) => (
                      <button
                        key={workflow.key}
                        type="button"
                        className={`summary-card ${yearEndWorkflow === workflow.key ? 'summary-success' : ''}`}
                        onClick={() => {
                          setYearEndWorkflow(workflow.key);
                          setYearEndExecutionResult(null);
                        }}
                        style={{ textAlign: 'start' }}
                      >
                        <span>{workflow.title}</span>
                        <strong>{workflow.description}</strong>
                      </button>
                    ))}
                  </div>
                  <div className="header-actions" style={{ marginTop: 12 }}>
                    <button className="btn" type="button" onClick={proceedYearEndWizard} disabled={yearEndExecuting}>{t('continueAction')}</button>
                  </div>
                </>
              ) : null}

              {yearEndWizardStep === 2 ? (
                <>
                  <h4>{t('reviewYearEndImpact')}</h4>
                  {yearEndWorkflow === 'ARCHIVE_RESET_CARRY_FORWARD' ? (
                    <p className="hint">{t('archiveResetCarryForwardHint')}</p>
                  ) : null}
                  <div className="form-grid">
                    {yearEndWorkflow === 'ARCHIVE_RESET_CARRY_FORWARD' ? (
                      <>
                        <div className="form-field">
                          <label className="field-label">{t('sourceYear')}</label>
                          <input value={yearEndSourceYear} onChange={(e) => setYearEndSourceYear(e.target.value)} placeholder="2025" />
                        </div>
                        <div className="form-field">
                          <label className="field-label">{t('targetYear')}</label>
                          <input value={yearEndTargetYear} onChange={(e) => setYearEndTargetYear(e.target.value)} placeholder="2026" />
                        </div>
                      </>
                    ) : null}
                    {yearEndWorkflow === 'RESTORE_ARCHIVE' ? (
                      <div className="form-field">
                        <label className="field-label">{t('availableArchives')}</label>
                        <select value={restoreArchiveId} onChange={(e) => setRestoreArchiveId(e.target.value)}>
                          <option value="">{t('selectArchiveFirst')}</option>
                          {(yearEndData?.archives || []).map((archive) => (
                            <option key={archive.archiveId} value={archive.archiveId}>
                              {archive.archiveId}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>

                  {yearEndWorkflow === 'RESTORE_ARCHIVE' && selectedRestoreArchive ? (
                    <div className="summary-grid" style={{ marginBottom: 12 }}>
                      <div className="summary-card">
                        <span>{t('reference')}</span>
                        <strong>{selectedRestoreArchive.archiveId}</strong>
                      </div>
                      <div className="summary-card">
                        <span>{t('time')}</span>
                        <strong>{selectedRestoreArchive.createdAt || '-'}</strong>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h4>{t('currentOperationalCounts')}</h4>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>{t('entity')}</th>
                            <th>{t('countLabel')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(yearEndData?.currentCounts || {}).map(([key, value]) => (
                            <tr key={key}>
                              <td>{key}</td>
                              <td>{value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                  <div className="header-actions" style={{ marginTop: 12 }}>
                    <button className="btn secondary" type="button" onClick={goBackYearEndWizard} disabled={yearEndExecuting}>{t('back')}</button>
                    <button className="btn" type="button" onClick={proceedYearEndWizard} disabled={yearEndExecuting}>{t('continueAction')}</button>
                  </div>
                </>
              ) : null}

              {yearEndWizardStep === 3 ? (
                <>
                  <h4>{t('secureYearEndConfirmation')}</h4>
                  <div className="form-grid">
                    <div className="form-field">
                      <label className="field-label">{t('confirmationPhraseLabel')}</label>
                      <input
                        value={yearEndWorkflow === 'RESTORE_ARCHIVE' ? restorePhrase : yearEndPhrase}
                        onChange={(e) => yearEndWorkflow === 'RESTORE_ARCHIVE' ? setRestorePhrase(e.target.value) : setYearEndPhrase(e.target.value)}
                        placeholder={yearEndData?.confirmationPhrase || 'RESET YEAR'}
                      />
                    </div>
                    <div className="form-field">
                      <label className="field-label">{t('confirmCurrentPassword')}</label>
                      <input
                        type="password"
                        value={yearEndWorkflow === 'RESTORE_ARCHIVE' ? restorePassword : yearEndPassword}
                        onChange={(e) => yearEndWorkflow === 'RESTORE_ARCHIVE' ? setRestorePassword(e.target.value) : setYearEndPassword(e.target.value)}
                        placeholder={t('confirmCurrentPassword')}
                      />
                    </div>
                  </div>
                  <div className="summary-grid" style={{ marginBottom: 12 }}>
                    <div className="summary-card">
                      <span>{t('selectedWorkflow')}</span>
                      <strong>{yearEndWorkflowOptions.find((item) => item.key === yearEndWorkflow)?.title}</strong>
                    </div>
                    {yearEndWorkflow === 'ARCHIVE_RESET_CARRY_FORWARD' ? (
                      <div className="summary-card">
                        <span>{t('targetYear')}</span>
                        <strong>{yearEndTargetYear || '-'}</strong>
                      </div>
                    ) : null}
                  </div>
                  <div className="header-actions" style={{ marginTop: 12 }}>
                    <button className="btn secondary" type="button" onClick={goBackYearEndWizard} disabled={yearEndExecuting}>{t('back')}</button>
                    <button className="btn danger" type="button" onClick={executeYearEndWorkflow} disabled={yearEndExecuting}>
                      {yearEndWorkflow === 'RESTORE_ARCHIVE'
                        ? t('restoreArchive')
                        : yearEndWorkflow === 'ARCHIVE_RESET_CARRY_FORWARD'
                          ? t('archiveResetCarryForward')
                          : t('archiveAndReset')}
                    </button>
                  </div>
                </>
              ) : null}

              {yearEndWizardStep === 4 ? (
                <>
                  <h4>{t('yearEndResult')}</h4>
                  <div className="summary-grid" style={{ marginBottom: 12 }}>
                    <div className="summary-card summary-success">
                      <span>{t('selectedWorkflow')}</span>
                      <strong>{yearEndExecutionResult?.workflow ? yearEndWorkflowOptions.find((item) => item.key === yearEndExecutionResult.workflow)?.title : '-'}</strong>
                    </div>
                    <div className="summary-card">
                      <span>{t('reference')}</span>
                      <strong>{yearEndExecutionResult?.archive?.archiveId || yearEndExecutionResult?.archiveId || restoreArchiveId || '-'}</strong>
                    </div>
                    <div className="summary-card">
                      <span>{t('status')}</span>
                      <strong>{t('completedStatus')}</strong>
                    </div>
                  </div>
                  {yearEndExecutionResult?.archive?.archiveFileName ? (
                    <p className="hint">{t('archiveFileLabel')}: {yearEndExecutionResult.archive.archiveFileName}</p>
                  ) : null}
                  {yearEndExecutionResult?.postResetCounts ? (
                    <>
                      <h4>{t('postResetCounts')}</h4>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>{t('entity')}</th>
                            <th>{t('countLabel')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(yearEndExecutionResult.postResetCounts || {}).map(([key, value]) => (
                            <tr key={`post-${key}`}>
                              <td>{key}</td>
                              <td>{value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : null}
                  {yearEndExecutionResult?.carried?.summary || yearEndExecutionResult?.carried?.run?.summary_json ? (
                    <p className="hint">{t('summary')}: {formatCarrySummary(yearEndExecutionResult.carried?.summary || yearEndExecutionResult.carried?.run?.summary_json)}</p>
                  ) : null}
                  <div className="header-actions" style={{ marginTop: 12 }}>
                    <button className="btn secondary" type="button" onClick={printYearEndReport}>{t('printYearEndClosure')}</button>
                    <button className="btn secondary" type="button" onClick={resetYearEndWizard}>{t('startNewWorkflow')}</button>
                  </div>
                </>
              ) : null}
            </section>

            <section className="card">
              <h3>{t('carryForwardOpeningBalances')}</h3>
              <p className="hint">{t('carryForwardWorkflowHint')}</p>
              <h4 style={{ marginTop: 16 }}>{t('carryForwardHistory')}</h4>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('time')}</th>
                    <th>{t('sourceYear')}</th>
                    <th>{t('targetYear')}</th>
                    <th>{t('user')}</th>
                    <th>{t('status')}</th>
                    <th>{t('summary')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(yearEndData?.carryForwardRuns || []).map((run) => (
                    <tr key={run.id}>
                      <td>{run.created_at}</td>
                      <td>{run.source_year}</td>
                      <td>{run.target_year}</td>
                      <td>{run.executed_by_name || '-'}</td>
                      <td>{run.status}</td>
                      <td>{formatCarrySummary(run.summary_json)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        ) : null}

        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="hint">{success}</p> : null}
      </section>
    </main>
  );
}
