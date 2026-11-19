import React from "react";
import { TEAM_COLORS } from "../utils/teamColors";

/** 10 preset team colours as round swatches. value = hex or '' (theme default). */
export default function TeamColorPicker({ value, onChange, size = 26 }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }} role="radiogroup" aria-label="Team colour">
      {TEAM_COLORS.map((c) => {
        const active = String(value || "").toLowerCase() === c.hex;
        return (
          <button
            key={c.hex}
            type="button"
            role="radio"
            aria-checked={active}
            title={c.name}
            onClick={() => onChange(active ? "" : c.hex)}
            style={{
              width: size, height: size, borderRadius: "50%", background: c.hex, cursor: "pointer", padding: 0,
              border: active ? "3px solid #facc15" : "2px solid rgba(255,255,255,0.35)",
              boxShadow: active ? "0 0 0 2px rgba(0,0,0,0.5)" : "none",
            }}
          />
        );
      })}
      {value ? (
        <button type="button" onClick={() => onChange("")} style={{ background: "transparent", border: "none", color: "inherit", opacity: 0.7, fontSize: 11, cursor: "pointer" }}>
          reset
        </button>
      ) : (
        <span style={{ fontSize: 11, opacity: 0.6 }}>default</span>
      )}
    </div>
  );
}
