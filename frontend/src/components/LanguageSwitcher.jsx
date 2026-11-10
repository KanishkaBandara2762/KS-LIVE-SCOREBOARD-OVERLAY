import React from "react";
import { useLanguage } from "../i18n/LanguageContext";

const LanguageSwitcher = ({ className = "", compact = false }) => {
  const { language, setLanguage, t, languages } = useLanguage();

  return (
    <label className={className} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        style={{
          borderRadius: 8,
          padding: compact ? "6px 10px" : "8px 12px",
          fontSize: compact ? 11 : 12,
          fontWeight: 700,
          background: "#1e293b",
          color: "#f8fafc",
          border: "1px solid #334155",
          outline: "none",
          cursor: "pointer",
          minHeight: 0 // mobile.css forces 44px min-height on selects
        }}
      >
        {languages.map((item) => (
          <option key={item.code} value={item.code} style={{ background: "#1e293b", color: "#f8fafc" }}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
};

export default LanguageSwitcher;
