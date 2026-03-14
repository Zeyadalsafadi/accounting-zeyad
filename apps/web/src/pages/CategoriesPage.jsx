import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api.js';

const initialForm = { id: null, name: '', nameEn: '', notes: '' };
const STATUS_FILTERS = [
  { value: 'active', label: 'النشطة' },
  { value: 'inactive', label: 'المعطلة' },
  { value: 'all', label: 'الكل' }
];

export default function CategoriesPage() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [statusFilter, setStatusFilter] = useState('active');
  const [error, setError] = useState('');

  const load = async (status = statusFilter) => {
    const res = await api.get('/categories', { params: { status } });
    setList(res.data.data || []);
  };

  useEffect(() => {
    load().catch(() => setError('تعذر تحميل التصنيفات'));
  }, [statusFilter]);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (form.id) {
        await api.patch(`/categories/${form.id}`, form);
      } else {
        await api.post('/categories', form);
      }
      setForm(initialForm);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'تعذر حفظ التصنيف');
    }
  };

  const disableItem = async (id) => {
    setError('');
    try {
      await api.patch(`/categories/${id}/disable`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'تعذر تعطيل التصنيف');
    }
  };

  const reactivateItem = async (id) => {
    setError('');
    try {
      await api.patch(`/categories/${id}/reactivate`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'تعذر إعادة تفعيل التصنيف');
    }
  };

  return (
    <main className="container">
      <header className="header-row">
        <h1>إدارة التصنيفات</h1>
        <Link className="btn" to="/">العودة</Link>
      </header>

      <section className="card">
        <h2>{form.id ? 'تعديل تصنيف' : 'إضافة تصنيف'}</h2>
        <form className="form-grid" onSubmit={save}>
          <input placeholder="الاسم بالعربية" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="الاسم بالإنجليزية (اختياري)" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
          <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="btn" type="submit">حفظ</button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <div className="header-actions" style={{ marginBottom: 10 }}>
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              className={`btn${statusFilter === filter.value ? ' secondary' : ''}`}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {list.map((item) => (
              <tr key={item.id}>
                <td>{item.name_ar}</td>
                <td>{item.is_active ? 'نشط' : 'معطل'}</td>
                <td className="actions">
                  <button className="btn" type="button" onClick={() => setForm({ id: item.id, name: item.name_ar || '', nameEn: item.name_en || '', notes: item.notes || '' })}>تعديل</button>
                  {item.is_active ? (
                    <button className="btn danger" type="button" onClick={() => disableItem(item.id)}>تعطيل</button>
                  ) : (
                    <button className="btn" type="button" onClick={() => reactivateItem(item.id)}>إعادة التفعيل</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
