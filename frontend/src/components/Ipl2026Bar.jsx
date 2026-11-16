import React from "react";
import "./Ipl2026Bar.css";
import { useFitScale } from "./themePacks/common";

/* ================================================================
   Ipl2026Bar — IPL 2026 Stadium Capsule scorebar.
   Green team-code boxes, red pill panels for batters and bowler,
   green lattice centre with the score capsule on top and a
   toss / chase line underneath. Designed at 1920 × 110, scaled to width.
   ================================================================ */

const code = (name, fallback) => (name ? String(name).trim().substring(0, 3).toUpperCase() : fallback);

export default function Ipl2026Bar({ match, getOvers }) {
  const scale = useFitScale(1920);
  const bpo = match.ballsPerOver || 6;
  const legal = match.legalBallCount ?? match.totalBalls ?? 0;
  const maxOvers = match.maxOvers || 20;
  const totalBalls = match.targetBalls > 0 ? match.targetBalls : maxOvers * bpo;
  const ballsLeft = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, totalBalls - legal);
  const chasing = !!match.isSecondInnings && match.targetScore > 0;
  const runsNeeded = chasing ? Math.max(0, match.targetScore - match.score) : 0;

  // Batters stay in a fixed order; the arrow marks whoever is on strike.
  const batters = [match.player1, match.player2];
  const bowler = match.bowler || {};
  const bowlerOvers = getOvers(Math.round((bowler.overs || 0) * bpo));
  const thisOver = (match.recentBalls || []).slice(-6);

  const toss = match.toss || {};
  let line;
  if (chasing) {
    line = runsNeeded > 0
      ? `${code(match.battingTeam, "BAT")} NEED ${runsNeeded} RUNS IN ${ballsLeft} BALLS`
      : `${String(match.battingTeam || "").toUpperCase()} WON`;
  } else if (toss.winner) {
    line = `${String(toss.winner).toUpperCase()} WON THE TOSS AND ELECTED TO ${toss.decision === "bowl" ? "BALL" : "BAT"}`;
  } else {
    line = String(match.tournamentName || match.matchTitle || "LIVE MATCH").toUpperCase();
  }

  return (
    <div className="i26b-scaler" style={{ height: 110 * scale }}>
      <div className="i26b" style={{ transform: `scale(${scale})` }}>
        {/* Left team code */}
        <div className="i26b-team i26b-team-l">{code(match.battingTeam, "BAT")}</div>

        {/* Batters */}
        <div className="i26b-red i26b-red-l">
          <div className="i26b-pill">
            {batters.map((p, i) => (
              <div key={i} className="i26b-row">
                <span className="i26b-arrow">{p?.name && p?.onStrike ? "▶" : ""}</span>
                <span className="i26b-name">{String(p?.name || (i === 0 ? "BATTER" : "")).toUpperCase()}</span>
                {p?.name ? <span className="i26b-fig">{p.runs ?? 0} <small>({p.balls ?? 0})</small></span> : <span />}
              </div>
            ))}
          </div>
        </div>

        {/* Centre: lattice + capsule + info line */}
        <div className="i26b-centre">
          <div className="i26b-capsule">
            <span className="i26b-cap-team">{code(match.battingTeam, "BAT")}</span>
            <span className="i26b-cap-score">{match.score}-{match.wickets}</span>
            <span className="i26b-cap-overs">{getOvers(legal)} <small>/ {maxOvers}</small></span>
          </div>
          <div className="i26b-line">{line}</div>
        </div>

        {/* Bowler */}
        <div className="i26b-red i26b-red-r">
          <div className="i26b-pill">
            <div className="i26b-row i26b-row-bowler">
              <span className="i26b-name">{String(bowler.name || "BOWLER").toUpperCase()}</span>
              <span className="i26b-fig">{bowler.wickets ?? 0}-{bowler.runs ?? 0} <small>({bowlerOvers})</small></span>
            </div>
            <div className="i26b-balls">
              {thisOver.map((b, i) => {
                const v = String(b ?? "");
                const tone = v.includes("W") && !/WD/i.test(v) ? "is-w" : v === "4" ? "is-4" : v === "6" ? "is-6" : "";
                return <span key={i} className={`i26b-ball ${tone}`}>{v === "•" ? "0" : v}</span>;
              })}
            </div>
          </div>
        </div>

        {/* Right team code */}
        <div className="i26b-team i26b-team-r">{code(match.bowlingTeam, "BWL")}</div>
      </div>
    </div>
  );
}
