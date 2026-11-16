import React from "react";
import "./foxStrike.css";
import { upper, fit, Logo, Stage, tossInfo, chaseInfo, squadInfo, roleLabel, findPlayerPhoto, useRotate, pointsTableMessage } from "./common";

/* ================================================================
   FOX_STRIKE theme pack — action look: charcoal (#1c1d22), blazing
   orange (#ff4500 → #ff9800) and red (#d50000). Slanted (skewed) slabs,
   speed lines and italic Teko type.
   ================================================================ */

const ActionBg = () => (<><div className="fx-bg" /><div className="fx-speed" /><div className="fx-corner" /></>);
const ActionStage = ({ hiding, className = "", children }) => (
  <Stage canvasClass={`fx-canvas ${className}`} hiding={hiding} background={<ActionBg />}>{children}</Stage>
);
/** Skewed slab; content is un-skewed so text stays upright. */
const Slab = ({ className = "", children, style }) => <div className={`fx-slab ${className}`} style={style}><div className="fx-unskew">{children}</div></div>;

/* ── Versus ────────────────────────────────────────────────────── */
function Versus({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  return (
    <ActionStage hiding={hiding}>
      <Slab className="fx-tag fx-top">{upper(match.tournamentName || match.matchTitle, "BIG BASH")}{match.matchNumber ? ` • MATCH ${match.matchNumber}` : ""}</Slab>
      <Slab className="fx-vs-slab fx-vs-a">
        <Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="fx-vs-logo" />
        <div className="fx-vs-name" style={fit(match.battingTeam, 80, 12)}>{upper(match.battingTeam, "TEAM A")}</div>
      </Slab>
      <Slab className="fx-vs-slab fx-vs-b">
        <Logo src={getAbsoluteUrl(match.leagueLogo)} name={match.bowlingTeam} className="fx-vs-logo" />
        <div className="fx-vs-name" style={fit(match.bowlingTeam, 80, 12)}>{upper(match.bowlingTeam, "TEAM B")}</div>
      </Slab>
      <div className="fx-vs-word">VS</div>
      <Slab className="fx-bar fx-vs-bar">{toss.known ? toss.line : [upper(match.venueName), upper(match.matchDate)].filter(Boolean).join(" • ") || "LIVE"}</Slab>
    </ActionStage>
  );
}

/* ── Toss ──────────────────────────────────────────────────────── */
function Toss({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  return (
    <ActionStage hiding={hiding}>
      <Slab className="fx-hero-slab">TOSS</Slab>
      {toss.known ? (
        <>
          <Logo src={getAbsoluteUrl(toss.winnerLogo)} name={toss.winner} className="fx-toss-logo" />
          <div className="fx-toss-info">
            <div className="fx-kick">WON THE TOSS</div>
            <div className="fx-big" style={fit(toss.winner, 130, 11)}>{upper(toss.winner)}</div>
            <Slab className="fx-bar fx-toss-bar">ELECTED TO {toss.decision} FIRST</Slab>
          </div>
        </>
      ) : <div className="fx-empty">Toss result not entered yet.</div>}
    </ActionStage>
  );
}

/* ── Match won ─────────────────────────────────────────────────── */
function Winner({ match, winnerInfo, getAbsoluteUrl }) {
  if (!winnerInfo) return null;
  return (
    <ActionStage className="fx-winner">
      <div className="fx-win-slash" />
      <div className="fx-kick fx-win-kick">{upper(match.tournamentName, "MATCH RESULT")}</div>
      <Logo src={getAbsoluteUrl(winnerInfo.logo)} name={winnerInfo.team} className="fx-win-logo" />
      <div className="fx-win-victory">VICTORY</div>
      <div className="fx-big fx-win-team" style={fit(winnerInfo.team, 170, 11)}>{upper(winnerInfo.team)}</div>
      <Slab className="fx-bar fx-win-bar">{upper(winnerInfo.text)}</Slab>
    </ActionStage>
  );
}

/* ── Summary ───────────────────────────────────────────────────── */
function Summary({ match, getAbsoluteUrl, getOvers, isMatchFinished, finalWinnerTeam, finalWinnerText }) {
  const legal = match.legalBallCount ?? match.totalBalls ?? 0;
  const hasFirst = match.isSecondInnings && match.firstInningsScore != null;
  const fow = (match.fallOfWickets || []).slice(-6);
  const inn = (team, logo, score, overs, live) => (
    <Slab className={`fx-inn ${live ? "is-live" : ""}`}>
      <Logo src={getAbsoluteUrl(logo)} name={team} className="fx-inn-logo" />
      <span className="fx-inn-team">{upper(team)}</span>
      <b>{score}</b><em>{overs} OV</em>
    </Slab>
  );
  return (
    <ActionStage>
      <Slab className="fx-tag fx-top">{isMatchFinished ? "MATCH SUMMARY" : "SCORE SUMMARY"} • {upper(match.tournamentName, "LIVE")}</Slab>
      <div className="fx-inns">
        {hasFirst && inn(match.bowlingTeam, match.leagueLogo, `${match.firstInningsScore}/${match.firstInningsWickets ?? 0}`, getOvers(match.firstInningsOvers || 0), false)}
        {inn(match.battingTeam, match.battingLogo, `${match.score}/${match.wickets}`, getOvers(legal), true)}
      </div>
      {isMatchFinished && finalWinnerText && <Slab className="fx-bar fx-sum-result">{upper(`${finalWinnerTeam || ""} ${finalWinnerText}`.trim())}</Slab>}
      <div className="fx-panels">
        <div className="fx-panel">
          <Slab className="fx-panel-h">BATTING</Slab>
          {[match.player1, match.player2].filter((p) => p?.name).map((p, i) => <div key={i} className="fx-row"><span>{upper(p.name)}{p.onStrike ? " »" : ""}</span><b>{p.runs ?? 0}</b><em>{p.balls ?? 0}</em></div>)}
        </div>
        <div className="fx-panel">
          <Slab className="fx-panel-h">BOWLING</Slab>
          <div className="fx-row"><span>{upper(match.bowler?.name, "—")}</span><b>{match.bowler?.wickets ?? 0}-{match.bowler?.runs ?? 0}</b><em>{match.bowler?.overs ?? 0}</em></div>
        </div>
        <div className="fx-panel">
          <Slab className="fx-panel-h fx-panel-h-red">WICKETS</Slab>
          {fow.length === 0 ? <div className="fx-muted">No wickets fallen</div> : fow.map((w, i) => <div key={i} className="fx-row"><span>{upper(w.playerName || w.name, "BATTER")}</span><b>{w.score ?? 0}-{w.wicket ?? i + 1}</b><em>{w.overAtFall || "0.0"}</em></div>)}
        </div>
      </div>
    </ActionStage>
  );
}

/* ── Chase: segmented over meter ───────────────────────────────── */
function Chase({ match, getAbsoluteUrl, getOvers }) {
  const c = chaseInfo(match);
  const oversTotal = Math.max(1, Math.ceil(c.totalBalls / c.bpo));
  const oversDone = c.legal / c.bpo;
  return (
    <ActionStage>
      <Slab className="fx-tag fx-top">{c.chasing ? `CHASING ${c.target}` : "MATCH SITUATION"} • {upper(match.battingTeam)}</Slab>
      <Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="fx-ch-logo" />
      <div className={`fx-ch-line ${c.chasing ? "" : "is-first"}`}>
        {c.chasing
          ? (c.runsNeeded > 0 ? <>NEED <b>{c.runsNeeded}</b> OFF <b>{c.ballsLeft}</b></> : <><b>{upper(match.battingTeam)}</b> WIN</>)
          : <><b>{match.score}/{match.wickets}</b> AFTER <b>{getOvers(c.legal)}</b></>}
      </div>
      <div className="fx-meter">
        {Array.from({ length: oversTotal }).map((_, i) => <i key={i} className={i < Math.floor(oversDone) ? "is-done" : i < oversDone ? "is-now" : ""} />)}
      </div>
      <div className="fx-meter-cap">OVER {getOvers(c.legal)} OF {oversTotal}</div>
      <div className="fx-ch-stats">
        <Slab className="fx-stat"><span>RUN RATE</span><b>{c.crr}</b></Slab>
        {c.chasing ? <Slab className="fx-stat fx-stat-hot"><span>REQUIRED</span><b>{c.rrr}</b></Slab> : <Slab className="fx-stat fx-stat-hot"><span>PROJECTED</span><b>{Math.round(Number(c.crr) * (match.maxOvers || 20))}</b></Slab>}
        <Slab className="fx-stat"><span>WKTS LEFT</span><b>{Math.max(0, 10 - (match.wickets || 0))}</b></Slab>
      </div>
    </ActionStage>
  );
}

/* ── Player of the match ───────────────────────────────────────── */
function Potm({ match, getAbsoluteUrl }) {
  return (
    <ActionStage>
      <div className="fx-potm-frame"><Logo src={match.potmPhoto ? getAbsoluteUrl(match.potmPhoto) : ""} name={match.potmName} className="fx-potm-img" /></div>
      <div className="fx-potm-info">
        <Slab className="fx-tag fx-inline">PLAYER OF THE MATCH</Slab>
        <div className="fx-big" style={fit(match.potmName, 150, 10)}>{upper(match.potmName)}</div>
        {match.potmTeam && <div className="fx-kick">{upper(match.potmTeam)}</div>}
        {match.potmFigures && <Slab className="fx-bar fx-potm-figs">{upper(match.potmFigures)}</Slab>}
      </div>
    </ActionStage>
  );
}

/* ── Partnership: racing bars ──────────────────────────────────── */
function Partnership({ match }) {
  const p = match.partnership || {};
  const bats = [match.player1, match.player2].filter((x) => x?.name);
  const max = Math.max(1, ...bats.map((b) => b.runs || 0));
  return (
    <ActionStage>
      <Slab className="fx-hero-slab fx-ps-slab">PARTNERSHIP</Slab>
      <div className="fx-ps-total">{p.runs ?? 0}<small> RUNS • {p.balls ?? 0} BALLS</small></div>
      <div className="fx-ps-bars">
        {bats.map((b, i) => (
          <div key={i} className="fx-ps-row">
            <span className="fx-ps-name" style={fit(b.name, 70, 9)}>{upper(b.name)}</span>
            <span className="fx-ps-track"><Slab className={`fx-ps-bar ${i ? "is-red" : ""}`} style={{ width: `${Math.max(8, ((b.runs || 0) / max) * 100)}%` }}>{b.runs ?? 0} <small>({b.balls ?? 0})</small></Slab></span>
          </div>
        ))}
      </div>
    </ActionStage>
  );
}

/* ── Squad ─────────────────────────────────────────────────────── */
function Squad({ match, getAbsoluteUrl }) {
  const { teamName, teamLogo, players } = squadInfo(match, getAbsoluteUrl);
  return (
    <ActionStage>
      <div className="fx-sq-head">
        <Logo src={teamLogo} name={teamName} className="fx-sq-logo" />
        <div className="fx-big fx-sq-team" style={fit(teamName, 110, 16)}>{upper(teamName, "TEAM")}</div>
      </div>
      {players.length === 0 ? <div className="fx-empty">No squad added for this team yet.</div> : (
        <div className="fx-sq-grid">
          {players.map((p, i) => (
            <Slab key={i} className="fx-sq-card" style={{ animationDelay: `${i * 45}ms` }}>
              <b>{p.jerseyNumber ?? i + 1}</b><span>{upper(p.name)}</span><em>{roleLabel(p.role)}</em>
            </Slab>
          ))}
        </div>
      )}
    </ActionStage>
  );
}

/* ── Points table ──────────────────────────────────────────────── */
function PointsTable({ match, pointsTable, hasTournament, getAbsoluteUrl }) {
  const groups = pointsTable?.groups || [];
  const g = groups[useRotate(groups.length)];
  const message = pointsTableMessage(pointsTable, hasTournament, g);
  const rows = (g?.rows || []).slice(0, 10);
  return (
    <ActionStage className={rows.length > 7 ? "fx-pt-dense" : ""}>
      <Slab className="fx-hero-slab fx-pt-slab">LADDER</Slab>
      <div className="fx-kick fx-pt-sub">{upper(match.tournamentName, "POINTS TABLE")}{g && groups.length > 1 ? ` • ${upper(g.name)}` : ""}</div>
      {message ? <div className="fx-empty">{message}</div> : (
        <div className="fx-pt" key={g.groupId}>
          <div className="fx-pt-row fx-pt-head"><span>#</span><span className="fx-pt-team">TEAM</span><span>P</span><span>W</span><span>L</span><span>NR</span><span>NRR</span><span>PTS</span></div>
          {rows.map((r, i) => (
            <div key={r.teamId} className={`fx-pt-row ${r.inQualifyingPosition ? "is-q" : ""} ${r.eliminated ? "is-out" : ""}`} style={{ animationDelay: `${i * 55}ms` }}>
              <span className="fx-pt-pos">{r.position}</span>
              <span className="fx-pt-team"><Logo src={getAbsoluteUrl(r.logo || pointsTable.teams?.[r.teamId]?.logo || "")} name={r.name} className="fx-pt-logo" />{upper(r.name)}{r.qualified && <em>Q</em>}</span>
              <span>{r.played}</span><span>{r.won}</span><span>{r.lost}</span><span>{(r.tied || 0) + (r.noResult || 0)}</span>
              <span>{r.nrrDisplay}</span><span className="fx-pt-pts">{r.points}</span>
            </div>
          ))}
        </div>
      )}
    </ActionStage>
  );
}

/* ── Leaders: racing bars ──────────────────────────────────────── */
function Leaders({ match, rows = [], kind = "runs", getAbsoluteUrl }) {
  const isRuns = kind === "runs";
  const top = rows.slice(0, 5);
  const val = (r) => (isRuns ? r.runs : r.wickets) || 0;
  const max = Math.max(1, ...top.map(val));
  const leader = top[0];
  const photo = leader ? findPlayerPhoto(match, leader.name) : null;
  return (
    <ActionStage>
      <Slab className="fx-hero-slab fx-pt-slab">{isRuns ? "RUN MACHINES" : "WICKET TAKERS"}</Slab>
      <div className="fx-kick fx-pt-sub">{upper(match.tournamentName, "TOURNAMENT")}</div>
      {!leader ? <div className="fx-empty">No completed-match statistics yet.</div> : (
        <>
          <div className="fx-ld">
            {top.map((r, i) => (
              <div key={r.name + i} className="fx-ld-row" style={{ animationDelay: `${i * 80}ms` }}>
                <span className="fx-ld-rank">{r.rank}</span>
                <span className="fx-ld-name"><b style={fit(r.name, 58, 11)}>{upper(r.name)}</b><small>{upper(r.team)}</small></span>
                <span className="fx-ps-track"><Slab className={`fx-ps-bar ${i === 0 ? "" : "is-dim"}`} style={{ width: `${Math.max(12, (val(r) / max) * 100)}%` }}>{val(r)}</Slab></span>
              </div>
            ))}
          </div>
          <div className="fx-potm-frame fx-ld-frame"><Logo src={photo ? getAbsoluteUrl(photo) : ""} name={leader.name} className="fx-potm-img" /></div>
        </>
      )}
    </ActionStage>
  );
}

/* ── Lower thirds ──────────────────────────────────────────────── */
function LastOut({ match }) {
  return (
    <div className="fx-lt"><span className="fx-lt-tag">OUT!</span><span className="fx-lt-main">{upper(match.lastWicketName)}</span><span className="fx-lt-side">{match.lastWicketRuns ?? 0} ({match.lastWicketBalls ?? 0}) • {upper(match.lastWicketDismissal, "OUT")}</span></div>
  );
}
function CustomText({ match }) {
  return <div className="fx-lt fx-lt-custom"><span className="fx-lt-tag">»</span><span className="fx-lt-main">{match.customText}</span></div>;
}

export default {
  Versus, Toss, Winner, Summary, MatchSituation: Chase, NeedRun: Chase, Potm, Partnership,
  Squad, PointsTable, Leaders, LastOut, CustomText,
};
