/**
 * Team colours: the 10 preset colours a team can choose, helpers to pick a
 * readable text colour on any team colour, and a resolver that maps the two
 * permanent team colours (team1Color / team2Color) onto batting / bowling.
 */
export const TEAM_COLORS = [
  { name: "Red", hex: "#dc2626" },
  { name: "Blue", hex: "#2563eb" },
  { name: "Green", hex: "#16a34a" },
  { name: "Orange", hex: "#f97316" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Purple", hex: "#7c3aed" },
  { name: "Pink", hex: "#db2777" },
  { name: "Sky", hex: "#0ea5e9" },
  { name: "Maroon", hex: "#7f1d1d" },
  { name: "Black", hex: "#111827" },
];

const DEFAULT_A = "#1e3a8a"; // royal navy
const DEFAULT_B = "#b45309"; // deep gold

const hexToRgb = (hex) => {
  const h = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [30, 58, 138];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/** WCAG relative luminance (0 dark … 1 light). */
export const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** White or near-black, whichever reads better on this colour (score and names are never lost). */
export const readableOn = (hex) => (luminance(hex) > 0.42 ? "#0b1020" : "#ffffff");

/** Mix a colour towards black (amount < 0) or white (amount > 0). */
export const shade = (hex, amount) => {
  const [r, g, b] = hexToRgb(hex);
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  const m = (c) => Math.round(c + (t - c) * p).toString(16).padStart(2, "0");
  return `#${m(r)}${m(g)}${m(b)}`;
};

const same = (a, b) => String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();

/** 'team1' | 'team2' | null for a team name on this match. */
export const teamKey = (match, teamName) => {
  if (!match || !teamName) return null;
  if (same(teamName, match.team1Name)) return "team1";
  if (same(teamName, match.team2Name)) return "team2";
  return null;
};

/** Colours for the batting and bowling team, with theme defaults for teams that have none. */
export const resolveTeamColors = (match) => {
  const k1 = match?.team1Color || "";
  const k2 = match?.team2Color || "";
  const batKey = teamKey(match, match?.battingTeam);
  const bowlKey = teamKey(match, match?.bowlingTeam);
  const pick = (key, fallbackSlot) => {
    if (key === "team1") return k1 || DEFAULT_A;
    if (key === "team2") return k2 || DEFAULT_B;
    return fallbackSlot === "bat" ? (k1 || DEFAULT_A) : (k2 || DEFAULT_B);
  };
  const batting = pick(batKey, "bat");
  const bowling = pick(bowlKey, "bowl");
  return { batting, bowling, battingText: readableOn(batting), bowlingText: readableOn(bowling) };
};

/** Resolved colours, or null when neither team has chosen one (themes then keep their own look). */
export const explicitTeamColors = (match) => (match?.team1Color || match?.team2Color ? resolveTeamColors(match) : null);
