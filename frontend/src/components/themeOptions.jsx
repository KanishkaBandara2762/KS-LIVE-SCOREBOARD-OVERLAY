import React from "react";

/* ================================================================
   Single source of truth for the overlay theme pickers
   (Mini Admin, Dashboard, Admin Panel). Only these five themes are
   offered to users; matches already using another theme keep working.
   ================================================================ */
export const THEME_GROUPS = [
  {
    label: "Overlay Themes",
    themes: [
      { id: "PRO_BROADCAST", label: "Pro Broadcast (navy bar + green screens)" },
      { id: "IPL_GOLD", label: "IPL Gold (navy & gold)" },
      { id: "KS_PREMIUM", label: "KS Premium (HUD broadcast)" },
      { id: "IPL_2026", label: "IPL 2026 Stadium Capsule" },
      { id: "LIGHTNING_BAR", label: "Lightning Bar (T10 two-logo)" },
    ],
  },
];

/** Flat list: [{ id, label }] */
export const THEMES = THEME_GROUPS.flatMap((g) => g.themes);

/**
 * <option>s for any <select>. Pass `current` (the match's theme) so a match that
 * still uses an older, now-hidden theme keeps showing it instead of a blank choice.
 */
export function ThemeOptions({ current } = {}) {
  const known = THEMES.some((t) => t.id === current);
  return (
    <>
      {current && !known && <option value={current}>{current.replace(/_/g, " ")} (older theme)</option>}
      {THEME_GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.themes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </optgroup>
      ))}
    </>
  );
}
