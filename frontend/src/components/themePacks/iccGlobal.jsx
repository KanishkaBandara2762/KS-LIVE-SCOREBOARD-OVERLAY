import React from "react";
import "./iccGlobal.css";
import { upper, fit, Logo, Stage, tossInfo, chaseInfo, squadInfo, roleLabel, findPlayerPhoto, useRotate, pointsTableMessage } from "./common";

/* ================================================================
   ICC_GLOBAL theme pack — neon "world cup" look.
   Near-black navy, neon cyan #00f5ff, hot magenta #ff007a.
   Slanted glass panels, cyan→magenta gradient numbers, Rajdhani font.
   ================================================================ */

const NeonBg = () => (
  <>
    <div className="ic-bg" />
    <div className="ic-beams" />
    <div className="ic-floor" />
  </>
);

const NeonStage = ({ hiding, className = "", children }) => (
  <Stage canvasClass={`ic-canvas ${className}`} hiding={hiding} background={<NeonBg />}>{children}</Stage>
);

/* ── Versus ────────────────────────────────────────────────────── */
function Versus({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  const card = (name, logo, side) => (
    <div className={`ic-slant ic-vs-card ic-vs-${side}`}>
      <Logo src={getAbsoluteUrl(logo)} name={name} className="ic-vs-logo" />
      <div className="ic-vs-name" style={fit(name, 64, 14)}>{upper(name)}</div>
    </div>
  );
  return (
    <NeonStage hiding={hiding}>
      <div className="ic-eyebrow ic-top">{upper(match.tournamentName || match.matchTitle, "ICC T20")}{match.matchNumber ? `  ·  MATCH ${match.matchNumber}` : ""}</div>
      {card(match.battingTeam || "TEAM A", match.battingLogo, "a")}
      {card(match.bowlingTeam || "TEAM B", match.leagueLogo, "b")}
      <div className="ic-grad ic-vs-vs">VS</div>
      <div className="ic-slant ic-strip ic-vs-strip">{toss.known ? toss.line : [upper(match.venueName), upper(match.matchDate)].filter(Boolean).join("  ·  ") || "LIVE"}</div>
    </NeonStage>
  );
}

/* ── Toss ──────────────────────────────────────────────────────── */
function Toss({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  return (
    <NeonStage hiding={hiding}>
      {toss.known ? (
        <>
          <div className="ic-toss-orb"><Logo src={getAbsoluteUrl(toss.winnerLogo)} name={toss.winner} className="ic-toss-logo" /></div>
          <div className="ic-toss-text">
            <div className="ic-eyebrow">TOSS WON BY</div>
            <div className="ic-toss-name" style={fit(toss.winner, 110, 13)}>{upper(toss.winner)}</div>
            <div className="ic-grad ic-toss-dec">{toss.decision} FIRST</div>
          </div>
        </>
      ) : <div className="ic-empty">Toss result not entered yet.</div>}
    </NeonStage>
  );
}

/* ── Match won ─────────────────────────────────────────────────── */
function Winner({ match, winnerInfo, getAbsoluteUrl }) {
  if (!winnerInfo) return null;
  return (
    <NeonStage>
      <div className="ic-rise">{Array.from({ length: 30 }).map((_, i) => <i key={i} style={{ left: `${(i * 33) % 100}%`, animationDelay: `${(i % 10) * 0.3}s` }} />)}</div>
      <div className="ic-eyebrow ic-top">{upper(match.tournamentName, "MATCH RESULT")}</div>
      <div className="ic-win-orb"><Logo src={getAbsoluteUrl(winnerInfo.logo)} name={winnerInfo.team} className="ic-toss-logo" /></div>
      <div className="ic-win-band"><span style={fit(winnerInfo.team, 130, 13)}>{upper(winnerInfo.team)}</span></div>
      <div className="ic-win-text">{upper(winnerInfo.text)}</div>
    </NeonStage>
  );
}

/* ── Summary ───────────────────────────────────────────────────── */
function Summary({ match, getAbsoluteUrl, getOvers, isMatchFinished, finalWinnerTeam, finalWinnerText }) {
  const legal = match.legalBallCount ?? match.totalBalls ?? 0;
  const hasFirst = match.isSecondInnings && match.firstInningsScore != null;
  const fow = (match.fallOfWickets || []).slice(-6);
  const block = (team, logo, score, overs, tone) => (
    <div className={`ic-slant ic-sum-block ic-${tone}`}>
      <Logo src={getAbsoluteUrl(logo)} name={team} className="ic-sum-logo" />
      <div className="ic-sum-team" style={fit(team, 46, 18)}>{upper(team)}</div>
      <div className="ic-grad ic-sum-score">{score}</div>
      <div className="ic-sum-ov">{overs} OV</div>
    </div>
  );
  return (
    <NeonStage>
      <div className="ic-eyebrow ic-top">{isMatchFinished ? "MATCH SUMMARY" : "INNINGS SUMMARY"}  ·  {upper(match.tournamentName, "LIVE")}</div>
      <div className="ic-sum-blocks">
        {hasFirst && block(match.bowlingTeam, match.leagueLogo, `${match.firstInningsScore}/${match.firstInningsWickets ?? 0}`, getOvers(match.firstInningsOvers || 0), "mag")}
        {block(match.battingTeam, match.battingLogo, `${match.score}/${match.wickets}`, getOvers(legal), "cyan")}
      </div>
      {isMatchFinished && finalWinnerText && <div className="ic-slant ic-strip ic-sum-result">{upper(`${finalWinnerTeam || ""} ${finalWinnerText}`.trim())}</div>}
      <div className="ic-sum-panels">
        <div className="ic-glass">
          <div className="ic-glass-h">BATTING</div>
          {[match.player1, match.player2].filter((p) => p?.name).map((p, i) => <div key={i} className="ic-row"><span>{upper(p.name)}{p.onStrike ? " ▸" : ""}</span><b>{p.runs ?? 0}</b><em>{p.balls ?? 0}</em></div>)}
        </div>
        <div className="ic-glass">
          <div className="ic-glass-h">BOWLING</div>
          <div className="ic-row"><span>{upper(match.bowler?.name, "—")}</span><b>{match.bowler?.wickets ?? 0}-{match.bowler?.runs ?? 0}</b><em>{match.bowler?.overs ?? 0}</em></div>
          {match.isSecondInnings && match.targetScore > 0 && <div className="ic-row"><span>TARGET</span><b>{match.targetScore}</b><em /></div>}
        </div>
        <div className="ic-glass">
          <div className="ic-glass-h ic-glass-h-mag">FALL OF WICKETS</div>
          {fow.length === 0 ? <div className="ic-muted">No wickets fallen</div> : fow.map((w, i) => <div key={i} className="ic-row"><span>{upper(w.playerName || w.name, "BATTER")}</span><b>{w.score ?? 0}-{w.wicket ?? i + 1}</b><em>{w.overAtFall || "0.0"}</em></div>)}
        </div>
      </div>
    </NeonStage>
  );
}

/* ── Chase / need run: giant gradient number ───────────────────── */
function Chase({ match, getAbsoluteUrl, getOvers }) {
  const c = chaseInfo(match);
  const pct = c.chasing && c.target > 0 ? Math.min(100, (match.score / c.target) * 100) : Math.min(100, (c.legal / Math.max(1, c.totalBalls)) * 100);
  const stats = c.chasing
    ? [["TARGET", c.target], ["BALLS LEFT", c.ballsLeft], ["REQ RR", c.rrr], ["CURR RR", c.crr]]
    : [["OVERS", `${getOvers(c.legal)}/${match.maxOvers || 20}`], ["RUN RATE", c.crr], ["PROJECTED", Math.round(Number(c.crr) * (match.maxOvers || 20))], ["WKTS LEFT", Math.max(0, 10 - (match.wickets || 0))]];
  return (
    <NeonStage>
      <div className="ic-ch-team">
        <Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="ic-ch-logo" />
        <span style={fit(match.battingTeam, 56, 20)}>{upper(match.battingTeam)}</span>
      </div>
      <div className="ic-grad ic-ch-big">{c.chasing ? (c.runsNeeded > 0 ? c.runsNeeded : "WON") : `${match.score}/${match.wickets}`}</div>
      <div className="ic-ch-cap">{c.chasing ? (c.runsNeeded > 0 ? `RUNS NEEDED FROM ${c.ballsLeft} BALLS` : "TARGET REACHED") : `AFTER ${getOvers(c.legal)} OVERS`}</div>
      <div className="ic-ch-track"><div style={{ width: `${pct}%` }} /></div>
      <div className="ic-ch-stats">
        {stats.map(([k, v]) => <div key={k} className="ic-slant ic-stat"><span>{k}</span><b>{v}</b></div>)}
      </div>
    </NeonStage>
  );
}

/* ── Player of the match ───────────────────────────────────────── */
function Potm({ match, getAbsoluteUrl }) {
  return (
    <NeonStage>
      <div className="ic-slant ic-potm-frame"><Logo src={match.potmPhoto ? getAbsoluteUrl(match.potmPhoto) : ""} name={match.potmName} className="ic-potm-photo" /></div>
      <div className="ic-potm-info">
        <div className="ic-eyebrow">PLAYER OF THE MATCH</div>
        <div className="ic-grad ic-potm-name" style={fit(match.potmName, 140, 11)}>{upper(match.potmName)}</div>
        {match.potmTeam && <div className="ic-potm-team">{upper(match.potmTeam)}</div>}
        {match.potmFigures && <div className="ic-slant ic-strip ic-potm-figs">{upper(match.potmFigures)}</div>}
      </div>
    </NeonStage>
  );
}

/* ── Partnership: two halves meeting at a diamond ──────────────── */
function Partnership({ match }) {
  const p = match.partnership || {};
  const bats = [match.player1, match.player2].filter((x) => x?.name);
  return (
    <NeonStage>
      <div className="ic-eyebrow ic-top">CURRENT PARTNERSHIP</div>
      {bats[0] && <div className="ic-ps-half ic-ps-l"><span>{upper(bats[0].name)}</span><b>{bats[0].runs ?? 0}<small> ({bats[0].balls ?? 0})</small></b></div>}
      {bats[1] && <div className="ic-ps-half ic-ps-r"><span>{upper(bats[1].name)}</span><b>{bats[1].runs ?? 0}<small> ({bats[1].balls ?? 0})</small></b></div>}
      <div className="ic-ps-diamond"><div><b>{p.runs ?? 0}</b><span>{p.balls ?? 0} BALLS</span></div></div>
    </NeonStage>
  );
}

/* ── Squad ─────────────────────────────────────────────────────── */
function Squad({ match, getAbsoluteUrl }) {
  const { teamName, teamLogo, players } = squadInfo(match, getAbsoluteUrl);
  const half = Math.ceil(players.length / 2);
  const col = (list, start) => (
    <div className="ic-sq-col">
      {list.map((p, i) => (
        <div key={i} className={`ic-slant ic-sq-row ${(start + i) % 2 ? "is-mag" : ""}`} style={{ animationDelay: `${(start + i) * 50}ms` }}>
          <span className="ic-sq-no">{String(start + i + 1).padStart(2, "0")}</span>
          <span className="ic-sq-name">{upper(p.name)}</span>
          <span className="ic-sq-role">{roleLabel(p.role)}</span>
        </div>
      ))}
    </div>
  );
  return (
    <NeonStage>
      <div className="ic-sq-head">
        <Logo src={teamLogo} name={teamName} className="ic-sq-logo" />
        <div>
          <div className="ic-eyebrow">SQUAD</div>
          <div className="ic-sq-team" style={fit(teamName, 100, 18)}>{upper(teamName, "TEAM")}</div>
        </div>
      </div>
      {players.length === 0 ? <div className="ic-empty">No squad added for this team yet.</div> : (
        <div className="ic-sq-cols">{col(players.slice(0, half), 0)}{col(players.slice(half), half)}</div>
      )}
    </NeonStage>
  );
}

/* ── Points table ──────────────────────────────────────────────── */
function PointsTable({ match, pointsTable, hasTournament, getAbsoluteUrl }) {
  const groups = pointsTable?.groups || [];
  const g = groups[useRotate(groups.length)];
  const message = pointsTableMessage(pointsTable, hasTournament, g);
  const rows = (g?.rows || []).slice(0, 10);
  return (
    <NeonStage className={rows.length > 7 ? "ic-pt-dense" : ""}>
      <div className="ic-grad ic-pt-title">STANDINGS</div>
      <div className="ic-eyebrow ic-pt-sub">{upper(match.tournamentName, "POINTS TABLE")}{g && groups.length > 1 ? `  ·  ${upper(g.name)}` : ""}</div>
      {message ? <div className="ic-empty">{message}</div> : (
        <div className="ic-pt" key={g.groupId}>
          <div className="ic-pt-row ic-pt-head"><span>POS</span><span className="ic-pt-team">TEAM</span><span>P</span><span>W</span><span>L</span><span>NR</span><span>NRR</span><span>PTS</span></div>
          {rows.map((r, i) => (
            <div key={r.teamId} className={`ic-pt-row ${r.inQualifyingPosition ? "is-q" : ""} ${r.eliminated ? "is-out" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
              <span><b className="ic-slant ic-pt-pos">{r.position}</b></span>
              <span className="ic-pt-team"><Logo src={getAbsoluteUrl(r.logo || pointsTable.teams?.[r.teamId]?.logo || "")} name={r.name} className="ic-pt-logo" />{upper(r.name)}{r.qualified && <em>Q</em>}</span>
              <span>{r.played}</span><span>{r.won}</span><span>{r.lost}</span><span>{(r.tied || 0) + (r.noResult || 0)}</span>
              <span className={r.nrr < 0 ? "ic-neg" : "ic-pos"}>{r.nrrDisplay}</span>
              <span className="ic-pt-pts">{r.points}</span>
            </div>
          ))}
        </div>
      )}
    </NeonStage>
  );
}

/* ── Leaders ───────────────────────────────────────────────────── */
function Leaders({ match, rows = [], kind = "runs", getAbsoluteUrl }) {
  const isRuns = kind === "runs";
  const top = rows.slice(0, 5);
  const val = (r) => (isRuns ? r.runs : r.wickets) || 0;
  const max = Math.max(1, ...top.map(val));
  const leader = top[0];
  const photo = leader ? findPlayerPhoto(match, leader.name) : null;
  return (
    <NeonStage>
      <div className="ic-grad ic-pt-title ic-ld-title">{isRuns ? "TOP RUN SCORERS" : "TOP WICKET TAKERS"}</div>
      <div className="ic-eyebrow ic-pt-sub ic-ld-sub">{upper(match.tournamentName, "TOURNAMENT")}</div>
      {!leader ? <div className="ic-empty">No completed-match statistics yet.</div> : (
        <>
          <div className="ic-ld-list">
            {top.map((r, i) => (
              <div key={r.name + i} className="ic-ld-row" style={{ animationDelay: `${i * 80}ms` }}>
                <span className="ic-ld-rank">{r.rank}</span>
                <span className="ic-ld-name"><b>{upper(r.name)}</b><small>{upper(r.team)}</small></span>
                <span className="ic-ld-bar"><i style={{ width: `${(val(r) / max) * 100}%` }} /></span>
                <span className="ic-ld-val">{val(r)}</span>
              </div>
            ))}
          </div>
          <div className="ic-slant ic-ld-card">
            <Logo src={photo ? getAbsoluteUrl(photo) : ""} name={leader.name} className="ic-ld-photo" />
            <div className="ic-ld-card-name">{upper(leader.name)}</div>
            <div className="ic-grad ic-ld-card-val">{val(leader)}<small> {isRuns ? "RUNS" : "WKTS"}</small></div>
          </div>
        </>
      )}
    </NeonStage>
  );
}

/* ── Lower thirds ──────────────────────────────────────────────── */
function LastOut({ match }) {
  return (
    <div className="ic-lt">
      <span className="ic-lt-tag">OUT</span>
      <span className="ic-lt-main">{upper(match.lastWicketName)}</span>
      <span className="ic-lt-side">{match.lastWicketRuns ?? 0} ({match.lastWicketBalls ?? 0}) · {upper(match.lastWicketDismissal, "OUT")}</span>
    </div>
  );
}
function CustomText({ match }) {
  return (
    <div className="ic-lt ic-lt-custom">
      <span className="ic-lt-tag">LIVE</span>
      <span className="ic-lt-main">{match.customText}</span>
    </div>
  );
}

export default {
  Versus, Toss, Winner, Summary, MatchSituation: Chase, NeedRun: Chase, Potm, Partnership,
  Squad, PointsTable, Leaders, LastOut, CustomText,
};
