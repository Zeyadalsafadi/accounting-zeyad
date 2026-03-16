import { Notice } from '../components/Shared.jsx';

export default function KeysView({
  t, activeKey, keyLabel, setKeyLabel, importForm, setImportForm, revealedPrivateKey,
  busyKeyAction, setBusyKeyAction, setError, setSuccess, setRevealedPrivateKey,
  loadBootstrap, handleCopy, downloadText, api
}) {
  return (
    <section className="split-panel">
      <div className="panel">
        <h3>{t('keys.activeKey')}</h3>
        <div className="mini-stack">
          <div className="info-row"><span>{t('common.label')}</span><strong>{activeKey?.label || t('sidebar.notConfigured')}</strong></div>
          <div className="info-row"><span>{t('keys.publicFingerprint')}</span><strong className="mono">{activeKey?.publicKeyFingerprint || '-'}</strong></div>
          <div className="info-row"><span>{t('keys.privateFingerprint')}</span><strong className="mono">{activeKey?.privateKeyFingerprint || '-'}</strong></div>
        </div>
        <div className="field"><label>{t('keys.publicKeyPem')}</label><textarea readOnly rows={7} value={activeKey?.publicKeyPem || ''} /></div>
        <div className="field"><label>{t('keys.envSnippet')}</label><textarea readOnly rows={4} value={activeKey ? `LICENSE_PUBLIC_KEY=${activeKey.publicKeyEnvValue}\nLICENSE_ENFORCEMENT=strict` : ''} /></div>
        <div className="action-row">
          <button className="button" type="button" disabled={!activeKey?.publicKeyPem} onClick={() => handleCopy(activeKey.publicKeyPem, 'keys.copyPublicKey')}>{t('keys.copyPublicKey')}</button>
          <button className="button ghost" type="button" disabled={!activeKey?.publicKeyPem} onClick={() => downloadText('license-public.pem', activeKey.publicKeyPem)}>{t('keys.exportPublicKey')}</button>
          <button className="button ghost" type="button" disabled={!activeKey?.publicKeyEnvValue} onClick={() => handleCopy(`LICENSE_PUBLIC_KEY=${activeKey.publicKeyEnvValue}\nLICENSE_ENFORCEMENT=strict`, 'keys.copyEnv')}>{t('keys.copyEnv')}</button>
          <button className="button ghost" type="button" disabled={!activeKey?.publicKeyEnvValue} onClick={() => downloadText('license-public.env.txt', `LICENSE_PUBLIC_KEY=${activeKey.publicKeyEnvValue}\nLICENSE_ENFORCEMENT=strict`)}>{t('keys.exportEnv')}</button>
          <button className="button danger" type="button" disabled={!activeKey?.hasPrivateKey || busyKeyAction} onClick={async () => {
            try {
              if (!window.confirm(t('keys.confirmRevealPrivateKey'))) return;
              setBusyKeyAction(true);
              setError('');
              setRevealedPrivateKey((await api.revealPrivateKey()).privateKeyPem);
            } catch (requestError) {
              setError(requestError.message);
            } finally {
              setBusyKeyAction(false);
            }
          }}>{t('keys.revealPrivateKey')}</button>
        </div>
        {revealedPrivateKey ? <div className="field"><label>{t('keys.sensitivePrivateKey')}</label><textarea readOnly rows={8} value={revealedPrivateKey} /></div> : null}
        {revealedPrivateKey ? <Notice tone="danger">{t('keys.privateKeyWarning')}</Notice> : null}
      </div>
      <div className="panel">
        <h3>{t('keys.generateNewKeyPair')}</h3>
        <div className="field"><label>{t('keys.keyLabel')}</label><input value={keyLabel} onChange={(event) => setKeyLabel(event.target.value)} /></div>
        <button className="button" type="button" disabled={busyKeyAction} onClick={async () => {
          try {
            setBusyKeyAction(true);
            setError('');
            setSuccess('');
            await api.generateKeys({ label: keyLabel });
            setSuccess(t('notices.keyGenerated'));
            await loadBootstrap(true);
          } catch (requestError) {
            setError(requestError.message);
          } finally {
            setBusyKeyAction(false);
          }
        }}>{t('keys.generateKeyPair')}</button>
        <h3>{t('keys.importExistingKeys')}</h3>
        <div className="field"><label>{t('keys.importLabel')}</label><input value={importForm.label} onChange={(event) => setImportForm((current) => ({ ...current, label: event.target.value }))} /></div>
        <div className="field"><label>{t('keys.privateKeyPem')}</label><textarea rows={7} value={importForm.privateKeyPem} onChange={(event) => setImportForm((current) => ({ ...current, privateKeyPem: event.target.value }))} /></div>
        <div className="field"><label>{t('keys.publicKeyPem')}</label><textarea rows={7} value={importForm.publicKeyPem} onChange={(event) => setImportForm((current) => ({ ...current, publicKeyPem: event.target.value }))} /></div>
        <button className="button" type="button" disabled={busyKeyAction} onClick={async () => {
          try {
            setBusyKeyAction(true);
            setError('');
            setSuccess('');
            await api.importKeys(importForm);
            setImportForm({ label: 'Imported Key', privateKeyPem: '', publicKeyPem: '' });
            setSuccess(t('notices.keyImported'));
            await loadBootstrap(true);
          } catch (requestError) {
            setError(requestError.message);
          } finally {
            setBusyKeyAction(false);
          }
        }}>{t('keys.importKeys')}</button>
      </div>
    </section>
  );
}
