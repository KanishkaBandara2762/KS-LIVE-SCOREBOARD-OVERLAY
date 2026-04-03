import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import en from "../locales/en.json";
import si from "../locales/si.json";
import hi from "../locales/hi.json";

const STORAGE_KEY = "ks_language";

const dictionaries = { en, si, hi };

const LanguageContext = createContext({
  language: "en",
  setLanguage: () => {},
  t: (key) => key,
  languages: []
});

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => localStorage.getItem(STORAGE_KEY) || "en");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  const value = useMemo(() => {
    const dictionary = dictionaries[language] || dictionaries.en;

    return {
      language,
      setLanguage,
      t: (key) => dictionary[key] || dictionaries.en[key] || key,
      languages: [
        { code: "en", label: dictionary["language.english"] || "English" },
        { code: "si", label: dictionary["language.sinhala"] || "Sinhala" },
        { code: "hi", label: dictionary["language.hindi"] || "Hindi" }
      ]
    };
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => useContext(LanguageContext);
