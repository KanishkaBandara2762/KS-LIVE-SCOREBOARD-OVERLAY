import React from "react";
import "./proBroadcast.css";
import { upper, useFitScale, Logo, Stage, roleLabel, squadInfo, tossInfo, findPlayerPhoto, useRotate, pointsTableMessage } from "./common";

/* ================================================================
   PRO_BROADCAST theme pack
   - ProBroadcastBar     : navy/blue lower scorebar (1st innings, chase,
                           and the "NEED x MORE FROM y BALLS" strip)
   - Full screens on a green striped backdrop (1920×1080, scaled to fit)
   ================================================================ */

/** Full-screen stage on the green striped backdrop. */
export function GreenStage({ children, className = "", hiding = false }) {
  return (
    <Stage canvasClass={`pb-canvas ${className}`} hiding={hiding}
      background={<><div className="pb-green-bg" /><div className="pb-green-stripes" /></>}>
      {children}
    </Stage>
  );
}

/* ────────────────────────────────────────────────────────────────
   1. LOWER SCOREBAR
   ──────────────────────────────────────────────────────────────── */
export function ProBroadcastBar({ match, getOvers, getAbsoluteUrl, showEvent, eventType, eventWicketName, howOutText }) {
  const scale = useFitScale(1920);
  const bpo = match.ballsPerOver || 6;
  const legal = match.legalBallCount ?? match.totalBalls ?? 0;
  const maxOvers = match.maxOvers || 20;
  const totalBalls = match.targetBalls > 0 ? match.targetBalls : maxOvers * bpo;
  const ballsLeft = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, totalBalls - legal);
  const chasing = !!match.isSecondInnings && match.targetScore > 0;
  const runsNeeded = chasing ? Math.max(0, match.targetScore - match.score) : 0;
  const showNeedStrip = chasing && !!match.showNeedRunStrip;

  const striker = match.player1?.onStrike ? match.player1 : match.player2?.onStrike ? match.player2 : match.player1;
  const nonStriker = striker === match.player1 ? match.player2 : match.player1;
  const bowler = match.bowler || {};
  const bowlerOvers = getOvers(Math.round((bowler.overs || 0) * bpo));
  const recent = (match.recentBalls || []).slice(-8);
  const oversLabel = `(${match.targetBalls > 0 && chasing ? getOvers(match.targetBalls).replace(/\.0$/, "") : maxOvers} ov)`;
  const tab = chasing ? `TARGET : ${match.targetScore}` : (<>1<sup>st</sup> Inning</>);

  const event = showEvent && ["FOUR", "SIX", "WICKET"].includes(eventType) ? eventType : null;

  return (
    <div className="pb-bar-scaler" style={{ height: 150 * scale }}>
      <div className="pb-bar" style={{ transform: `scale(${scale})` }}>
        {event && (
          <div className={`pb-event pb-event-${event.toLowerCase()}`}>
            <span className="pb-event-title">{event}</span>
            {event === "WICKET" && eventWicketName && <span className="pb-event-sub">{eventWicketName} {howOutText}</span>}
          </div>
        )}

        {showNeedStrip ? (
          /* ── Chase strip: logo | score box | NEED x MORE FROM y BALLS | logo ── */
          <>
            <div className="pb-strip" />
            <div className="pb-side pb-side-left pb-side-logo" style={{ width: 230 }}>
              <Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="pb-side-img" />
            </div>
            <div className="pb-scorebox" style={{ left: 230, width: 420 }}>
              <div className="pb-tab">{tab}</div>
              <div className="pb-score-row">
                <span className="pb-score-team">{upper(match.battingTeam, "BATTING")}</span>
                <span className="pb-score">{match.score} - {match.wickets}</span>
                <span className="pb-overs">{getOvers(legal)}<small>{oversLabel}</small></span>
              </div>
              <div className="pb-score-sub">{upper(match.tournamentName || match.matchTitle, "LIVE MATCH")}</div>
            </div>
            <div className="pb-need" style={{ left: 650, width: 1040 }}>
              {runsNeeded > 0 ? (
                <>
                  <span className="pb-need-team">{upper(match.battingTeam)}<br />NEED</span>
                  <span className="pb-need-num">{runsNeeded}</span>
                  <span className="pb-need-word">MORE<br />FROM</span>
                  <span className="pb-need-num">{ballsLeft}</span>
                  <span className="pb-need-word">BALLS</span>
                </>
              ) : (
                <span className="pb-need-team pb-need-won">{upper(match.battingTeam)} WON</span>
              )}
            </div>
            <div className="pb-side pb-side-right pb-side-logo" style={{ width: 230 }}>
              <Logo src={getAbsoluteUrl(match.leagueLogo)} name={match.bowlingTeam} className="pb-side-img" />
            </div>
          </>
        ) : (
          /* ── Standard bar: team | batters | score box | bowler | team ── */
          <>
            <div className="pb-strip" />
            <div className="pb-side pb-side-left" style={{ width: 330 }}>
              <span className="pb-side-name">{upper(match.battingTeam, "BATTING")}</span>
            </div>
            <div className="pb-batters">
              {[striker, nonStriker].map((p, i) => (
                <div key={i} className="pb-player-row">
                  <span className="pb-arrow">{i === 0 && p?.name ? "➤" : ""}</span>
                  <span className="pb-pname">{upper(p?.name, i === 0 ? "BATTER" : "")}</span>
                  <span className="pb-pruns">{p?.name ? (p.runs ?? 0) : ""}</span>
                  <span className="pb-pballs">{p?.name ? (p.balls ?? 0) : ""}</span>
                </div>
              ))}
            </div>
            <div className="pb-scorebox" style={{ left: 700, width: 520 }}>
              <div className="pb-tab">{tab}</div>
              <div className="pb-score-row">
                <span className="pb-score-team">{upper(match.battingTeam, "BATTING")}</span>
                <span className="pb-score">{match.score} - {match.wickets}</span>
                <span className="pb-overs">{getOvers(legal)}<small>{oversLabel}</small></span>
              </div>
              <div className="pb-score-sub">
                {chasing
                  ? (runsNeeded > 0 ? `NEED ${runsNeeded} FROM ${ballsLeft} BALLS` : `${upper(match.battingTeam)} WON`)
                  : `Bowling : ${upper(match.bowlingTeam, "-")}`}
              </div>
            </div>
            <div className="pb-bowler">
              <div className="pb-player-row">
                <span className="pb-pname">{upper(bowler.name, "BOWLER")}</span>
                <span className="pb-pruns">{bowler.wickets ?? 0}-{bowler.runs ?? 0}</span>
                <span className="pb-pballs">{bowlerOvers}</span>
              </div>
              <div className="pb-balls">
                {recent.map((b, i) => {
                  const v = String(b ?? "");
                  const cls = v === "W" ? "is-w" : v === "4" ? "is-4" : v === "6" ? "is-6" : /WD|NB|LB|B/i.test(v) ? "is-x" : "";
                  return <span key={i} className={`pb-ball ${cls}`}>{v}</span>;
                })}
              </div>
            </div>
            <div className="pb-side pb-side-right pb-side-blue" style={{ width: 330 }}>
              <span className="pb-side-name">{upper(match.bowlingTeam, "BOWLING")}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   2. VERSUS / TOSS SCREEN
   ──────────────────────────────────────────────────────────────── */
export function ProVersusScreen({ match, getAbsoluteUrl, hiding = false }) {
  const teamA = match.battingTeam || match.team1Name || "TEAM A";
  const teamB = match.bowlingTeam || match.team2Name || "TEAM B";
  const toss = tossInfo(match);
  const tossLine = toss.known
    ? toss.line
    : [match.venueName, match.matchDate].filter(Boolean).join(" • ").toUpperCase();
  return (
    <GreenStage hiding={hiding}>
      <div className="pb-vs-title">{upper(match.tournamentName || match.matchTitle, "LIVE CRICKET")}</div>
      <div className="pb-vs-logo pb-vs-logo-a"><Logo src={getAbsoluteUrl(match.battingLogo)} name={teamA} className="pb-vs-img" /></div>
      <div className="pb-vs-logo pb-vs-logo-b"><Logo src={getAbsoluteUrl(match.leagueLogo)} name={teamB} className="pb-vs-img" /></div>
      <div className="pb-vs-match">{match.matchNumber ? `MATCH ${match.matchNumber}` : upper(match.matchType, "MATCH")}</div>
      <div className="pb-vs-bar">
        <div className="pb-vs-team pb-vs-team-a">{upper(teamA)}</div>
        <div className="pb-vs-badge"><span>V</span><span>S</span></div>
        <div className="pb-vs-team pb-vs-team-b">{upper(teamB)}</div>
      </div>
      {tossLine && <div className="pb-vs-toss">{tossLine}</div>}
    </GreenStage>
  );
}

/* ────────────────────────────────────────────────────────────────
   3. SQUAD SCREEN
   ──────────────────────────────────────────────────────────────── */
export function ProSquadScreen({ match, getAbsoluteUrl }) {
  const { teamName, teamLogo, players } = squadInfo(match, getAbsoluteUrl);
  const perRow = players.length > 12 ? 8 : 6;
  const rows = [];
  for (let i = 0; i < players.length; i += perRow) rows.push(players.slice(i, i + perRow));
  const sub = [match.tournamentName, match.matchNumber ? `(MATCH ${match.matchNumber})` : ""].filter(Boolean).join(" ");

  return (
    <GreenStage className={perRow === 8 ? "pb-squad-dense" : ""}>
      <div className="pb-squad-head">
        <Logo src={teamLogo} name={teamName} className="pb-squad-logo" />
        <div>
          <div className="pb-squad-team">{upper(teamName, "TEAM")}</div>
          <div className="pb-squad-sub">{upper(sub, "PLAYING SQUAD")}</div>
        </div>
      </div>
      {players.length === 0 ? (
        <div className="pb-empty">No squad added for this team yet.</div>
      ) : (
        <div className="pb-squad-grid">
          {rows.map((row, ri) => (
            <div key={ri} className="pb-squad-row">
              {row.map((p, i) => (
                <div key={i} className="pb-squad-card" style={{ animationDelay: `${(ri * perRow + i) * 60}ms` }}>
                  {roleLabel(p.role) === "WICKET KEEPER" && <span className="pb-squad-tag">WK</span>}
                  <Logo src={p.photo ? getAbsoluteUrl(p.photo) : teamLogo} name={p.name} className="pb-squad-photo" />
                  <div className="pb-squad-name">{upper(p.name)}</div>
                  <div className="pb-squad-role">{roleLabel(p.role)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </GreenStage>
  );
}

/* ────────────────────────────────────────────────────────────────
   4. POINTS TABLE SCREEN  (rotates through groups every 8 s)
   ──────────────────────────────────────────────────────────────── */
export function ProPointsScreen({ match, pointsTable, hasTournament, getAbsoluteUrl }) {
  const groups = pointsTable?.groups || [];
  const g = groups[useRotate(groups.length)];
  const groupLetter = g ? String(g.name || "").replace(/^group\s*/i, "") : "";
  const message = pointsTableMessage(pointsTable, hasTournament, g);

  const rows = g?.rows || [];
  const dense = rows.length > 7;
  return (
    <GreenStage className={dense ? "pb-pt-dense" : ""}>
      <div className="pb-pt-title">
        POINTS TABLE{groups.length > 1 || groupLetter ? <span> - GROUP ({upper(groupLetter || g?.name)})</span> : null}
      </div>
      {message ? <div className="pb-empty pb-pt-empty">{message}</div> : (
        <div className="pb-pt-table" key={g.groupId}>
          <div className="pb-pt-row pb-pt-head">
            <span className="pb-pt-pos">POS</span><span className="pb-pt-team">TEAMS</span>
            <span>M</span><span>W</span><span>NR/T</span><span>L</span>
            <span className="pb-pt-pts">POINT</span><span className="pb-pt-nrr">NRR</span>
          </div>
          {rows.slice(0, 10).map((r, i) => (
            <div key={r.teamId} className={`pb-pt-row ${r.eliminated ? "is-out" : ""}`} style={{ animationDelay: `${i * 70}ms` }}>
              <span className="pb-pt-pos">{r.position}</span>
              <span className="pb-pt-team">
                {upper(r.name)}
                {r.qualified && <em className="pb-pt-q">Q</em>}
              </span>
              <span>{r.played}</span><span>{r.won}</span>
              <span>{(r.tied || 0) + (r.noResult || 0)}</span><span>{r.lost}</span>
              <span className="pb-pt-pts">{r.points}</span>
              <span className="pb-pt-nrr">{r.nrrDisplay}</span>
            </div>
          ))}
        </div>
      )}
      <div className="pb-brand-card">
        <img src="/ks_logo.png" alt="" className="pb-brand-logo" />
        <div className="pb-brand-name">{upper(match.tournamentName, "TOURNAMENT")}</div>
      </div>
    </GreenStage>
  );
}

/* ────────────────────────────────────────────────────────────────
   5. LEADERS SCREEN (most runs / most wickets)
   ──────────────────────────────────────────────────────────────── */
export function ProLeadersScreen({ match, rows = [], kind = "runs", getAbsoluteUrl }) {
  const isRuns = kind === "runs";
  const title = isRuns ? "HIGHEST RUNS" : "MOST WICKETS";
  const top = rows.slice(0, 5);
  const leader = top[0];
  const valueOf = (r) => (isRuns ? r.runs : r.wickets);

  // Find a photo for the leader in either squad (matched by name).
  const leaderPhoto = leader ? findPlayerPhoto(match, leader.name) : null;

  return (
    <GreenStage>
      <div className="pb-ld-title">{title}</div>
      <div className="pb-ld-sub">{upper(match.tournamentName, "TOURNAMENT")}</div>
      {top.length === 0 ? (
        <div className="pb-empty pb-ld-empty">No completed-match statistics yet.</div>
      ) : (
        <>
          <div className="pb-ld-list">
            {top.map((r, i) => (
              <div key={r.name + r.team + i} className={`pb-ld-row ${i === 0 ? "is-top" : ""}`} style={{ animationDelay: `${i * 90}ms` }}>
                <span className="pb-ld-rank">{r.rank}{r.tied ? "=" : ""}</span>
                <span className="pb-ld-val">{valueOf(r)}</span>
                <span className="pb-ld-name">
                  <b>{upper(r.name)}</b>
                  <small>{upper(r.team)}</small>
                </span>
              </div>
            ))}
          </div>
          <div className="pb-ld-hero">
            <Logo src={leaderPhoto ? getAbsoluteUrl(leaderPhoto) : ""} name={leader.name} className="pb-ld-photo" />
            <div className="pb-ld-hero-name">{upper(leader.name)}</div>
            <div className="pb-ld-hero-val">{valueOf(leader)}{!isRuns && <small> WKTS</small>}</div>
          </div>
        </>
      )}
    </GreenStage>
  );
}
