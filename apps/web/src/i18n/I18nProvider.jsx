import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { APP_BRAND, DEFAULT_LANGUAGE, LANGUAGES, LANGUAGE_STORAGE_KEY, translations } from './translations.js';

const I18nContext = createContext(null);

function translate(language, key) {
  return translations[language]?.[key] ?? translations[DEFAULT_LANGUAGE]?.[key] ?? key;
}

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem(LANGUAGE_STORAGE_KEY) || DEFAULT_LANGUAGE);
  const currentLanguage = LANGUAGES[language] || LANGUAGES[DEFAULT_LANGUAGE];

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage.code);
    document.documentElement.lang = currentLanguage.code;
    document.documentElement.dir = currentLanguage.dir;
    document.body.dir = currentLanguage.dir;
    document.title = APP_BRAND;
  }, [currentLanguage]);

  const value = useMemo(() => ({
    language: currentLanguage.code,
    dir: currentLanguage.dir,
    languages: Object.values(LANGUAGES),
    setLanguage: (nextLanguage) => setLanguage(LANGUAGES[nextLanguage] ? nextLanguage : DEFAULT_LANGUAGE),
    t: (key) => translate(currentLanguage.code, key),
    brand: APP_BRAND
  }), [currentLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
