export function toCommercialSyp(amount, currency = 'SYP', activeRate = 1) {
  const numericAmount = Number(amount || 0);
  const numericRate = Number(activeRate || 0);

  if (currency === 'USD') {
    return numericRate > 0 ? numericAmount * numericRate : 0;
  }

  return numericAmount;
}

export function formatCommercialSyp(amount, currency = 'SYP', activeRate = 1) {
  return `${toCommercialSyp(amount, currency, activeRate).toFixed(2)} SYP`;
}
