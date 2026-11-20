import React from "react";
import { Flag } from "lucide-react";

/**
 * Pops up when the scoring shows the match is over (chase won, all out, or overs finished).
 * One tap ends the match; for a tournament match its result then goes into the points table.
 */

/** Result of a match that is over, or null while it is still going. Mirrors the server's result wording. */
export const getMatchOverResult = (match) => {
  if (!match || match.isSuperOver) return null;
  const status = String(match.matchStatus || "").toLowerCase();
  if (["completed", "abandoned", "match ended"].includes(status)) return null;
  const target = Number(match.targetScore) || 0;
  if (!match.isSecondInnings || target <= 0) return null;
  const bpo = match.ballsPerOver || 6;
  const totalBalls = match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 20) * bpo;
  const legal = match.legalBallCount ?? match.totalBalls ?? 0;
  const score = Number(match.score) || 0;
  const wickets = Number(match.wickets) || 0;
  if (score >= target) return { text: `${match.battingTeam} won by ${10 - wickets} wickets`, key: `${score}-${wickets}-${legal}` };
  if (wickets >= 10 || legal >= totalBalls) {
    const text = score === target - 1 ? "Match tied" : `${match.bowlingTeam} won by ${target - 1 - score} runs`;
    return { text, key: `${score}-${wickets}-${legal}` };
  }
  return null;
};

export default function EndMatchPrompt({ result, inTournament, busy, onEnd, onLater }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Match over"
      style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(3,8,24,0.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div style={{ width: "100%", maxWidth: 420, background: "linear-gradient(180deg, #0f1f66, #08123d)", border: "2px solid #facc15", borderRadius: 16, padding: "26px 24px", textAlign: "center", color: "#fff", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.2em", color: "#facc15" }}>
          <Flag size="1em" style={{ verticalAlign: "-0.125em" }} aria-hidden="true" /> MATCH OVER
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, margin: "12px 0 8px", lineHeight: 1.2 }}>{String(result.text).toUpperCase()}</div>
        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 20 }}>
          {inTournament
            ? "End the match to save the result. If it is a group fixture, the points table updates automatically."
            : "End the match to save the result and show the final summary."}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onEnd}
          style={{ width: "100%", padding: "14px 16px", borderRadius: 10, border: "none", background: "#facc15", color: "#0a1230", fontSize: 16, fontWeight: 900, letterSpacing: "0.05em", cursor: busy ? "wait" : "pointer" }}
        >
          {busy ? "ENDING…" : "END MATCH"}
        </button>
        <button
          type="button"
          onClick={onLater}
          style={{ marginTop: 10, background: "transparent", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 13, cursor: "pointer" }}
        >
          Not yet (keep scoring)
        </button>
      </div>
    </div>
  );
}
