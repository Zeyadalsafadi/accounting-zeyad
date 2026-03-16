import crypto from 'node:crypto';
import {
  LICENSE_PREFIX,
  calculateLicenseState,
  formatPublicKeyForEnv,
  getLicenseMessage,
  normalizeEnabledModules,
  normalizeIsoDate,
  normalizeLicensePayload,
  normalizePublicKey,
  serializeLicensePayload,
  validateLicensePayload
} from './license-common.js';

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(segment) {
  const normalized = String(segment || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding === 0 ? normalized : normalized + '='.repeat(4 - padding);
  return Buffer.from(padded, 'base64');
}

function exportPem(keyObject, kind) {
  if (kind === 'public') {
    return keyObject.export({ type: 'spki', format: 'pem' }).toString();
  }

  return keyObject.export({ type: 'pkcs8', format: 'pem' }).toString();
}

function fingerprintKeyObject(keyObject, kind) {
  const exported = kind === 'public'
    ? keyObject.export({ type: 'spki', format: 'der' })
    : keyObject.export({ type: 'pkcs8', format: 'der' });

  return crypto.createHash('sha256').update(exported).digest('hex');
}

export function fingerprintPublicKey(publicKeyPem) {
  return fingerprintKeyObject(crypto.createPublicKey(normalizePublicKey(publicKeyPem)), 'public');
}

export function fingerprintPrivateKey(privateKeyPem) {
  return fingerprintKeyObject(crypto.createPrivateKey(String(privateKeyPem || '').trim()), 'private');
}

export function getPublicKeyFromPrivateKey(privateKeyPem) {
  const privateKey = crypto.createPrivateKey(String(privateKeyPem || '').trim());
  return exportPem(crypto.createPublicKey(privateKey), 'public');
}

export function generateLicenseKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  return { publicKey, privateKey };
}

export function validateKeyPair({ privateKeyPem = '', publicKeyPem = '' }) {
  const normalizedPrivateKey = String(privateKeyPem || '').trim();
  const normalizedPublicKey = normalizePublicKey(publicKeyPem);

  if (!normalizedPrivateKey && !normalizedPublicKey) {
    throw new Error('يجب توفير المفتاح الخاص أو المفتاح العام على الأقل');
  }

  let privateKeyObject = null;
  let publicKeyObject = null;

  if (normalizedPrivateKey) {
    privateKeyObject = crypto.createPrivateKey(normalizedPrivateKey);
    publicKeyObject = crypto.createPublicKey(privateKeyObject);
  }

  if (normalizedPublicKey) {
    const importedPublicKey = crypto.createPublicKey(normalizedPublicKey);
    if (!publicKeyObject) {
      publicKeyObject = importedPublicKey;
    }

    if (privateKeyObject) {
      const expectedFingerprint = fingerprintKeyObject(publicKeyObject, 'public');
      const importedFingerprint = fingerprintKeyObject(importedPublicKey, 'public');
      if (expectedFingerprint !== importedFingerprint) {
        throw new Error('المفتاح العام لا يطابق المفتاح الخاص');
      }
    }
  }

  if (privateKeyObject && publicKeyObject) {
    const challenge = Buffer.from('paint-shop-license-manager-key-check', 'utf8');
    const signature = crypto.sign('sha256', challenge, privateKeyObject);
    const verified = crypto.verify('sha256', challenge, publicKeyObject, signature);
    if (!verified) {
      throw new Error('تعذر التحقق من مطابقة زوج المفاتيح');
    }
  }

  return {
    privateKeyPem: normalizedPrivateKey || null,
    publicKeyPem: publicKeyObject ? exportPem(publicKeyObject, 'public') : null,
    publicKeyFingerprint: publicKeyObject ? fingerprintKeyObject(publicKeyObject, 'public') : null,
    privateKeyFingerprint: privateKeyObject ? fingerprintKeyObject(privateKeyObject, 'private') : null
  };
}

export function createLicenseToken(payload, privateKeyPem, { issuedAt = new Date().toISOString() } = {}) {
  const normalizedPayload = normalizeLicensePayload(payload, { defaultIssuedAt: issuedAt });
  validateLicensePayload(normalizedPayload);

  const payloadSegment = toBase64Url(Buffer.from(serializeLicensePayload(normalizedPayload), 'utf8'));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(payloadSegment);
  signer.end();

  const signatureSegment = toBase64Url(signer.sign(String(privateKeyPem || '').trim()));
  return `${LICENSE_PREFIX}.${payloadSegment}.${signatureSegment}`;
}

export function parseLicenseToken(licenseKey) {
  const segments = String(licenseKey || '').trim().split('.');
  if (segments.length !== 3 || segments[0] !== LICENSE_PREFIX) {
    throw new Error('صيغة مفتاح الترخيص غير صحيحة');
  }

  let rawPayload;
  try {
    rawPayload = JSON.parse(fromBase64Url(segments[1]).toString('utf8'));
  } catch {
    throw new Error('تعذر قراءة بيانات مفتاح الترخيص');
  }

  const payload = normalizeLicensePayload(rawPayload);
  validateLicensePayload(payload);

  return {
    licenseKey: String(licenseKey || '').trim(),
    payloadSegment: segments[1],
    signatureSegment: segments[2],
    signatureBuffer: fromBase64Url(segments[2]),
    payload
  };
}

export function verifyLicenseSignature(parsedLicenseOrKey, publicKeyPem) {
  const parsedLicense = typeof parsedLicenseOrKey === 'string'
    ? parseLicenseToken(parsedLicenseOrKey)
    : parsedLicenseOrKey;
  const publicKey = normalizePublicKey(publicKeyPem);

  if (!publicKey) {
    throw new Error('لم تتم تهيئة المفتاح العام للتحقق من الترخيص');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(parsedLicense.payloadSegment);
  verifier.end();

  return verifier.verify(publicKey, parsedLicense.signatureBuffer);
}

export function evaluateLicenseToken(licenseKey, { publicKey = '', allowUnconfigured = false, now = new Date() } = {}) {
  const parsedLicense = parseLicenseToken(licenseKey);
  const verificationConfigured = Boolean(normalizePublicKey(publicKey));

  if (!verificationConfigured && !allowUnconfigured) {
    throw new Error('لم تتم تهيئة المفتاح العام للتحقق من الترخيص');
  }

  if (!verificationConfigured) {
    return {
      status: 'UNCONFIGURED',
      message: getLicenseMessage('UNCONFIGURED'),
      verificationConfigured: false,
      verified: false,
      payload: parsedLicense.payload,
      enabledModules: parsedLicense.payload.enabledModules,
      maxDevices: parsedLicense.payload.maxDevices,
      daysRemaining: null,
      graceEndsAt: null
    };
  }

  if (!verifyLicenseSignature(parsedLicense, publicKey)) {
    throw new Error('تعذر التحقق من توقيع الترخيص');
  }

  const state = calculateLicenseState(parsedLicense.payload, now);
  return {
    status: state.status,
    message: getLicenseMessage(state.status),
    verificationConfigured: true,
    verified: true,
    payload: parsedLicense.payload,
    enabledModules: parsedLicense.payload.enabledModules,
    maxDevices: parsedLicense.payload.maxDevices,
    daysRemaining: state.daysRemaining,
    graceEndsAt: state.graceEndsAt
  };
}

export {
  LICENSE_PREFIX,
  calculateLicenseState,
  formatPublicKeyForEnv,
  getLicenseMessage,
  normalizeEnabledModules,
  normalizeIsoDate,
  normalizeLicensePayload,
  normalizePublicKey,
  serializeLicensePayload,
  validateLicensePayload
};
