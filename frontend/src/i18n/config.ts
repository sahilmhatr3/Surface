import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "../locales/en.json";
import de from "../locales/de.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      de: { translation: de },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "de"],
    interpolation: { escapeValue: false },
    detection: {
      // Query string overrides cached language (e.g. /?lng=de for marketing links).
      order: ["querystring", "localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: "surface_i18nextLng",
      lookupQuerystring: "lng",
    },
    react: { useSuspense: false },
  });

function syncDocumentLang(lng: string) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng === "de" ? "de" : "en";
  }
}

syncDocumentLang(i18n.language);
i18n.on("languageChanged", syncDocumentLang);

export default i18n;
