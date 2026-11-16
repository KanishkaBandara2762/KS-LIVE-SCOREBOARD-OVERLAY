import React from "react";
import "./supersportAura.css";
import { upper, fit, Logo, Stage, tossInfo, chaseInfo, squadInfo, roleLabel, findPlayerPhoto, useRotate, pointsTableMessage } from "./common";

/* ================================================================
   SUPERSPORT_AURA theme pack — frosted glass over an aurora sky.
   Emerald #10b981 / #34d399, sky #38bdf8, violet #c084fc, rose #e11d48.
   Rounded glass cards, soft glows, clean Plus Jakarta Sans type.
   ================================================================ */

const AuroraBg = () => (
  <>
    <div className="sa-bg" />
    <div className="sa-blob sa-b1" /><div className="sa-blob sa-b2" /><div className="sa-blob sa-b3" />
  </>
);
const AuraStage = ({ hiding, className = "", children }) => (
  <Stage canvasClass={`sa-canvas ${className}`} hiding={hiding} background={<AuroraBg />}>{children}</Stage>
);
const Glass = ({ className = "", children, style }) => <div className={`sa-glass ${className}`} style={style}>{children}</div>;
const Chip = ({ children, className = "" }) => <div className={`sa-chip ${className}`}>{children}</div>;

