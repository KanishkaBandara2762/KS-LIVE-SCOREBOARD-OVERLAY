import React from "react";
import "./proBroadcastScreens.css";
import { GreenStage } from "./proBroadcast";
import { upper, fit, Logo, chaseInfo } from "./common";

/* ================================================================
   PRO_BROADCAST — remaining full screens (match won, summary, chase,
   player of the match, partnership) and lower thirds.
   Same green board language: dark-green plates, bright-green number
   boxes, white/grey rows and the blue toss-strip bar.
   ================================================================ */

/* ── Match won ─────────────────────────────────────────────────── */
function Winner({ match, winnerInfo, getAbsoluteUrl }) {
  if (!winnerInfo) return null;
  return (
    <GreenStage>
      <div className="pb-vs-title">{upper(match.tournamentName || match.matchTitle, "MATCH RESULT")}</div>
      <div className="pb-win-logo"><Logo src={getAbsoluteUrl(winnerInfo.logo)} name={winnerInfo.team} className="pb-vs-img" /></div>
      <div className="pb-vs-match pb-win-tab">WINNERS</div>
      <div className="pb-win-bar" style={fit(winnerInfo.team, 72, 18)}>{upper(winnerInfo.team)}</div>
      <div className="pb-vs-toss pb-win-text">{upper(winnerInfo.text)}</div>
    </GreenStage>
  );
}

/* ── Summary: innings rows + three panels ──────────────────────── */
function Summary({ match, getAbsoluteUrl, getOvers, isMatchFinished, finalWinnerTeam, finalWinnerText }) {
  const legal = match.legalBallCount ?? match.totalBalls ?? 0;
  const hasFirst = match.isSecondInnings && match.firstInningsScore != null;
  const fow = (match.fallOfWickets || []).slice(-6);
  const inn = (team, logo, score, overs, i) => (
    <div key={i} className="pb-sm-inn" style={{ animationDelay: `${i * 90}ms` }}>
      <Logo src={getAbsoluteUrl(logo)} name={team} className="pb-sm-logo" />
      <span className="pb-sm-team">{upper(team)}</span>
      <span className="pb-sm-score">{score}</span>
      <span className="pb-sm-ov">{overs} OV</span>
    </div>
  );
  return (
    <GreenStage>
      <div className="pb-pt-title">MATCH SUMMARY<span> - {upper(match.tournamentName, "LIVE")}</span></div>
      <div className="pb-sm-inns">
        {hasFirst && inn(match.bowlingTeam, match.leagueLogo, `${match.firstInningsScore}-${match.firstInningsWickets ?? 0}`, getOvers(match.firstInningsOvers || 0), 0)}
        {inn(match.battingTeam, match.battingLogo, `${match.score}-${match.wickets}`, getOvers(legal), 1)}
      </div>
      {isMatchFinished && finalWinnerText && <div className="pb-vs-toss pb-sm-result">{upper(`${finalWinnerTeam || ""} ${finalWinnerText}`.trim())}</div>}
      <div className="pb-sm-cols">
        <div className="pb-sm-col">
          <div className="pb-sm-h">BATTING</div>
          {[match.player1, match.player2].filter((p) => p?.name).map((p, i) => (
            <div key={i} className="pb-sm-row"><span>{upper(p.name)}{p.onStrike ? " *" : ""}</span><b>{p.runs ?? 0}</b><em>{p.balls ?? 0}</em></div>
          ))}
        </div>
        <div className="pb-sm-col">
          <div className="pb-sm-h">BOWLING</div>
          <div className="pb-sm-row"><span>{upper(match.bowler?.name, "—")}</span><b>{match.bowler?.wickets ?? 0}-{match.bowler?.runs ?? 0}</b><em>{match.bowler?.overs ?? 0}</em></div>
          {match.isSecondInnings && match.targetScore > 0 && <div className="pb-sm-row"><span>TARGET</span><b>{match.targetScore}</b><em /></div>}
        </div>
        <div className="pb-sm-col">
          <div className="pb-sm-h">FALL OF WICKETS</div>
          {fow.length === 0
            ? <div className="pb-sm-row"><span>NO WICKETS</span><b /><em /></div>
            : fow.map((w, i) => <div key={i} className="pb-sm-row"><span>{upper(w.playerName || w.name, "BATTER")}</span><b>{w.score ?? 0}-{w.wicket ?? i + 1}</b><em>{w.overAtFall || "0.0"}</em></div>)}
        </div>
      </div>
    </GreenStage>
  );
}

