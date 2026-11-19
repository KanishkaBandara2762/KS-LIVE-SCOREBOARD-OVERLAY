import React from "react";
import "./IplGoldBar.css";
import { useFitScale, Logo, tossInfo, chaseInfo } from "./themePacks/common";
import { resolveTeamColors, shade } from "../utils/teamColors";

/* ================================================================
   IplGoldBar — IPL GOLD (navy & gold) scorebar.
   Batting team panel on the left and bowling team panel on the right take
   each team's own colour (chosen from the preset palette); the centre is
   navy with gold trim. Text on each panel flips between white and dark so
   score and names stay readable on any team colour.
   Designed at 1920 × 112 and scaled to the overlay width.
   ================================================================ */
const up = (s, fb = "") => String(s || fb).toUpperCase();

export default function IplGoldBar({ match, getOvers, getAbsoluteUrl, showEvent, eventType, eventWicketName, howOutText }) {
  const scale = useFitScale(1920);
  const c = resolveTeamColors(match);
  const ch = chaseInfo(match);
  const toss = tossInfo(match);

  const batters = [match.player1, match.player2];
  const bowler = match.bowler || {};
  const bowlerOvers = getOvers(Math.round((bowler.overs || 0) * ch.bpo));
  const thisOver = (match.recentBalls || []).slice(-6);
  const showToss = ch.legal === 0 && toss.known && !match.isSecondInnings;

  const event = showEvent && ["FOUR", "SIX", "WICKET"].includes(eventType) ? eventType : null;
  const stage = match.matchTitle && !/^match\s*\d+$/i.test(match.matchTitle) ? up(match.matchTitle) : (match.isSecondInnings ? "2ND INNINGS" : "1ST INNINGS");

  const leftBg = `linear-gradient(95deg, ${shade(c.batting, -0.25)} 0%, ${c.batting} 45%, ${shade(c.batting, -0.35)} 100%)`;
  const rightBg = `linear-gradient(265deg, ${shade(c.bowling, -0.25)} 0%, ${c.bowling} 45%, ${shade(c.bowling, -0.35)} 100%)`;

  return (
    <div className="igb-scaler" style={{ height: 112 * scale }}>
      <div className="igb" style={{ transform: `scale(${scale})` }}>
        {event && (
          <div className={`igb-event igb-event-${event.toLowerCase()}`}>
            <span className="igb-event-title">{event}</span>
            {event === "WICKET" && eventWicketName && <span className="igb-event-sub">{eventWicketName} {howOutText}</span>}
          </div>
        )}

        {/* ── Batting team panel ── */}
        <div className="igb-side igb-left" style={{ background: leftBg, color: c.battingText }}>
          <Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="igb-logo" />
          <div className="igb-score-block">
            <div className="igb-score-row">
              <div className="igb-score">{match.score}<i>-</i>{match.wickets}</div>
              <div className="igb-overs">{getOvers(ch.legal)}<small>/{match.maxOvers || 20}</small></div>
            </div>
            <div className="igb-team">{up(match.battingTeam, "BATTING")}</div>
          </div>
          <div className="igb-players">
            {batters.map((p, i) => (
              <div key={i} className="igb-prow">
                <span className="igb-arrow" style={{ color: c.battingText }}>{p?.name && p?.onStrike ? "▶" : ""}</span>
                <span className="igb-pname">{up(p?.name, i === 0 ? "BATTER" : "")}</span>
                {p?.name ? <span className="igb-pfig">{p.runs ?? 0}<small>({p.balls ?? 0})</small></span> : <span />}
              </div>
            ))}
          </div>
        </div>

        {/* ── Centre ── */}
        <div className="igb-mid">
          <div className="igb-mid-label">BOWLING TEAM</div>
          <div className="igb-mid-team">{up(match.bowlingTeam, "BOWLING")}</div>
          <div className="igb-mid-line">
            {ch.chasing
              ? (ch.runsNeeded > 0 ? <>TARGET <b>{ch.target}</b></> : <b>TARGET REACHED</b>)
              : stage}
          </div>
        </div>

        {/* ── Bowling team panel ── */}
        <div className="igb-side igb-right" style={{ background: rightBg, color: c.bowlingText }}>
          {showToss ? (
            <div className="igb-toss">
              <div>{up(toss.winner)} WON THE TOSS</div>
              <span>ELECTED TO {toss.decision === "BOWL" ? "BOWL" : "BAT"}</span>
            </div>
          ) : (
            <div className="igb-bowl">
              <div className="igb-prow igb-brow">
                <span className="igb-pname">{up(bowler.name, "BOWLER")}</span>
                <span className="igb-pfig">{bowler.wickets ?? 0}-{bowler.runs ?? 0}<small>({bowlerOvers})</small></span>
              </div>
              <div className="igb-balls">
                {thisOver.map((b, i) => {
                  const v = String(b ?? "");
                  const tone = v.includes("W") && !/WD/i.test(v) ? "is-w" : v === "4" ? "is-4" : v === "6" ? "is-6" : "";
                  return <span key={i} className={`igb-ball ${tone}`}>{v === "•" ? "0" : v}</span>;
                })}
              </div>
            </div>
          )}
          <Logo src={getAbsoluteUrl(match.leagueLogo)} name={match.bowlingTeam} className="igb-logo" />
        </div>
      </div>
    </div>
  );
}
