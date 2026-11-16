import React from "react";

/* ================================================================
   Single source of truth for the overlay theme pickers
   (Mini Admin, Dashboard, Admin Panel). Add a theme here once and
   it appears in every picker.
   ================================================================ */
export const THEME_GROUPS = [
  {
    label: "★ Custom Screen Themes (unique full-screen graphics)",
    themes: [
      { id: "PRO_BROADCAST", label: "Pro Broadcast (navy bar + green screens)" },
      { id: "IPL_GOLD", label: "IPL Gold (navy & gold)" },
      { id: "KS_PREMIUM", label: "KS Premium (HUD broadcast)" },
      { id: "IPL_2026", label: "IPL 2026 Stadium Capsule" },
      { id: "SKY_PRO", label: "Sky Pro (clean white & red)" },
      { id: "LIGHTNING_BAR", label: "Lightning Bar (T10 two-logo)" },
      { id: "ABUDHABI_T10", label: "ABUDHABI T10 theme" },
      { id: "ICC_GLOBAL", label: "ICC T20 Global Apex (World Cup)" },
      { id: "SKY_HYPERION", label: "Sky Sports Hyperion Pro (UK)" },
      { id: "JIO_TITAN", label: "Jio Premier Titan (IPL 4K)" },
      { id: "FOX_STRIKE", label: "Fox Cricket BBL Strike (Action)" },
      { id: "SUPERSPORT_AURA", label: "SuperSport Aura Glass (Modern)" },
    ],
  },
  {
    label: "International Broadcast",
    themes: [
      { id: "APEX", label: "Apex (TV Broadcast)" },
      { id: "DIAMOND", label: "Diamond (Metallic)" },
      { id: "VOLT", label: "Volt (Lime Sports-Tech)" },
      { id: "THUNDER", label: "Thunder (Electric Red)" },
      { id: "BLITZ", label: "Blitz (Lightning Blue)" },
      { id: "ELITE", label: "Elite (Minimal Gold)" },
      { id: "FRANCHISE", label: "Franchise (Gradient)" },
      { id: "SHAKTI", label: "Shakti (Bold Contrast)" },
    ],
  },
  {
    label: "Premier Modern Themes",
    themes: [
      { id: "NEW_KS_COLOR", label: "Emerald Cricket Pro (KS Signature)" },
      { id: "NEW_IPL", label: "Tata IPL Modern (Franchise)" },
      { id: "WC2026", label: "T20 World Cup 2026 Electric" },
      { id: "APOGEE", label: "Apogee Arena Pro (Cyber Stadium)" },
      { id: "GOLD_CHAMPIONSHIP", label: "Gold Championship (Grand Finals)" },
    ],
  },
];

/** Flat list: [{ id, label }] */
export const THEMES = THEME_GROUPS.flatMap((g) => g.themes);

/** <option>s grouped by <optgroup>, for use inside any <select>. */
export function ThemeOptions() {
  return THEME_GROUPS.map((g) => (
    <optgroup key={g.label} label={g.label}>
      {g.themes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
    </optgroup>
  ));
}
