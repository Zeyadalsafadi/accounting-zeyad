async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload.data;
}

export const api = {
  getBootstrap: () => request('/api/bootstrap'),
  getLicenses: (params) => {
    const searchParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value) searchParams.set(key, value);
    });
    const query = searchParams.toString();
    return request(`/api/licenses${query ? `?${query}` : ''}`);
  },
  getLicenseDetails: (id) => request(`/api/licenses/${id}`),
  getNextLicenseId: () => request('/api/licenses/next-id'),
  generateKeys: (body) => request('/api/keys/generate', { method: 'POST', body: JSON.stringify(body || {}) }),
  importKeys: (body) => request('/api/keys/import', { method: 'POST', body: JSON.stringify(body || {}) }),
  revealPrivateKey: () => request('/api/keys/reveal-private', { method: 'POST' }),
  issueLicense: (body) => request('/api/licenses/issue', { method: 'POST', body: JSON.stringify(body || {}) }),
  validateToken: (body) => request('/api/licenses/validate', { method: 'POST', body: JSON.stringify(body || {}) }),
  saveSettings: (body) => request('/api/settings', { method: 'PATCH', body: JSON.stringify(body || {}) })
};
