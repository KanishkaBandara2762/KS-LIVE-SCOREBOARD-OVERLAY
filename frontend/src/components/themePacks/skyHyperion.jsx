import React from "react";
import "./skyHyperion.css";
import { upper, fit, Logo, Stage, tossInfo, chaseInfo, squadInfo, roleLabel, findPlayerPhoto, useRotate, pointsTableMessage } from "./common";

/* ================================================================
   SKY_HYPERION theme pack — matte black + electric lime (#e6ff00).
   Editorial layouts: huge left-aligned type, thin lime rules, minimal tables.
   ================================================================ */

const BlackBg = () => (<><div className="hy-bg" /><div className="hy-grid" /><div className="hy-rule" /></>);
const HyStage = ({ hiding, className = "", children }) => (
  <Stage canvasClass={`hy-canvas ${className}`} hiding={hiding} background={<BlackBg />}>{children}</Stage>
);
const Label = ({ children, className = "" }) => <div className={`hy-label ${className}`}><i />{children}</div>;

/* ── Versus ────────────────────────────────────────────────────── */
function Versus({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  return (
    <HyStage hiding={hiding}>
      <Label className="hy-vs-label">{upper(match.tournamentName || match.matchTitle, "LIVE CRICKET")}{match.matchNumber ? ` — MATCH ${match.matchNumber}` : ""}</Label>
      <div className="hy-vs-names">
        <div style={fit(match.battingTeam, 150, 11)}>{upper(match.battingTeam, "TEAM A")}</div>
        <span>v</span>
        <div style={fit(match.bowlingTeam, 150, 11)}>{upper(match.bowlingTeam, "TEAM B")}</div>
      </div>
      <div className="hy-vs-logos">
        <div className="hy-sq"><Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="hy-sq-img" /></div>
        <div className="hy-sq"><Logo src={getAbsoluteUrl(match.leagueLogo)} name={match.bowlingTeam} className="hy-sq-img" /></div>
      </div>
      <div className="hy-foot">{toss.known ? toss.line : [upper(match.venueName), upper(match.matchDate)].filter(Boolean).join("  /  ") || "LIVE"}</div>
    </HyStage>
  );
}

/* ── Toss ──────────────────────────────────────────────────────── */
function Toss({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  return (
    <HyStage hiding={hiding}>
      <div className="hy-outline">TOSS</div>
      {toss.known ? (
        <>
          <div className="hy-sq hy-toss-sq"><Logo src={getAbsoluteUrl(toss.winnerLogo)} name={toss.winner} className="hy-sq-img" /></div>
          <div className="hy-toss-info">
            <Label>WON THE TOSS</Label>
            <div className="hy-big" style={fit(toss.winner, 120, 12)}>{upper(toss.winner)}</div>
            <div className="hy-chip">ELECTED TO {toss.decision} FIRST</div>
          </div>
        </>
      ) : <div className="hy-empty">Toss result not entered yet.</div>}
    </HyStage>
  );
}

/* ── Match won ─────────────────────────────────────────────────── */
function Winner({ match, winnerInfo, getAbsoluteUrl }) {
  if (!winnerInfo) return null;
  return (
    <HyStage>
      <Label className="hy-win-label">RESULT{match.tournamentName ? ` — ${upper(match.tournamentName)}` : ""}</Label>
      <div className="hy-big hy-win-team" style={fit(winnerInfo.team, 190, 10)}>{upper(winnerInfo.team)}</div>
      <div className="hy-win-line" />
      <div className="hy-win-text">{upper(winnerInfo.text)}</div>
      <div className="hy-sq hy-win-sq"><Logo src={getAbsoluteUrl(winnerInfo.logo)} name={winnerInfo.team} className="hy-sq-img" /></div>
    </HyStage>
  );
}

/* ── Summary ───────────────────────────────────────────────────── */
function Summary({ match, getOvers, isMatchFinished, finalWinnerTeam, finalWinnerText }) {
  const legal = match.legalBallCount ?? match.totalBalls ?? 0;
  const hasFirst = match.isSecondInnings && match.firstInningsScore != null;
  const fow = (match.fallOfWickets || []).slice(-6);
  return (
    <HyStage>
      <Label className="hy-sum-label">{isMatchFinished ? "MATCH SUMMARY" : "SCORECARD"} — {upper(match.tournamentName, "LIVE")}</Label>
      <div className="hy-sum-inns">
        {hasFirst && <div className="hy-inn"><span>{upper(match.bowlingTeam)}</span><b>{match.firstInningsScore}/{match.firstInningsWickets ?? 0}</b><em>{getOvers(match.firstInningsOvers || 0)} ov</em></div>}
        <div className="hy-inn is-live"><span>{upper(match.battingTeam)}</span><b>{match.score}/{match.wickets}</b><em>{getOvers(legal)} ov</em></div>
      </div>
      {isMatchFinished && finalWinnerText && <div className="hy-chip hy-sum-result">{upper(`${finalWinnerTeam || ""} ${finalWinnerText}`.trim())}</div>}
      <div className="hy-sum-cols">
        <div className="hy-col">
          <div className="hy-col-h"><span>BATTING</span><span>R</span><span>B</span></div>
          {[match.player1, match.player2].filter((p) => p?.name).map((p, i) => <div key={i} className="hy-col-r"><span>{upper(p.name)}{p.onStrike ? " *" : ""}</span><b>{p.runs ?? 0}</b><em>{p.balls ?? 0}</em></div>)}
        </div>
        <div className="hy-col">
          <div className="hy-col-h"><span>BOWLING</span><span>W-R</span><span>O</span></div>
          <div className="hy-col-r"><span>{upper(match.bowler?.name, "—")}</span><b>{match.bowler?.wickets ?? 0}-{match.bowler?.runs ?? 0}</b><em>{match.bowler?.overs ?? 0}</em></div>
        </div>
        <div className="hy-col">
          <div className="hy-col-h"><span>WICKETS</span><span>SCORE</span><span>OV</span></div>
          {fow.length === 0 ? <div className="hy-muted">No wickets fallen</div> : fow.map((w, i) => <div key={i} className="hy-col-r"><span>{upper(w.playerName || w.name, "BATTER")}</span><b>{w.score ?? 0}-{w.wicket ?? i + 1}</b><em>{w.overAtFall || "0.0"}</em></div>)}
        </div>
      </div>
    </HyStage>
  );
}

/* ── Chase / need run ──────────────────────────────────────────── */
function Chase({ match, getAbsoluteUrl, getOvers }) {
  const c = chaseInfo(match);
  const big = c.chasing ? (c.runsNeeded > 0 ? c.runsNeeded : "WON") : `${match.score}/${match.wickets}`;
  const cap = c.chasing ? (c.runsNeeded > 0 ? `runs needed from ${c.ballsLeft} balls` : "target reached") : `after ${getOvers(c.legal)} overs`;
  const stats = c.chasing
    ? [["Target", c.target], ["Balls left", c.ballsLeft], ["Required rate", c.rrr], ["Current rate", c.crr], ["Wickets left", Math.max(0, 10 - (match.wickets || 0))]]
    : [["Overs", `${getOvers(c.legal)} / ${match.maxOvers || 20}`], ["Run rate", c.crr], ["Projected", Math.round(Number(c.crr) * (match.maxOvers || 20))], ["Wickets left", Math.max(0, 10 - (match.wickets || 0))]];
  return (
    <HyStage>
      <Label className="hy-sum-label">{c.chasing ? "THE CHASE" : "MATCH SITUATION"} — {upper(match.battingTeam)}</Label>
      <div className="hy-ch-big">{big}</div>
      <div className="hy-ch-cap">{cap}</div>
      <div className="hy-ch-stats">
        {stats.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
      </div>
      <div className="hy-sq hy-ch-sq"><Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="hy-sq-img" /></div>
    </HyStage>
  );
}

/* ── Player of the match ───────────────────────────────────────── */
function Potm({ match, getAbsoluteUrl }) {
  return (
    <HyStage>
      <div className="hy-potm-photo"><Logo src={match.potmPhoto ? getAbsoluteUrl(match.potmPhoto) : ""} name={match.potmName} className="hy-potm-img" /></div>
      <div className="hy-potm-info">
        <Label>PLAYER OF THE MATCH</Label>
        <div className="hy-big" style={fit(match.potmName, 150, 9)}>{upper(match.potmName)}</div>
        {match.potmTeam && <div className="hy-potm-team">{upper(match.potmTeam)}</div>}
        {match.potmFigures && <div className="hy-chip hy-potm-figs">{upper(match.potmFigures)}</div>}
      </div>
    </HyStage>
  );
}

/* ── Partnership ───────────────────────────────────────────────── */
function Partnership({ match }) {
  const p = match.partnership || {};
  const bats = [match.player1, match.player2].filter((x) => x?.name);
  const total = bats.reduce((a, b) => a + (b.runs || 0), 0) || 1;
  return (
    <HyStage>
      <Label className="hy-sum-label">PARTNERSHIP</Label>
      <div className="hy-ps-total">{p.runs ?? 0}<small> runs / {p.balls ?? 0} balls</small></div>
      <div className="hy-ps-bar">{bats.map((b, i) => <div key={i} className={`hy-ps-seg hy-ps-seg-${i}`} style={{ flexGrow: Math.max(1, b.runs || 0) / total }} />)}</div>
      <div className="hy-ps-names">
        {bats.map((b, i) => <div key={i} className={`hy-ps-bat hy-ps-bat-${i}`}><span>{upper(b.name)}</span><b>{b.runs ?? 0}<small> ({b.balls ?? 0})</small></b></div>)}
      </div>
    </HyStage>
  );
}

/* ── Squad ─────────────────────────────────────────────────────── */
function Squad({ match, getAbsoluteUrl }) {
  const { teamName, teamLogo, players } = squadInfo(match, getAbsoluteUrl);
  return (
    <HyStage>
      <div className="hy-sq hy-sq-head-logo"><Logo src={teamLogo} name={teamName} className="hy-sq-img" /></div>
      <Label className="hy-sq-label">PLAYING SQUAD</Label>
      <div className="hy-big hy-sq-team" style={fit(teamName, 110, 16)}>{upper(teamName, "TEAM")}</div>
      {players.length === 0 ? <div className="hy-empty">No squad added for this team yet.</div> : (
        <div className="hy-sq-list">
          {players.map((p, i) => (
            <div key={i} className="hy-sq-item" style={{ animationDelay: `${i * 40}ms` }}>
              <b>{String(i + 1).padStart(2, "0")}</b><span>{upper(p.name)}</span><em>{roleLabel(p.role)}</em>
            </div>
          ))}
        </div>
      )}
    </HyStage>
  );
}

/* ── Points table ──────────────────────────────────────────────── */
function PointsTable({ match, pointsTable, hasTournament, getAbsoluteUrl }) {
  const groups = pointsTable?.groups || [];
  const g = groups[useRotate(groups.length)];
  const message = pointsTableMessage(pointsTable, hasTournament, g);
  const rows = (g?.rows || []).slice(0, 10);
  return (
    <HyStage className={rows.length > 7 ? "hy-pt-dense" : ""}>
      <Label className="hy-sum-label">{upper(match.tournamentName, "STANDINGS")}{g && groups.length > 1 ? ` — ${upper(g.name)}` : ""}</Label>
      <div className="hy-big hy-pt-title">Points Table</div>
      {message ? <div className="hy-empty">{message}</div> : (
        <div className="hy-pt" key={g.groupId}>
          <div className="hy-pt-row hy-pt-head"><span>#</span><span className="hy-pt-team">Team</span><span>P</span><span>W</span><span>L</span><span>NR</span><span>NRR</span><span>Pts</span></div>
          {rows.map((r, i) => (
            <div key={r.teamId} className={`hy-pt-row ${r.inQualifyingPosition ? "is-q" : ""} ${r.eliminated ? "is-out" : ""}`} style={{ animationDelay: `${i * 50}ms` }}>
              <span className="hy-pt-pos">{r.position}</span>
              <span className="hy-pt-team"><Logo src={getAbsoluteUrl(r.logo || pointsTable.teams?.[r.teamId]?.logo || "")} name={r.name} className="hy-pt-logo" />{upper(r.name)}{r.qualified && <em>Q</em>}</span>
              <span>{r.played}</span><span>{r.won}</span><span>{r.lost}</span><span>{(r.tied || 0) + (r.noResult || 0)}</span>
              <span>{r.nrrDisplay}</span><span className="hy-pt-pts">{r.points}</span>
            </div>
          ))}
        </div>
      )}
    </HyStage>
  );
}

/* ── Leaders ───────────────────────────────────────────────────── */
function Leaders({ match, rows = [], kind = "runs", getAbsoluteUrl }) {
  const isRuns = kind === "runs";
  const top = rows.slice(0, 5);
  const val = (r) => (isRuns ? r.runs : r.wickets);
  const leader = top[0];
  const photo = leader ? findPlayerPhoto(match, leader.name) : null;
  return (
    <HyStage>
      <Label className="hy-sum-label">{upper(match.tournamentName, "TOURNAMENT")}</Label>
      <div className="hy-big hy-pt-title">{isRuns ? "Most Runs" : "Most Wickets"}</div>
      {!leader ? <div className="hy-empty">No completed-match statistics yet.</div> : (
        <>
          <div className="hy-ld">
            {top.map((r, i) => (
              <div key={r.name + i} className={`hy-ld-row ${i === 0 ? "is-top" : ""}`} style={{ animationDelay: `${i * 70}ms` }}>
                <span className="hy-ld-rank">{r.rank}</span>
                <span className="hy-ld-name"><b>{upper(r.name)}</b><small>{upper(r.team)}</small></span>
                <span className="hy-ld-val">{val(r)}</span>
              </div>
            ))}
          </div>
          <div className="hy-potm-photo hy-ld-photo"><Logo src={photo ? getAbsoluteUrl(photo) : ""} name={leader.name} className="hy-potm-img" /></div>
        </>
      )}
    </HyStage>
  );
}

/* ── Lower thirds ──────────────────────────────────────────────── */
function LastOut({ match }) {
  return (
    <div className="hy-lt"><span className="hy-lt-tag">OUT</span><span className="hy-lt-main">{upper(match.lastWicketName)}</span><span className="hy-lt-side">{match.lastWicketRuns ?? 0} ({match.lastWicketBalls ?? 0}) {match.lastWicketDismissal || ""}</span></div>
  );
}
function CustomText({ match }) {
  return <div className="hy-lt hy-lt-custom"><span className="hy-lt-tag">INFO</span><span className="hy-lt-main">{match.customText}</span></div>;
}

export default {
  Versus, Toss, Winner, Summary, MatchSituation: Chase, NeedRun: Chase, Potm, Partnership,
  Squad, PointsTable, Leaders, LastOut, CustomText,
};
