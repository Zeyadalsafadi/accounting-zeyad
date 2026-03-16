export function formatExchangeRate(value, fallback = '-') {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed.toFixed(2);
}
