import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    // React already escapes by default.
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;