/* ── Versus ────────────────────────────────────────────────────── */
function Versus({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  const card = (name, logo, cls) => (
    <Glass className={`sa-vs-card ${cls}`}>
      <Logo src={getAbsoluteUrl(logo)} name={name} className="sa-vs-logo" />
      <div className="sa-vs-name" style={fit(name, 60, 15)}>{upper(name)}</div>
    </Glass>
  );
  return (
    <AuraStage hiding={hiding}>
      <Chip className="sa-top">{upper(match.tournamentName || match.matchTitle, "LIVE CRICKET")}{match.matchNumber ? ` · MATCH ${match.matchNumber}` : ""}</Chip>
      {card(match.battingTeam || "TEAM A", match.battingLogo, "sa-vs-a")}
      {card(match.bowlingTeam || "TEAM B", match.leagueLogo, "sa-vs-b")}
      <Glass className="sa-vs-mid">VS</Glass>
      <Glass className="sa-strip sa-vs-strip">{toss.known ? toss.line : [upper(match.venueName), upper(match.matchDate)].filter(Boolean).join(" · ") || "LIVE"}</Glass>
    </AuraStage>
  );
}

/* ── Toss ──────────────────────────────────────────────────────── */
function Toss({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  return (
    <AuraStage hiding={hiding}>
      {toss.known ? (
        <Glass className="sa-toss">
          <Chip>TOSS RESULT</Chip>
          <Logo src={getAbsoluteUrl(toss.winnerLogo)} name={toss.winner} className="sa-toss-logo" />
          <div className="sa-toss-name" style={fit(toss.winner, 90, 15)}>{upper(toss.winner)}</div>
          <div className="sa-toss-dec">won the toss and chose to <b>{String(toss.decision).toLowerCase()}</b></div>
        </Glass>
      ) : <Glass className="sa-empty">Toss result not entered yet.</Glass>}
    </AuraStage>
  );
}

/* ── Match won ─────────────────────────────────────────────────── */
function Winner({ match, winnerInfo, getAbsoluteUrl }) {
  if (!winnerInfo) return null;
  return (
    <AuraStage>
      <div className="sa-dots">{Array.from({ length: 26 }).map((_, i) => <i key={i} style={{ left: `${(i * 29) % 100}%`, top: `${(i * 47) % 100}%`, animationDelay: `${(i % 8) * 0.25}s` }} />)}</div>
      <Glass className="sa-win">
        <Chip>{upper(match.tournamentName, "MATCH RESULT")}</Chip>
        <Logo src={getAbsoluteUrl(winnerInfo.logo)} name={winnerInfo.team} className="sa-win-logo" />
        <div className="sa-grad sa-win-team" style={fit(winnerInfo.team, 120, 13)}>{upper(winnerInfo.team)}</div>
        <div className="sa-win-text">{winnerInfo.text}</div>
      </Glass>
    </AuraStage>
  );
}

/* ── Summary ───────────────────────────────────────────────────── */
function Summary({ match, getAbsoluteUrl, getOvers, isMatchFinished, finalWinnerTeam, finalWinnerText }) {
  const legal = match.legalBallCount ?? match.totalBalls ?? 0;
  const hasFirst = match.isSecondInnings && match.firstInningsScore != null;
  const fow = (match.fallOfWickets || []).slice(-6);
  const inn = (team, logo, score, overs, live) => (
    <Glass className={`sa-inn ${live ? "is-live" : ""}`}>
      <Logo src={getAbsoluteUrl(logo)} name={team} className="sa-inn-logo" />
      <div className="sa-inn-team">{upper(team)}</div>
      <div className="sa-inn-score">{score}<small>{overs} ov</small></div>
    </Glass>
  );
  return (
    <AuraStage>
      <Chip className="sa-top">{isMatchFinished ? "MATCH SUMMARY" : "SCORE SUMMARY"} · {upper(match.tournamentName, "LIVE")}</Chip>
      <div className="sa-inns">
        {hasFirst && inn(match.bowlingTeam, match.leagueLogo, `${match.firstInningsScore}/${match.firstInningsWickets ?? 0}`, getOvers(match.firstInningsOvers || 0), false)}
        {inn(match.battingTeam, match.battingLogo, `${match.score}/${match.wickets}`, getOvers(legal), true)}
      </div>
      {isMatchFinished && finalWinnerText && <Glass className="sa-strip sa-sum-result">{upper(`${finalWinnerTeam || ""} ${finalWinnerText}`.trim())}</Glass>}
      <div className="sa-cards">
        <Glass className="sa-card">
          <div className="sa-card-h"><i className="sa-dot-em" />Batting</div>
          {[match.player1, match.player2].filter((p) => p?.name).map((p, i) => <div key={i} className="sa-row"><span>{upper(p.name)}{p.onStrike ? " •" : ""}</span><b>{p.runs ?? 0}</b><em>{p.balls ?? 0}</em></div>)}
        </Glass>
        <Glass className="sa-card">
          <div className="sa-card-h"><i className="sa-dot-sky" />Bowling</div>
          <div className="sa-row"><span>{upper(match.bowler?.name, "—")}</span><b>{match.bowler?.wickets ?? 0}-{match.bowler?.runs ?? 0}</b><em>{match.bowler?.overs ?? 0}</em></div>
        </Glass>
        <Glass className="sa-card">
          <div className="sa-card-h"><i className="sa-dot-rose" />Wickets</div>
          {fow.length === 0 ? <div className="sa-muted">No wickets fallen</div> : fow.map((w, i) => <div key={i} className="sa-row"><span>{upper(w.playerName || w.name, "BATTER")}</span><b>{w.score ?? 0}-{w.wicket ?? i + 1}</b><em>{w.overAtFall || "0.0"}</em></div>)}
        </Glass>
      </div>
    </AuraStage>
  );
}

/* ── Chase: glass tiles + glowing progress pill ────────────────── */
function Chase({ match, getAbsoluteUrl, getOvers }) {
  const c = chaseInfo(match);
  const pct = c.chasing && c.target > 0 ? Math.min(100, (match.score / c.target) * 100) : Math.min(100, (c.legal / Math.max(1, c.totalBalls)) * 100);
  const tiles = c.chasing
    ? [["Runs needed", c.runsNeeded, "em"], ["Balls left", c.ballsLeft, "sky"], ["Required rate", c.rrr, "rose"], ["Current rate", c.crr, "violet"]]
    : [["Score", `${match.score}/${match.wickets}`, "em"], ["Overs", getOvers(c.legal), "sky"], ["Run rate", c.crr, "violet"], ["Projected", Math.round(Number(c.crr) * (match.maxOvers || 20)), "rose"]];
  return (
    <AuraStage>
      <Chip className="sa-top">{c.chasing ? `TARGET ${c.target}` : "MATCH SITUATION"}</Chip>
      <div className="sa-ch-head">
        <Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="sa-inn-logo sa-ch-logo" />
        <div className="sa-ch-name" style={fit(match.battingTeam, 80, 20)}>{upper(match.battingTeam)}</div>
      </div>
      <div className="sa-grad sa-ch-line">
        {c.chasing ? (c.runsNeeded > 0 ? `${c.runsNeeded} off ${c.ballsLeft}` : "Target reached") : `${match.score}/${match.wickets} · ${getOvers(c.legal)} ov`}
      </div>
      <Glass className="sa-progress"><div style={{ width: `${pct}%` }} /></Glass>
      <div className="sa-tiles">
        {tiles.map(([k, v, tone]) => <Glass key={k} className={`sa-tile sa-tone-${tone}`}><span>{k}</span><b>{v}</b></Glass>)}
      </div>
    </AuraStage>
  );
}

/* ── Player of the match ───────────────────────────────────────── */
function Potm({ match, getAbsoluteUrl }) {
  return (
    <AuraStage>
      <Glass className="sa-potm">
        <div className="sa-potm-ring"><Logo src={match.potmPhoto ? getAbsoluteUrl(match.potmPhoto) : ""} name={match.potmName} className="sa-potm-img" /></div>
        <div className="sa-potm-info">
          <Chip>PLAYER OF THE MATCH</Chip>
          <div className="sa-grad sa-potm-name" style={fit(match.potmName, 110, 12)}>{upper(match.potmName)}</div>
          {match.potmTeam && <div className="sa-potm-team">{upper(match.potmTeam)}</div>}
          {match.potmFigures && <div className="sa-potm-figs">{match.potmFigures}</div>}
        </div>
      </Glass>
    </AuraStage>
  );
}

/* ── Partnership ───────────────────────────────────────────────── */
function Partnership({ match }) {
  const p = match.partnership || {};
  const bats = [match.player1, match.player2].filter((x) => x?.name);
  const total = bats.reduce((a, b) => a + (b.runs || 0), 0) || 1;
  return (
    <AuraStage>
      <Glass className="sa-ps">
        <Chip>PARTNERSHIP</Chip>
        <div className="sa-grad sa-ps-total">{p.runs ?? 0}</div>
        <div className="sa-ps-sub">runs from {p.balls ?? 0} balls</div>
        <div className="sa-ps-bar">{bats.map((b, i) => <div key={i} className={`sa-ps-seg sa-ps-seg-${i}`} style={{ flexGrow: Math.max(1, b.runs || 0) / total }} />)}</div>
        <div className="sa-ps-names">
          {bats.map((b, i) => <div key={i} className={`sa-ps-bat sa-ps-bat-${i}`}><i />{upper(b.name)} <b>{b.runs ?? 0}</b><em>({b.balls ?? 0})</em></div>)}
        </div>
      </Glass>
    </AuraStage>
  );
}

/* ── Squad: glass chips with avatars ───────────────────────────── */
function Squad({ match, getAbsoluteUrl }) {
  const { teamName, teamLogo, players } = squadInfo(match, getAbsoluteUrl);
  return (
    <AuraStage>
      <div className="sa-sq-head">
        <Logo src={teamLogo} name={teamName} className="sa-inn-logo sa-sq-logo" />
        <div>
          <Chip>PLAYING SQUAD</Chip>
          <div className="sa-sq-team" style={fit(teamName, 96, 18)}>{upper(teamName, "TEAM")}</div>
        </div>
      </div>
      {players.length === 0 ? <Glass className="sa-empty">No squad added for this team yet.</Glass> : (
        <div className="sa-sq-grid">
          {players.map((p, i) => (
            <Glass key={i} className="sa-sq-chip" style={{ animationDelay: `${i * 45}ms` }}>
              <Logo src={p.photo ? getAbsoluteUrl(p.photo) : ""} name={p.name} className="sa-sq-avatar" />
              <span className="sa-sq-info"><b>{upper(p.name)}</b><small>{roleLabel(p.role)}</small></span>
            </Glass>
          ))}
        </div>
      )}
    </AuraStage>
  );
}

/* ── Points table ──────────────────────────────────────────────── */
function PointsTable({ match, pointsTable, hasTournament, getAbsoluteUrl }) {
  const groups = pointsTable?.groups || [];
  const g = groups[useRotate(groups.length)];
  const message = pointsTableMessage(pointsTable, hasTournament, g);
  const rows = (g?.rows || []).slice(0, 10);
  return (
    <AuraStage className={rows.length > 7 ? "sa-pt-dense" : ""}>
      <Chip className="sa-top">{upper(match.tournamentName, "STANDINGS")}{g && groups.length > 1 ? ` · ${upper(g.name)}` : ""}</Chip>
      <div className="sa-grad sa-pt-title">Points Table</div>
      {message ? <Glass className="sa-empty">{message}</Glass> : (
        <Glass className="sa-pt" key={g.groupId}>
          <div className="sa-pt-row sa-pt-head"><span>#</span><span className="sa-pt-team">Team</span><span>P</span><span>W</span><span>L</span><span>NR</span><span>NRR</span><span>Pts</span></div>
          {rows.map((r, i) => (
            <div key={r.teamId} className={`sa-pt-row ${r.inQualifyingPosition ? "is-q" : ""} ${r.eliminated ? "is-out" : ""}`} style={{ animationDelay: `${i * 50}ms` }}>
              <span className="sa-pt-pos">{r.position}</span>
              <span className="sa-pt-team"><Logo src={getAbsoluteUrl(r.logo || pointsTable.teams?.[r.teamId]?.logo || "")} name={r.name} className="sa-pt-logo" />{upper(r.name)}{r.qualified && <em>Q</em>}</span>
              <span>{r.played}</span><span>{r.won}</span><span>{r.lost}</span><span>{(r.tied || 0) + (r.noResult || 0)}</span>
              <span className={r.nrr < 0 ? "sa-neg" : "sa-pos"}>{r.nrrDisplay}</span><span className="sa-pt-pts">{r.points}</span>
            </div>
          ))}
        </Glass>
      )}
    </AuraStage>
  );
}

/* ── Leaders ───────────────────────────────────────────────────── */
function Leaders({ match, rows = [], kind = "runs", getAbsoluteUrl }) {
  const isRuns = kind === "runs";
  const top = rows.slice(0, 5);
  const val = (r) => (isRuns ? r.runs : r.wickets) || 0;
  const max = Math.max(1, ...top.map(val));
  return (
    <AuraStage>
      <Chip className="sa-top">{upper(match.tournamentName, "TOURNAMENT")}</Chip>
      <div className="sa-grad sa-pt-title">{isRuns ? "Most Runs" : "Most Wickets"}</div>
      {!top[0] ? <Glass className="sa-empty">No completed-match statistics yet.</Glass> : (
        <div className="sa-ld">
          {top.map((r, i) => {
            const photo = findPlayerPhoto(match, r.name);
            return (
              <Glass key={r.name + i} className={`sa-ld-row ${i === 0 ? "is-top" : ""}`} style={{ animationDelay: `${i * 70}ms` }}>
                <span className="sa-ld-rank">{r.rank}</span>
                <Logo src={photo ? getAbsoluteUrl(photo) : ""} name={r.name} className="sa-sq-avatar sa-ld-avatar" />
                <span className="sa-ld-name"><b>{upper(r.name)}</b><small>{upper(r.team)}</small></span>
                <span className="sa-ld-bar"><i style={{ width: `${(val(r) / max) * 100}%` }} /></span>
                <span className="sa-ld-val">{val(r)}</span>
              </Glass>
            );
          })}
        </div>
      )}
    </AuraStage>
  );
}

/* ── Lower thirds ──────────────────────────────────────────────── */
function LastOut({ match }) {
  return (
    <div className="sa-lt"><span className="sa-lt-tag">OUT</span><span className="sa-lt-main">{upper(match.lastWicketName)}</span><span className="sa-lt-side">{match.lastWicketRuns ?? 0} ({match.lastWicketBalls ?? 0}) · {match.lastWicketDismissal || "out"}</span></div>
  );
}
function CustomText({ match }) {
  return <div className="sa-lt sa-lt-custom"><span className="sa-lt-tag">i</span><span className="sa-lt-main">{match.customText}</span></div>;
}

export default {
  Versus, Toss, Winner, Summary, MatchSituation: Chase, NeedRun: Chase, Potm, Partnership,
  Squad, PointsTable, Leaders, LastOut, CustomText,
};
