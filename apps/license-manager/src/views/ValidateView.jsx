import { Notice } from '../components/Shared.jsx';

export default function ValidateView({ t, validationToken, setValidationToken, validationResult, setValidationResult, setError, formatDateTime, statusLabel, api }) {
  return (
    <section className="split-panel">
      <div className="panel">
        <div className="field"><label>{t('validate.licenseToken')}</label><textarea rows={10} value={validationToken} onChange={(event) => setValidationToken(event.target.value)} /></div>
        <button className="button" type="button" onClick={async () => {
          try {
            setError('');
            setValidationResult(await api.validateToken({ token: validationToken }));
          } catch (requestError) {
            setError(requestError.message);
          }
        }}>{t('validate.validateToken')}</button>
      </div>
      <div className="panel">{validationResult ? <>
        <div className="mini-stack">
          <div className="info-row"><span>{t('common.status')}</span><strong>{statusLabel(validationResult.status)}</strong></div>
          <div className="info-row"><span>{t('validate.signature')}</span><strong>{validationResult.verified ? t('validate.valid') : t('validate.notVerified')}</strong></div>
          <div className="info-row"><span>{t('validate.verificationConfigured')}</span><strong>{validationResult.verificationConfigured ? t('common.yes') : t('common.no')}</strong></div>
          <div className="info-row"><span>{t('licenses.graceEnds')}</span><strong>{formatDateTime(validationResult.graceEndsAt)}</strong></div>
        </div>
        <div className="field"><label>{t('validate.decodedPayload')}</label><pre className="code-block">{JSON.stringify(validationResult.payload, null, 2)}</pre></div>
      </> : <Notice tone="neutral">{t('validate.placeholder')}</Notice>}</div>
    </section>
  );
}
