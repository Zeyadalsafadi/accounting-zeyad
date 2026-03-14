import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ALL_USER_ROLES, PERMISSIONS } from '@paint-shop/shared';
import api from '../services/api.js';
import { APP_NAME, ROLE_LABEL_KEYS } from '../constants/app.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { getCurrentUser, hasPermission } from '../utils/auth.js';

const TAB_OPTIONS = [
  { key: 'general', labelKey: 'generalSettings' },
  { key: 'users', labelKey: 'userManagement' },
  { key: 'roles', labelKey: 'rolesPermissions' },
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
  const [users, setUsers] = useState([]);
  const [rolesData, setRolesData] = useState({ roles: [], permissionGroups: {} });
  const [auditRows, setAuditRows] = useState([]);
  const [userForm, setUserForm] = useState(initialUserForm);
  const [selectedRole, setSelectedRole] = useState('ADMIN');
  const [selectedRolePermissions, setSelectedRolePermissions] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUserOverrides, setSelectedUserOverrides] = useState({});
  const [resetPassword, setResetPassword] = useState('');
  const [yearEndData, setYearEndData] = useState(null);
  const [yearEndMode, setYearEndMode] = useState('FULL_RESET');
  const [yearEndPassword, setYearEndPassword] = useState('');
  const [yearEndPhrase, setYearEndPhrase] = useState('');
  const [yearEndSourceYear, setYearEndSourceYear] = useState('');
  const [yearEndTargetYear, setYearEndTargetYear] = useState('');
  const [restoreArchiveId, setRestoreArchiveId] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restorePhrase, setRestorePhrase] = useState('');
  const currentUser = getCurrentUser();
  const canUseYearEnd = hasPermission(currentUser, PERMISSIONS.SETTINGS_YEAR_END);
  const visibleTabs = TAB_OPTIONS.filter((tab) => tab.key !== 'yearEnd' || canUseYearEnd);

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

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [generalRes, usersRes, rolesRes, auditRes] = await Promise.all([
        api.get('/settings/general'),
        api.get('/users'),
        api.get('/settings/roles'),
        api.get('/settings/audit')
      ]);

      setGeneralDefinitions(generalRes.data.data?.definitions || []);
      setGeneralValues(generalRes.data.data?.values || {});
      setUsers(usersRes.data.data || []);
      setRolesData(rolesRes.data.data || { roles: [], permissionGroups: {} });
      setAuditRows(auditRes.data.data || []);

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

  const runYearEndReset = async () => {
    if (yearEndMode === 'CARRY_FORWARD' && !yearEndTargetYear) {
      setError(t('targetYearRequired'));
      return;
    }

    setError('');
    setSuccess('');
    try {
      const endpoint = yearEndMode === 'CARRY_FORWARD'
        ? '/settings/year-end/archive-reset-carry-forward'
        : '/settings/year-end/archive-reset';
      const payload = {
        mode: yearEndMode,
        password: yearEndPassword,
        confirmationPhrase: yearEndPhrase
      };

      if (yearEndMode === 'CARRY_FORWARD') {
        payload.sourceYear = yearEndSourceYear;
        payload.targetYear = yearEndTargetYear;
      }

      const res = await api.post(endpoint, payload);
      setYearEndPassword('');
      setYearEndPhrase('');
      setYearEndSourceYear('');
      setYearEndTargetYear('');
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
        yearEndMode === 'CARRY_FORWARD'
          ? `${t('archiveResetCarryForwardSuccess')} ${res.data.data.archive.archiveFileName}`
          : `${t('yearEndResetSuccess')} ${res.data.data.archive.archiveFileName}`
      );
      await loadData();
    } catch (err) {
      setError(
        err.response?.data?.error
        || (yearEndMode === 'CARRY_FORWARD' ? t('archiveResetCarryForwardFailed') : t('yearEndResetFailed'))
      );
    }
  };

  const restoreArchive = async () => {
    if (!restoreArchiveId) {
      setError(t('selectArchiveFirst'));
      return;
    }
    setError('');
    setSuccess('');
    try {
      await api.post('/settings/year-end/restore', {
        archiveId: restoreArchiveId,
        password: restorePassword,
        confirmationPhrase: restorePhrase
      });
      setRestorePassword('');
      setRestorePhrase('');
      setSuccess(t('yearEndRestoreSuccess'));
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || t('yearEndRestoreFailed'));
    }
  };

  if (loading) {
    return <main className="container"><section className="card"><p>{t('loadingSettings')}</p></section></main>;
  }

  return (
    <main className="container">
      <header className="header-row">
        <div>
          <h1>{APP_NAME}</h1>
          <p className="hint">{t('adminModuleTitle')}</p>
        </div>
        <div className="header-actions">
          <Link className="btn" to="/">{t('home')}</Link>
        </div>
      </header>

      <section className="card">
        <div className="header-actions" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              className={`btn${activeTab === tab.key ? '' : ' secondary'}`}
              type="button"
              onClick={() => activateTab(tab.key)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

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
              <h3>{t('auditLog')}</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('time')}</th>
                    <th>{t('user')}</th>
                    <th>{t('entity')}</th>
                    <th>{t('action')}</th>
                    <th>{t('reason')}</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        ) : null}

        {activeTab === 'yearEnd' && canUseYearEnd ? (
          <>
            <section className="card">
              <h3>{t('yearEndReset')}</h3>
              <p className="hint">{t('yearEndResetHint')}</p>
              {yearEndMode === 'CARRY_FORWARD' ? (
                <p className="hint">{t('archiveResetCarryForwardHint')}</p>
              ) : null}
              <div className="form-grid">
                <div className="form-field">
                  <label className="field-label">{t('resetMode')}</label>
                  <select value={yearEndMode} onChange={(e) => setYearEndMode(e.target.value)}>
                    {(yearEndData?.supportedModes || []).map((mode) => (
                      <option key={mode.key} value={mode.key} disabled={!mode.available}>
                        {yearEndModeLabel(mode.key)}{mode.available ? '' : ` (${t('soon')})`}
                      </option>
                    ))}
                  </select>
                </div>
                {yearEndMode === 'CARRY_FORWARD' ? (
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
                <div className="form-field">
                  <label className="field-label">{t('confirmationPhraseLabel')}</label>
                  <input value={yearEndPhrase} onChange={(e) => setYearEndPhrase(e.target.value)} placeholder={yearEndData?.confirmationPhrase || 'RESET YEAR'} />
                </div>
                <div className="form-field">
                  <label className="field-label">{t('confirmCurrentPassword')}</label>
                  <input type="password" value={yearEndPassword} onChange={(e) => setYearEndPassword(e.target.value)} placeholder={t('confirmCurrentPassword')} />
                </div>
              </div>
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
              <div className="header-actions" style={{ marginTop: 12 }}>
                <button className="btn danger" type="button" onClick={runYearEndReset}>
                  {yearEndMode === 'CARRY_FORWARD' ? t('archiveResetCarryForward') : t('archiveAndReset')}
                </button>
              </div>
            </section>

            <section className="card">
              <h3>{t('restoreArchive')}</h3>
              <div className="form-grid">
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
                <div className="form-field">
                  <label className="field-label">{t('confirmationPhraseLabel')}</label>
                  <input value={restorePhrase} onChange={(e) => setRestorePhrase(e.target.value)} placeholder={yearEndData?.confirmationPhrase || 'RESET YEAR'} />
                </div>
                <div className="form-field">
                  <label className="field-label">{t('confirmCurrentPassword')}</label>
                  <input type="password" value={restorePassword} onChange={(e) => setRestorePassword(e.target.value)} placeholder={t('confirmCurrentPassword')} />
                </div>
              </div>
              <div className="header-actions" style={{ marginTop: 12 }}>
                <button className="btn secondary" type="button" onClick={restoreArchive}>{t('restoreArchive')}</button>
              </div>
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
