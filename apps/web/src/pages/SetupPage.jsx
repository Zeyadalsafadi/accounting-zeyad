const modules = [
  'التصنيفات',
  'المنتجات',
  'الموردون',
  'العملاء',
  'المشتريات',
  'المبيعات',
  'حركات المخزون',
  'حسابات الصندوق',
  'حركات الصندوق',
  'المصاريف',
  'التقارير الأساسية'
];

export default function SetupPage() {
  return (
    <section>
      <h2>المرحلة الحالية: تأسيس MVP</h2>
      <p>تم إعداد الهيكل الأساسي للواجهة والخلفية وقاعدة البيانات.</p>
      <ul className="module-list">
        {modules.map((module) => (
          <li key={module}>{module}</li>
        ))}
      </ul>
    </section>
  );
}