/* ── Chase / need run (leaders-style rows + big number card) ───── */
function Chase({ match, getAbsoluteUrl, getOvers }) {
  const c = chaseInfo(match);
  const rows = c.chasing
    ? [["RUNS NEEDED", c.runsNeeded], ["BALLS LEFT", c.ballsLeft], ["REQUIRED RATE", c.rrr], ["CURRENT RATE", c.crr]]
    : [["SCORE", `${match.score}-${match.wickets}`], ["OVERS", getOvers(c.legal)], ["RUN RATE", c.crr], ["PROJECTED", Math.round(Number(c.crr) * (match.maxOvers || 20))]];
  const heroLabel = c.chasing ? (c.runsNeeded > 0 ? "NEED" : "RESULT") : "SCORE";
  const heroValue = c.chasing ? (c.runsNeeded > 0 ? c.runsNeeded : "WON") : `${match.score}-${match.wickets}`;
  return (
    <GreenStage>
      <div className="pb-ld-title">{c.chasing ? `TARGET : ${c.target}` : "MATCH SITUATION"}</div>
      <div className="pb-ld-sub">{upper(match.battingTeam)}  •  {upper(match.tournamentName, "LIVE")}</div>
      <div className="pb-ld-list">
        {rows.map(([k, v], i) => (
          <div key={k} className={`pb-ld-row ${i === 0 ? "is-top" : ""}`} style={{ animationDelay: `${i * 90}ms` }}>
            <span className="pb-ld-rank">{i + 1}</span>
            <span className="pb-ld-val">{v}</span>
            <span className="pb-ld-name"><b>{k}</b><small>{upper(match.battingTeam)}</small></span>
          </div>
        ))}
      </div>
      <div className="pb-ld-hero">
        <Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="pb-ch-logo" />
        <div className="pb-ld-hero-name">{heroLabel}</div>
        <div className="pb-ld-hero-val">{heroValue}</div>
      </div>
    </GreenStage>
  );
}

/* ── Player of the match ───────────────────────────────────────── */
function Potm({ match, getAbsoluteUrl }) {
  return (
    <GreenStage>
      <div className="pb-ld-title">PLAYER OF THE MATCH</div>
      <div className="pb-ld-sub">{upper(match.tournamentName, "")}</div>
      <div className="pb-potm-plate" style={fit(match.potmName, 96, 14)}>{upper(match.potmName)}</div>
      {match.potmTeam && <div className="pb-potm-team">{upper(match.potmTeam)}</div>}
      {match.potmFigures && <div className="pb-potm-figs">{upper(match.potmFigures)}</div>}
      <div className="pb-ld-hero">
        <Logo src={match.potmPhoto ? getAbsoluteUrl(match.potmPhoto) : ""} name={match.potmName} className="pb-ld-photo" />
        <div className="pb-ld-hero-name">{upper(match.potmName)}</div>
      </div>
    </GreenStage>
  );
}

/* ── Partnership ───────────────────────────────────────────────── */
function Partnership({ match }) {
  const p = match.partnership || {};
  const bats = [match.player1, match.player2].filter((x) => x?.name);
  const total = bats.reduce((a, b) => a + (b.runs || 0), 0) || 1;
  return (
    <GreenStage>
      <div className="pb-vs-title">PARTNERSHIP</div>
      <div className="pb-ps-box"><b>{p.runs ?? 0}</b><span>RUNS • {p.balls ?? 0} BALLS</span></div>
      <div className="pb-ps-bats">
        {bats.map((b, i) => (
          <div key={i} className="pb-ps-bat">
            <span className="pb-ps-name">{upper(b.name)}</span>
            <span className="pb-ps-runs">{b.runs ?? 0}<small> ({b.balls ?? 0})</small></span>
          </div>
        ))}
      </div>
      {bats.length === 2 && <div className="pb-ps-split"><div style={{ width: `${Math.round(((bats[0].runs || 0) / total) * 100)}%` }} /></div>}
    </GreenStage>
  );
}

/* ── Lower thirds (navy/blue, like the scorebar) ───────────────── */
function LastOut({ match }) {
  return (
    <div className="pb-lt">
      <span className="pb-lt-tag">OUT</span>
      <span className="pb-lt-main">{upper(match.lastWicketName)}</span>
      <span className="pb-lt-side">{match.lastWicketRuns ?? 0} ({match.lastWicketBalls ?? 0})  •  {upper(match.lastWicketDismissal, "OUT")}</span>
    </div>
  );
}
function CustomText({ match }) {
  return (
    <div className="pb-lt pb-lt-custom">
      <span className="pb-lt-main">{match.customText}</span>
    </div>
  );
}

export default { Winner, Summary, MatchSituation: Chase, NeedRun: Chase, Potm, Partnership, LastOut, CustomText };
