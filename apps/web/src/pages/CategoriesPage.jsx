import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

const initialForm = { id: null, name: '', nameEn: '', notes: '' };

export default function CategoriesPage() {
  const { t } = useI18n();
  const statusFilters = useMemo(() => ([
    { value: 'active', label: t('activeCategories') },
    { value: 'inactive', label: t('inactiveCategories') },
    { value: 'all', label: t('allFilter') }
  ]), [t]);

  const [list, setList] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [statusFilter, setStatusFilter] = useState('active');
  const [error, setError] = useState('');

  const load = async (status = statusFilter) => {
    const res = await api.get('/categories', { params: { status } });
    setList(res.data.data || []);
  };

  useEffect(() => {
    load().catch(() => setError(t('loadingCategoriesFailed')));
  }, [statusFilter, t]);

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
      setError(err.response?.data?.error || t('categorySaveFailed'));
    }
  };

  const disableItem = async (id) => {
    setError('');
    try {
      await api.patch(`/categories/${id}/disable`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || t('categoryDisableFailed'));
    }
  };

  const reactivateItem = async (id) => {
    setError('');
    try {
      await api.patch(`/categories/${id}/reactivate`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || t('categoryReactivateFailed'));
    }
  };

  return (
    <main className="container">
      <header className="header-row">
        <h1>{t('categoriesTitle')}</h1>
        <Link className="btn" to="/">{t('back')}</Link>
      </header>

      <section className="card">
        <h2>{form.id ? t('editCategory') : t('addCategoryTitle')}</h2>
        <form className="form-grid" onSubmit={save}>
          <input placeholder={t('categoryNameArabic')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder={t('categoryNameEnglish')} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
          <input placeholder={t('notesField')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="btn" type="submit">{t('save')}</button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <div className="header-actions" style={{ marginBottom: 10 }}>
          {statusFilters.map((filter) => (
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
              <th>{t('categoryField')}</th>
              <th>{t('status')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((item) => (
              <tr key={item.id}>
                <td>{item.name_ar}</td>
                <td>{item.is_active ? t('active') : t('inactive')}</td>
                <td className="actions">
                  <button className="btn" type="button" onClick={() => setForm({ id: item.id, name: item.name_ar || '', nameEn: item.name_en || '', notes: item.notes || '' })}>{t('edit')}</button>
                  {item.is_active ? (
                    <button className="btn danger" type="button" onClick={() => disableItem(item.id)}>{t('disable')}</button>
                  ) : (
                    <button className="btn" type="button" onClick={() => reactivateItem(item.id)}>{t('reactivate')}</button>
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
