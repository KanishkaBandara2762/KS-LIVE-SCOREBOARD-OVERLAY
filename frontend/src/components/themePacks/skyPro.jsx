import React from "react";
import "./skyPro.css";
import { upper, fit, Logo, Stage, tossInfo, chaseInfo, squadInfo, roleLabel, findPlayerPhoto, useRotate, pointsTableMessage } from "./common";

/* ================================================================
   SKY_PRO theme pack — clean light TV graphics:
   white cards, red header blocks, dark slate text, thin rules.
   Matches the Sky Pro scorebar (white, red-600, slate-900).
   ================================================================ */

const LightBg = () => (
  <>
    <div className="sp-bg" />
    <div className="sp-slash" />
  </>
);

const LightStage = ({ hiding, className = "", children }) => (
  <Stage canvasClass={`sp-canvas ${className}`} hiding={hiding} background={<LightBg />}>{children}</Stage>
);

/** Red header block + white card body. */
const Card = ({ title, className = "", children, style }) => (
  <div className={`sp-card ${className}`} style={style}>
    {title && <div className="sp-card-h">{title}</div>}
    <div className="sp-card-b">{children}</div>
  </div>
);

/* ── Versus ────────────────────────────────────────────────────── */
function Versus({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  const meta = [match.matchNumber ? `MATCH ${match.matchNumber}` : "", upper(match.venueName), upper(match.matchDate)].filter(Boolean).join("   |   ");
  return (
    <LightStage hiding={hiding}>
      <div className="sp-eyebrow sp-vs-eyebrow">{upper(match.tournamentName || match.matchTitle, "LIVE CRICKET")}</div>
      <div className="sp-vs-team sp-vs-a">
        <div className="sp-disc"><Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="sp-disc-img" /></div>
        <div className="sp-vs-name" style={fit(match.battingTeam, 64, 13)}>{upper(match.battingTeam, "TEAM A")}</div>
      </div>
      <div className="sp-vs-team sp-vs-b">
        <div className="sp-disc"><Logo src={getAbsoluteUrl(match.leagueLogo)} name={match.bowlingTeam} className="sp-disc-img" /></div>
        <div className="sp-vs-name" style={fit(match.bowlingTeam, 64, 13)}>{upper(match.bowlingTeam, "TEAM B")}</div>
      </div>
      <div className="sp-vs-v"><span>V</span></div>
      {meta && <div className="sp-vs-meta">{meta}</div>}
      {toss.known && <div className="sp-redbar sp-vs-toss">{toss.line}</div>}
    </LightStage>
  );
}

/* ── Toss ──────────────────────────────────────────────────────── */
function Toss({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  return (
    <LightStage hiding={hiding}>
      {toss.known ? (
        <Card title="THE TOSS" className="sp-toss">
          <div className="sp-toss-row">
            <div className="sp-disc sp-disc-sm"><Logo src={getAbsoluteUrl(toss.winnerLogo)} name={toss.winner} className="sp-disc-img" /></div>
            <div>
              <div className="sp-label">WON BY</div>
              <div className="sp-toss-name" style={fit(toss.winner, 96, 16)}>{upper(toss.winner)}</div>
            </div>
          </div>
          <div className="sp-toss-dec"><span>DECISION</span><b>{toss.decision} FIRST</b></div>
        </Card>
      ) : <div className="sp-empty">Toss result not entered yet.</div>}
    </LightStage>
  );
}

/* ── Match won ─────────────────────────────────────────────────── */
function Winner({ winnerInfo, getAbsoluteUrl, match }) {
  if (!winnerInfo) return null;
  return (
    <LightStage className="sp-win">
      <div className="sp-win-red" />
      <div className="sp-disc sp-win-disc"><Logo src={getAbsoluteUrl(winnerInfo.logo)} name={winnerInfo.team} className="sp-disc-img" /></div>
      <div className="sp-win-label">RESULT{match.tournamentName ? ` • ${upper(match.tournamentName)}` : ""}</div>
      <div className="sp-win-team" style={fit(winnerInfo.team, 140, 13)}>{upper(winnerInfo.team)}</div>
      <div className="sp-win-text">{upper(winnerInfo.text)}</div>
    </LightStage>
  );
}

/* ── Summary: classic scorecard card ───────────────────────────── */
function Summary({ match, getAbsoluteUrl, getOvers, isMatchFinished, finalWinnerTeam, finalWinnerText }) {
  const legal = match.legalBallCount ?? match.totalBalls ?? 0;
  const hasFirst = match.isSecondInnings && match.firstInningsScore != null;
  const fow = (match.fallOfWickets || []).slice(-8);
  return (
    <LightStage>
      <div className="sp-eyebrow sp-sum-eyebrow">{upper(match.tournamentName || match.matchTitle, "SCORECARD")}</div>
      <div className="sp-sum-scores">
        {hasFirst && (
          <div className="sp-sum-score">
            <Logo src={getAbsoluteUrl(match.leagueLogo)} name={match.bowlingTeam} className="sp-sum-logo" />
            <span className="sp-sum-team">{upper(match.bowlingTeam)}</span>
            <b>{match.firstInningsScore}-{match.firstInningsWickets ?? 0}</b><em>{getOvers(match.firstInningsOvers || 0)} ov</em>
          </div>
        )}
        <div className="sp-sum-score is-live">
          <Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="sp-sum-logo" />
          <span className="sp-sum-team">{upper(match.battingTeam)}</span>
          <b>{match.score}-{match.wickets}</b><em>{getOvers(legal)} ov</em>
        </div>
      </div>
      {isMatchFinished && finalWinnerText && <div className="sp-redbar sp-sum-result">{upper(`${finalWinnerTeam || ""} ${finalWinnerText}`.trim())}</div>}
      <div className="sp-sum-cards">
        <Card title="BATTING">
          <div className="sp-trow sp-thead"><span>BATTER</span><span>R</span><span>B</span></div>
          {[match.player1, match.player2].filter((p) => p?.name).map((p, i) => <div key={i} className="sp-trow"><span>{upper(p.name)}{p.onStrike ? " *" : ""}</span><b>{p.runs ?? 0}</b><em>{p.balls ?? 0}</em></div>)}
        </Card>
        <Card title="BOWLING">
          <div className="sp-trow sp-thead"><span>BOWLER</span><span>W-R</span><span>O</span></div>
          <div className="sp-trow"><span>{upper(match.bowler?.name, "—")}</span><b>{match.bowler?.wickets ?? 0}-{match.bowler?.runs ?? 0}</b><em>{match.bowler?.overs ?? 0}</em></div>
        </Card>
        <Card title="FALL OF WICKETS">
          {fow.length === 0 ? <div className="sp-muted">No wickets fallen</div> : fow.map((w, i) => <div key={i} className="sp-trow"><span>{upper(w.playerName || w.name, "BATTER")}</span><b>{w.score ?? 0}-{w.wicket ?? i + 1}</b><em>{w.overAtFall || "0.0"}</em></div>)}
        </Card>
      </div>
    </LightStage>
  );
}

/* ── Chase / need run ──────────────────────────────────────────── */
function Chase({ match, getAbsoluteUrl, getOvers }) {
  const c = chaseInfo(match);
  const pct = c.chasing && c.target > 0 ? Math.min(100, (match.score / c.target) * 100) : Math.min(100, (c.legal / Math.max(1, c.totalBalls)) * 100);
  const tiles = c.chasing
    ? [["TARGET", c.target], ["RUNS NEEDED", c.runsNeeded], ["BALLS LEFT", c.ballsLeft], ["REQ. RATE", c.rrr], ["RUN RATE", c.crr]]
    : [["SCORE", `${match.score}-${match.wickets}`], ["OVERS", getOvers(c.legal)], ["RUN RATE", c.crr], ["PROJECTED", Math.round(Number(c.crr) * (match.maxOvers || 20))], ["WKTS LEFT", Math.max(0, 10 - (match.wickets || 0))]];
  return (
    <LightStage className="sp-thin-slash">
      <div className="sp-ch-head">
        <Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="sp-sum-logo sp-ch-logo" />
        <div>
          <div className="sp-eyebrow">{c.chasing ? "THE RUN CHASE" : "MATCH SITUATION"}</div>
          <div className="sp-ch-name" style={fit(match.battingTeam, 96, 18)}>{upper(match.battingTeam)}</div>
        </div>
      </div>
      <div className="sp-ch-big">
        {c.chasing ? (c.runsNeeded > 0 ? <>NEED <b>{c.runsNeeded}</b> FROM <b>{c.ballsLeft}</b> BALLS</> : <><b>{upper(match.battingTeam)}</b> WIN</>)
          : <><b>{match.score}-{match.wickets}</b> AFTER <b>{getOvers(c.legal)}</b> OVERS</>}
      </div>
      <div className="sp-ch-bar"><div style={{ width: `${pct}%` }} /></div>
      <div className="sp-ch-tiles">
        {tiles.map(([k, v]) => <div key={k} className="sp-tile"><span>{k}</span><b>{v}</b></div>)}
      </div>
    </LightStage>
  );
}

/* ── Player of the match ───────────────────────────────────────── */
function Potm({ match, getAbsoluteUrl }) {
  return (
    <LightStage>
      <div className="sp-potm-card">
        <div className="sp-potm-photo-wrap"><Logo src={match.potmPhoto ? getAbsoluteUrl(match.potmPhoto) : ""} name={match.potmName} className="sp-potm-photo" /></div>
        <div className="sp-potm-info">
          <div className="sp-card-h sp-potm-h">PLAYER OF THE MATCH</div>
          <div className="sp-potm-name" style={fit(match.potmName, 120, 12)}>{upper(match.potmName)}</div>
          {match.potmTeam && <div className="sp-potm-team">{upper(match.potmTeam)}</div>}
          {match.potmFigures && <div className="sp-potm-figs">{upper(match.potmFigures)}</div>}
        </div>
      </div>
    </LightStage>
  );
}

/* ── Partnership: stacked contribution bar ─────────────────────── */
function Partnership({ match }) {
  const p = match.partnership || {};
  const bats = [match.player1, match.player2].filter((x) => x?.name);
  const total = bats.reduce((a, b) => a + (b.runs || 0), 0) || 1;
  return (
    <LightStage>
      <Card title="PARTNERSHIP" className="sp-ps">
        <div className="sp-ps-total"><b>{p.runs ?? 0}</b><span>RUNS FROM {p.balls ?? 0} BALLS</span></div>
        <div className="sp-ps-stack">
          {bats.map((b, i) => <div key={i} className={`sp-ps-seg sp-ps-seg-${i}`} style={{ flexGrow: Math.max(1, b.runs || 0) / total }} />)}
        </div>
        <div className="sp-ps-names">
          {bats.map((b, i) => (
            <div key={i} className={`sp-ps-bat sp-ps-bat-${i}`}><i /><span>{upper(b.name)}</span><b>{b.runs ?? 0}</b><em>({b.balls ?? 0})</em></div>
          ))}
        </div>
      </Card>
    </LightStage>
  );
}

/* ── Squad: clean two-column list ──────────────────────────────── */
function Squad({ match, getAbsoluteUrl }) {
  const { teamName, teamLogo, players } = squadInfo(match, getAbsoluteUrl);
  const half = Math.ceil(players.length / 2);
  const col = (list, start) => (
    <div className="sp-sq-col">
      {list.map((p, i) => (
        <div key={i} className="sp-sq-row" style={{ animationDelay: `${(start + i) * 50}ms` }}>
          <span className="sp-sq-no">{start + i + 1}</span>
          <span className="sp-sq-name">{upper(p.name)}{roleLabel(p.role) === "WICKET KEEPER" && <em>†</em>}</span>
          <span className="sp-sq-role">{roleLabel(p.role)}</span>
        </div>
      ))}
    </div>
  );
  return (
    <LightStage>
      <div className="sp-sq-head">
        <Logo src={teamLogo} name={teamName} className="sp-sum-logo sp-sq-logo" />
        <div>
          <div className="sp-eyebrow">PLAYING XI{match.tournamentName ? ` • ${upper(match.tournamentName)}` : ""}</div>
          <div className="sp-sq-team" style={fit(teamName, 100, 20)}>{upper(teamName, "TEAM")}</div>
        </div>
      </div>
      {players.length === 0 ? <div className="sp-empty">No squad added for this team yet.</div> : (
        <div className="sp-sq-cols">{col(players.slice(0, half), 0)}{col(players.slice(half), half)}</div>
      )}
    </LightStage>
  );
}

/* ── Points table ──────────────────────────────────────────────── */
function PointsTable({ match, pointsTable, hasTournament, getAbsoluteUrl }) {
  const groups = pointsTable?.groups || [];
  const g = groups[useRotate(groups.length)];
  const message = pointsTableMessage(pointsTable, hasTournament, g);
  const rows = (g?.rows || []).slice(0, 10);
  return (
    <LightStage className={rows.length > 7 ? "sp-pt-dense" : ""}>
      <div className="sp-eyebrow sp-pt-eyebrow">{upper(match.tournamentName, "STANDINGS")}</div>
      {message ? <div className="sp-empty">{message}</div> : (
        <Card title={`POINTS TABLE${groups.length > 1 ? ` — ${upper(g.name)}` : ""}`} className="sp-pt">
          <div className="sp-pt-row sp-pt-head"><span>POS</span><span className="sp-pt-team">TEAM</span><span>P</span><span>W</span><span>L</span><span>NR</span><span>NRR</span><span>PTS</span></div>
          {rows.map((r, i) => (
            <div key={r.teamId} className={`sp-pt-row ${r.inQualifyingPosition ? "is-q" : ""} ${r.eliminated ? "is-out" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
              <span className="sp-pt-pos">{r.position}</span>
              <span className="sp-pt-team"><Logo src={getAbsoluteUrl(r.logo || pointsTable.teams?.[r.teamId]?.logo || "")} name={r.name} className="sp-pt-logo" />{upper(r.name)}{r.qualified && <em>Q</em>}</span>
              <span>{r.played}</span><span>{r.won}</span><span>{r.lost}</span><span>{(r.tied || 0) + (r.noResult || 0)}</span>
              <span className={r.nrr < 0 ? "sp-neg" : "sp-pos"}>{r.nrrDisplay}</span>
              <span className="sp-pt-pts">{r.points}</span>
            </div>
          ))}
        </Card>
      )}
    </LightStage>
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
    <LightStage>
      <div className="sp-eyebrow sp-pt-eyebrow">{upper(match.tournamentName, "TOURNAMENT")}</div>
      {!leader ? <div className="sp-empty">No completed-match statistics yet.</div> : (
        <>
          <Card title={isRuns ? "LEADING RUN SCORERS" : "LEADING WICKET TAKERS"} className="sp-ld">
            {top.map((r, i) => (
              <div key={r.name + i} className="sp-ld-row" style={{ animationDelay: `${i * 80}ms` }}>
                <span className="sp-ld-rank">{r.rank}{r.tied ? "=" : ""}</span>
                <span className="sp-ld-who"><b>{upper(r.name)}</b><small>{upper(r.team)}</small></span>
                <span className="sp-ld-bar"><i style={{ width: `${(val(r) / max) * 100}%` }} /></span>
                <span className="sp-ld-val">{val(r)}</span>
              </div>
            ))}
          </Card>
          <div className="sp-ld-hero">
            <Logo src={photo ? getAbsoluteUrl(photo) : ""} name={leader.name} className="sp-ld-photo" />
            <div className="sp-ld-hero-bar"><span>{upper(leader.name)}</span><b>{val(leader)} {isRuns ? "RUNS" : "WKTS"}</b></div>
          </div>
        </>
      )}
    </LightStage>
  );
}

/* ── Lower thirds ──────────────────────────────────────────────── */
function LastOut({ match }) {
  return (
    <div className="sp-lt">
      <span className="sp-lt-tag">WICKET</span>
      <span className="sp-lt-main">{upper(match.lastWicketName)}</span>
      <span className="sp-lt-side">{match.lastWicketRuns ?? 0} ({match.lastWicketBalls ?? 0}) &nbsp; {match.lastWicketDismissal || "out"}</span>
    </div>
  );
}
function CustomText({ match }) {
  return (
    <div className="sp-lt sp-lt-custom">
      <span className="sp-lt-tag">INFO</span>
      <span className="sp-lt-main">{match.customText}</span>
    </div>
  );
}

export default {
  Versus, Toss, Winner, Summary, MatchSituation: Chase, NeedRun: Chase, Potm, Partnership,
  Squad, PointsTable, Leaders, LastOut, CustomText,
};
