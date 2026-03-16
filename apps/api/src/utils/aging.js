function toNumber(value) {
  return Number(value ?? 0);
}

function diffDays(fromDate, toDate) {
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  return Math.max(0, Math.floor((end - start) / 86400000));
}

function createBuckets() {
  return {
    current: 0,
    days31To60: 0,
    days61To90: 0,
    days90Plus: 0
  };
}

function bucketKeyForAge(ageInDays) {
  if (ageInDays <= 30) return 'current';
  if (ageInDays <= 60) return 'days31To60';
  if (ageInDays <= 90) return 'days61To90';
  return 'days90Plus';
}

export function computeAgingFromEntries({
  entries,
  settlements,
  asOfDate
}) {
  const debitQueue = [...entries]
    .filter((item) => toNumber(item.amount) > 0)
    .map((item) => ({
      ...item,
      amount: toNumber(item.amount),
      remaining: toNumber(item.amount)
    }))
    .sort((a, b) => {
      if (a.type === 'OPENING' && b.type !== 'OPENING') return -1;
      if (a.type !== 'OPENING' && b.type === 'OPENING') return 1;
      return String(a.date).localeCompare(String(b.date));
    });

  const creditQueue = [...settlements]
    .filter((item) => toNumber(item.amount) > 0)
    .map((item) => ({ ...item, amount: toNumber(item.amount) }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  let unappliedCredits = 0;

  for (const credit of creditQueue) {
    let remainingCredit = credit.amount;
    for (const debit of debitQueue) {
      if (remainingCredit <= 0) break;
      if (debit.remaining <= 0) continue;
      const applied = Math.min(debit.remaining, remainingCredit);
      debit.remaining -= applied;
      remainingCredit -= applied;
    }
    if (remainingCredit > 0) {
      unappliedCredits += remainingCredit;
    }
  }

  const buckets = createBuckets();

  for (const debit of debitQueue) {
    if (debit.remaining <= 0) continue;
    const bucketKey = debit.type === 'OPENING'
      ? 'days90Plus'
      : bucketKeyForAge(diffDays(debit.date, asOfDate));
    buckets[bucketKey] += debit.remaining;
  }

  const totalOutstanding = Object.values(buckets).reduce((sum, value) => sum + value, 0);

  return {
    ...buckets,
    totalOutstanding,
    unappliedCredits
  };
}

