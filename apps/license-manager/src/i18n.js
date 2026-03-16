const translations = {
  en: {
    dir: 'ltr',
    languageName: 'English',
    views: {
      dashboard: 'Dashboard',
      keys: 'Keys',
      issue: 'Issue License',
      licenses: 'Issued Licenses',
      validate: 'Validate License',
      settings: 'Settings',
      help: 'User Guide'
    },
    brand: {
      localOwnerUtility: 'Local Owner Utility',
      title: 'دكانتي MyShop',
      subtitle: 'License Manager',
      ownerWorkflow: 'Owner-side workflow'
    },
    header: {
      refresh: 'Refresh',
      copyLastToken: 'Copy last token'
    },
    sidebar: {
      signingKey: 'Signing key',
      readyToIssue: 'Ready to issue',
      publicOnlyLoaded: 'Public-only key loaded',
      notConfigured: 'Not configured',
      generateOrImportFirst: 'Generate or import keys first'
    },
    common: {
      customer: 'Customer',
      customerName: 'Customer name',
      licenseId: 'License ID',
      plan: 'Plan',
      status: 'Status',
      expires: 'Expires',
      issuedAt: 'Issued at',
      expiresAt: 'Expires at',
      graceDays: 'Grace days',
      maxDevices: 'Max devices',
      enabledModules: 'Enabled modules',
      internalNotes: 'Internal notes',
      label: 'Label',
      publicKey: 'Public key',
      privateKey: 'Private key',
      loaded: 'Loaded',
      missing: 'Missing',
      storagePath: 'Storage path',
      yes: 'Yes',
      no: 'No',
      apply: 'Apply',
      code: 'Code',
      name: 'Name',
      save: 'Save',
      allPlans: 'All plans',
      allStates: 'All states',
      active: 'Active',
      expiringSoon: 'Expiring Soon',
      expired: 'Expired'
    },
    dashboard: {
      totalIssued: 'Total Issued',
      active: 'Active',
      expiringSoon: 'Expiring Soon',
      expired: 'Expired',
      keyStatus: 'Key Status',
      recentLicenses: 'Recent licenses'
    },
    keys: {
      activeKey: 'Active Key',
      publicFingerprint: 'Public fingerprint',
      privateFingerprint: 'Private fingerprint',
      publicKeyPem: 'Public key PEM',
      envSnippet: '.env snippet',
      copyPublicKey: 'Copy Public Key',
      exportPublicKey: 'Export Public Key',
      copyEnv: 'Copy `.env`',
      exportEnv: 'Export `.env`',
      revealPrivateKey: 'Reveal Private Key',
      sensitivePrivateKey: 'Sensitive private key',
      privateKeyWarning: 'This private key must remain owner-side only. Do not send it to customers or place it in the deployed API/web app.',
      generateNewKeyPair: 'Generate New Key Pair',
      keyLabel: 'Key label',
      generateKeyPair: 'Generate Key Pair',
      importExistingKeys: 'Import Existing Keys',
      importLabel: 'Import label',
      privateKeyPem: 'Private key PEM',
      importKeys: 'Import Keys',
      confirmRevealPrivateKey: 'Reveal the private key? This is sensitive material and should never be shared with customers.'
    },
    issue: {
      title: 'Issue License',
      renewTitle: 'Renew License',
      reissueTitle: 'Reissue License',
      allowDuplicateLicenseId: 'Allow duplicate license ID',
      generateLicenseId: 'Generate License ID',
      issueLicense: 'Issue License',
      issuing: 'Issuing...',
      payloadPreview: 'Payload Preview',
      issuedToken: 'Issued Token',
      copyToken: 'Copy Token',
      exportToken: 'Export Token',
      exportRecord: 'Export Record',
      issueNotice: 'Issue a license to generate the final `PSL1.payload.signature` token.'
    },
    licenses: {
      title: 'Issued Licenses',
      newestFirst: 'Newest first',
      oldestFirst: 'Oldest first',
      expirationSoonest: 'Expiration soonest',
      expirationLatest: 'Expiration latest',
      finalToken: 'Final token',
      payload: 'Payload',
      history: 'History',
      renew: 'Renew',
      reissue: 'Reissue',
      copyToken: 'Copy Token',
      daysRemaining: 'Days remaining',
      graceEnds: 'Grace ends',
      noSelection: 'Select a license record to inspect the payload, token, and history.'
    },
    validate: {
      title: 'Validate License',
      licenseToken: 'License token',
      validateToken: 'Validate Token',
      signature: 'Signature',
      verificationConfigured: 'Verification configured',
      decodedPayload: 'Decoded payload',
      valid: 'Valid',
      notVerified: 'Not verified',
      placeholder: 'Validation results appear here.'
    },
    settings: {
      title: 'Settings',
      keyStoragePath: 'Key storage path',
      defaultGraceDays: 'Default grace days',
      expiringSoonThreshold: 'Expiring soon threshold',
      licenseIdPrefix: 'License ID prefix',
      addPlan: 'Add Plan',
      removePlan: 'Remove Plan',
      saveSettings: 'Save Settings',
      saving: 'Saving...'
    },
    help: {
      title: 'User Guide',
      intro: 'This page gives the owner a direct in-app workflow for generating keys, issuing licenses, renewing them, and validating tokens.',
      sections: {
        start: 'Start the manager',
        keys: 'Prepare the keys',
        api: 'Configure the API',
        issue: 'Issue a new license',
        customer: 'What goes to the customer',
        renew: 'Renew or reissue',
        validate: 'Validate a token',
        security: 'Security rules'
      },
      steps: {
        start1: 'Run `npm run dev:license-manager` from the monorepo root.',
        start2: 'Open the local manager UI in your browser.',
        keys1: 'Use Keys to generate a new signing pair or import your existing PEM files.',
        keys2: 'Keep the private key on the owner machine only.',
        api1: 'Copy the `.env` snippet from Keys and place the public key in the API configuration.',
        api2: 'Never place the private key in the API `.env`.',
        issue1: 'Open Issue License and fill customer, license ID, plan, expiration, modules, and notes.',
        issue2: 'Click Issue License to generate the final `PSL1.payload.signature` token.',
        customer1: 'Send the final token to the customer only.',
        customer2: 'Do not send PEM files or the private key.',
        renew1: 'Open Issued Licenses, select a record, then use Renew or Reissue.',
        renew2: 'Every renewal or reissue is kept in local history.',
        validate1: 'Paste any token in Validate License to inspect payload, signature, and status.',
        security1: 'Never commit generated key files to the repository.',
        security2: 'Store backups of the private key securely and separately from customer systems.'
      }
    },
    notices: {
      copied: ({ label }) => `${label} copied to clipboard.`,
      copyFailed: ({ label }) => `Could not copy ${label.toLowerCase()}.`,
      keyGenerated: 'A new signing key pair has been generated and stored locally.',
      keyImported: 'Key material imported and activated.',
      licenseIssued: ({ licenseId }) => `License ${licenseId} issued successfully.`,
      settingsSaved: 'Settings saved.'
    },
    validation: {
      customerNameRequired: 'Customer name is required.',
      licenseIdRequired: 'License ID is required.',
      planRequired: 'Plan is required.',
      expirationRequired: 'Expiration date is required.',
      atLeastOneModule: 'Select at least one enabled module.',
      invalidDates: 'Issued and expiration dates must be valid.',
      expirationBeforeIssue: 'Expiration date cannot be before the issue date.'
    },
    statuses: {
      active: 'Active',
      'expiring-soon': 'Expiring Soon',
      expired: 'Expired',
      ACTIVE: 'ACTIVE',
      GRACE: 'GRACE',
      EXPIRED: 'EXPIRED',
      INVALID: 'INVALID',
      UNCONFIGURED: 'UNCONFIGURED'
    },
    modules: {
      sales: 'Sales',
      purchases: 'Purchases',
      inventory: 'Inventory',
      customers: 'Customers',
      suppliers: 'Suppliers',
      reports: 'Reports',
      'cash-management': 'Cash Management',
      expenses: 'Expenses',
      'exchange-rate': 'Exchange Rate',
      'currency-exchange': 'Currency Exchange',
      settings: 'Settings'
    }
  },
  ar: {
    dir: 'rtl',
    languageName: 'العربية',
    views: {
      dashboard: 'لوحة التحكم',
      keys: 'المفاتيح',
      issue: 'إصدار ترخيص',
      licenses: 'التراخيص الصادرة',
      validate: 'التحقق من الترخيص',
      settings: 'الإعدادات',
      help: 'دليل الاستخدام'
    },
    brand: {
      localOwnerUtility: 'أداة محلية للمالك',
      title: 'دكانتي MyShop',
      subtitle: 'إدارة التراخيص',
      ownerWorkflow: 'سير عمل المالك'
    },
    header: {
      refresh: 'تحديث',
      copyLastToken: 'نسخ آخر توكن'
    },
    sidebar: {
      signingKey: 'مفتاح التوقيع',
      readyToIssue: 'جاهز للإصدار',
      publicOnlyLoaded: 'تم تحميل مفتاح عام فقط',
      notConfigured: 'غير مهيأ',
      generateOrImportFirst: 'قم بتوليد المفاتيح أو استيرادها أولاً'
    },
    common: {
      customer: 'العميل',
      customerName: 'اسم العميل',
      licenseId: 'رقم الترخيص',
      plan: 'الخطة',
      status: 'الحالة',
      expires: 'ينتهي في',
      issuedAt: 'تاريخ الإصدار',
      expiresAt: 'تاريخ الانتهاء',
      graceDays: 'أيام السماح',
      maxDevices: 'الحد الأقصى للأجهزة',
      enabledModules: 'الوحدات المفعلة',
      internalNotes: 'ملاحظات داخلية',
      label: 'الاسم',
      publicKey: 'المفتاح العام',
      privateKey: 'المفتاح الخاص',
      loaded: 'موجود',
      missing: 'غير موجود',
      storagePath: 'مسار التخزين',
      yes: 'نعم',
      no: 'لا',
      apply: 'تطبيق',
      code: 'الرمز',
      name: 'الاسم',
      save: 'حفظ',
      allPlans: 'كل الخطط',
      allStates: 'كل الحالات',
      active: 'نشط',
      expiringSoon: 'قريب الانتهاء',
      expired: 'منتهي'
    },
    dashboard: {
      totalIssued: 'إجمالي التراخيص',
      active: 'النشطة',
      expiringSoon: 'قريبة الانتهاء',
      expired: 'المنتهية',
      keyStatus: 'حالة المفاتيح',
      recentLicenses: 'أحدث التراخيص'
    },
    keys: {
      activeKey: 'المفتاح النشط',
      publicFingerprint: 'بصمة المفتاح العام',
      privateFingerprint: 'بصمة المفتاح الخاص',
      publicKeyPem: 'المفتاح العام PEM',
      envSnippet: 'مقطع .env',
      copyPublicKey: 'نسخ المفتاح العام',
      exportPublicKey: 'تصدير المفتاح العام',
      copyEnv: 'نسخ `.env`',
      exportEnv: 'تصدير `.env`',
      revealPrivateKey: 'إظهار المفتاح الخاص',
      sensitivePrivateKey: 'مفتاح خاص حساس',
      privateKeyWarning: 'يجب أن يبقى هذا المفتاح الخاص لدى المالك فقط. لا ترسله للعملاء ولا تضعه داخل التطبيق أو الـ API المنشور.',
      generateNewKeyPair: 'توليد زوج مفاتيح جديد',
      keyLabel: 'اسم المفتاح',
      generateKeyPair: 'توليد زوج المفاتيح',
      importExistingKeys: 'استيراد مفاتيح موجودة',
      importLabel: 'اسم الاستيراد',
      privateKeyPem: 'المفتاح الخاص PEM',
      importKeys: 'استيراد المفاتيح',
      confirmRevealPrivateKey: 'هل تريد إظهار المفتاح الخاص؟ هذه مادة حساسة ولا يجب مشاركتها مع العملاء.'
    },
    issue: {
      title: 'إصدار ترخيص',
      renewTitle: 'تجديد ترخيص',
      reissueTitle: 'إعادة إصدار ترخيص',
      allowDuplicateLicenseId: 'السماح بتكرار رقم الترخيص',
      generateLicenseId: 'توليد رقم ترخيص',
      issueLicense: 'إصدار الترخيص',
      issuing: 'جارٍ الإصدار...',
      payloadPreview: 'معاينة البيانات',
      issuedToken: 'التوكن الصادر',
      copyToken: 'نسخ التوكن',
      exportToken: 'تصدير التوكن',
      exportRecord: 'تصدير السجل',
      issueNotice: 'قم بإصدار ترخيص لتوليد التوكن النهائي `PSL1.payload.signature`.'
    },
    licenses: {
      title: 'التراخيص الصادرة',
      newestFirst: 'الأحدث أولاً',
      oldestFirst: 'الأقدم أولاً',
      expirationSoonest: 'الأقرب انتهاءً',
      expirationLatest: 'الأبعد انتهاءً',
      finalToken: 'التوكن النهائي',
      payload: 'البيانات',
      history: 'السجل',
      renew: 'تجديد',
      reissue: 'إعادة إصدار',
      copyToken: 'نسخ التوكن',
      daysRemaining: 'الأيام المتبقية',
      graceEnds: 'تنتهي فترة السماح',
      noSelection: 'اختر سجل ترخيص لعرض البيانات والتوكن والسجل.'
    },
    validate: {
      title: 'التحقق من الترخيص',
      licenseToken: 'توكن الترخيص',
      validateToken: 'التحقق من التوكن',
      signature: 'التوقيع',
      verificationConfigured: 'التحقق مهيأ',
      decodedPayload: 'البيانات المفكوكة',
      valid: 'صحيح',
      notVerified: 'غير متحقق',
      placeholder: 'ستظهر نتائج التحقق هنا.'
    },
    settings: {
      title: 'الإعدادات',
      keyStoragePath: 'مسار حفظ المفاتيح',
      defaultGraceDays: 'أيام السماح الافتراضية',
      expiringSoonThreshold: 'عتبة قريب الانتهاء',
      licenseIdPrefix: 'بادئة رقم الترخيص',
      addPlan: 'إضافة خطة',
      removePlan: 'حذف الخطة',
      saveSettings: 'حفظ الإعدادات',
      saving: 'جارٍ الحفظ...'
    },
    help: {
      title: 'دليل الاستخدام',
      intro: 'هذه الصفحة تعطي المالك خطوات مباشرة من داخل البرنامج لتوليد المفاتيح وإصدار التراخيص وتجديدها والتحقق من التوكن.',
      sections: {
        start: 'تشغيل البرنامج',
        keys: 'تجهيز المفاتيح',
        api: 'إعداد الـ API',
        issue: 'إصدار ترخيص جديد',
        customer: 'ما الذي يُرسل للعميل',
        renew: 'التجديد أو إعادة الإصدار',
        validate: 'التحقق من توكن',
        security: 'قواعد الأمان'
      },
      steps: {
        start1: 'شغّل `npm run dev:license-manager` من جذر المشروع.',
        start2: 'افتح واجهة المدير المحلية من المتصفح.',
        keys1: 'من صفحة المفاتيح قم بتوليد زوج مفاتيح جديد أو استيراد ملفات PEM الحالية.',
        keys2: 'احفظ المفتاح الخاص على جهاز المالك فقط.',
        api1: 'انسخ مقطع `.env` من صفحة المفاتيح وضع المفتاح العام في إعدادات الـ API.',
        api2: 'لا تضع المفتاح الخاص داخل `.env` الخاص بالـ API.',
        issue1: 'افتح صفحة إصدار الترخيص واملأ العميل ورقم الترخيص والخطة والانتهاء والوحدات والملاحظات.',
        issue2: 'اضغط إصدار الترخيص لتوليد التوكن النهائي `PSL1.payload.signature`.',
        customer1: 'الذي يُرسل للعميل هو التوكن النهائي فقط.',
        customer2: 'لا ترسل ملفات PEM أو المفتاح الخاص.',
        renew1: 'افتح صفحة التراخيص الصادرة وحدد السجل ثم استخدم تجديد أو إعادة إصدار.',
        renew2: 'كل عملية تجديد أو إعادة إصدار تبقى محفوظة في السجل المحلي.',
        validate1: 'ألصق أي توكن في صفحة التحقق لفحص البيانات والتوقيع والحالة.',
        security1: 'لا تقم بإدخال ملفات المفاتيح المولدة إلى المستودع.',
        security2: 'احتفظ بنسخ المفتاح الخاص الاحتياطية بشكل آمن وبعيد عن أجهزة العملاء.'
      }
    },
    notices: {
      copied: ({ label }) => `تم نسخ ${label}.`,
      copyFailed: ({ label }) => `تعذر نسخ ${label}.`,
      keyGenerated: 'تم توليد زوج مفاتيح جديد وحفظه محليًا.',
      keyImported: 'تم استيراد المفاتيح وتفعيلها.',
      licenseIssued: ({ licenseId }) => `تم إصدار الترخيص ${licenseId} بنجاح.`,
      settingsSaved: 'تم حفظ الإعدادات.'
    },
    validation: {
      customerNameRequired: 'اسم العميل مطلوب.',
      licenseIdRequired: 'رقم الترخيص مطلوب.',
      planRequired: 'الخطة مطلوبة.',
      expirationRequired: 'تاريخ الانتهاء مطلوب.',
      atLeastOneModule: 'اختر وحدة مفعلة واحدة على الأقل.',
      invalidDates: 'يجب أن تكون تواريخ الإصدار والانتهاء صحيحة.',
      expirationBeforeIssue: 'لا يمكن أن يكون تاريخ الانتهاء قبل تاريخ الإصدار.'
    },
    statuses: {
      active: 'نشط',
      'expiring-soon': 'قريب الانتهاء',
      expired: 'منتهي',
      ACTIVE: 'نشط',
      GRACE: 'سماح',
      EXPIRED: 'منتهي',
      INVALID: 'غير صالح',
      UNCONFIGURED: 'غير مهيأ'
    },
    modules: {
      sales: 'المبيعات',
      purchases: 'المشتريات',
      inventory: 'المخزون',
      customers: 'العملاء',
      suppliers: 'الموردون',
      reports: 'التقارير',
      'cash-management': 'إدارة النقد',
      expenses: 'المصروفات',
      'exchange-rate': 'سعر الصرف',
      'currency-exchange': 'صرف العملات',
      settings: 'الإعدادات'
    }
  }
};

function getValue(source, key) {
  return key.split('.').reduce((current, part) => current?.[part], source);
}

export const LANGUAGE_OPTIONS = [
  { value: 'ar', label: 'العربية' },
  { value: 'en', label: 'English' }
];

export function createTranslator(language) {
  const locale = translations[language] || translations.en;

  return {
    dir: locale.dir || 'ltr',
    t(key, params = {}) {
      const value = getValue(locale, key) ?? getValue(translations.en, key) ?? key;
      return typeof value === 'function' ? value(params) : value;
    }
  };
}
