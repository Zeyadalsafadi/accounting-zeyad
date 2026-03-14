import { useEffect, useState } from 'react';
import api from '../services/api.js';

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.get('/dashboard/summary').then((res) => setSummary(res.data.data)).catch(() => setSummary(null));
  }, []);

  return (
    <section>
      <h2>لوحة التحكم</h2>
      <p>ملخص اليوم</p>

      <div className="stats-grid">
        <Stat title="مبيعات اليوم" value={summary?.sales ?? 0} />
        <Stat title="مشتريات اليوم" value={summary?.purchases ?? 0} />
        <Stat title="مصروفات اليوم" value={summary?.expenses ?? 0} />
        <Stat title="منتجات منخفضة المخزون" value={summary?.lowStock ?? 0} />
      </div>
    </section>
  );
}

function Stat({ title, value }) {
  return (
    <article className="stat-card">
      <h3>{title}</h3>
      <strong>{value}</strong>
    </article>
  );
}
