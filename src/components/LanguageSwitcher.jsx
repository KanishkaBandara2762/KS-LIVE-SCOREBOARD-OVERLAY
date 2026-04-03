import React from "react";
import { useLanguage } from "../i18n/LanguageContext";

const LanguageSwitcher = ({ className = "", compact = false }) => {
  const { language, setLanguage, t, languages } = useLanguage();

  return (
    <label className={className} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: compact ? 10 : 11, fontWeight: 800, textTransform: "uppercase", opacity: 0.75 }}>
        {t("language.label")}
      </span>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        style={{
          borderRadius: 8,
          padding: compact ? "6px 10px" : "8px 12px",
          fontSize: compact ? 11 : 12,
          fontWeight: 700
        }}
      >
        {languages.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
};

export default LanguageSwitcher;
