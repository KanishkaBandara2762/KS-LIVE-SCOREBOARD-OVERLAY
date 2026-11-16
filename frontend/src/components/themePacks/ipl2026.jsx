import React from "react";
import "./ipl2026.css";
import { upper, fit, Logo, Stage, tossInfo, chaseInfo, squadInfo, roleLabel, findPlayerPhoto, useRotate, pointsTableMessage } from "./common";

/* ================================================================
   IPL_2026 theme pack — festive green stripes, red panels,
   orange capsules with yellow borders, cyan accents. Rounded "pill" shapes.
   Colours from IPL2026Theme.css (#0a8d2e, #d80000, #ff6400, #f3c400, #00c7ff).
   ================================================================ */

const FestBg = () => (
  <>
    <div className="i6-bg" />
    <div className="i6-stripes" />
    <div className="i6-glow" />
  </>
);

const FestStage = ({ hiding, className = "", children }) => (
  <Stage canvasClass={`i6-canvas ${className}`} hiding={hiding} background={<FestBg />}>{children}</Stage>
);

const Capsule = ({ children, className = "", style }) => <div className={`i6-capsule ${className}`} style={style}>{children}</div>;

/* ── Versus ────────────────────────────────────────────────────── */
function Versus({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  const side = (name, logo, cls) => (
    <div className={`i6-vs-side ${cls}`}>
      <div className="i6-vs-disc"><Logo src={getAbsoluteUrl(logo)} name={name} className="i6-vs-logo" /></div>
      <div className="i6-pill i6-vs-name" style={fit(name, 60, 14)}>{upper(name)}</div>
    </div>
  );
  return (
    <FestStage hiding={hiding}>
      <Capsule className="i6-top">{upper(match.tournamentName || match.matchTitle, "IPL 2026")}</Capsule>
      {side(match.battingTeam || "TEAM A", match.battingLogo, "i6-vs-a")}
      {side(match.bowlingTeam || "TEAM B", match.leagueLogo, "i6-vs-b")}
      <Capsule className="i6-vs-mid">VS</Capsule>
      <div className="i6-vs-meta">
        {match.matchNumber ? <span className="i6-tag">MATCH {match.matchNumber}</span> : null}
        {match.venueName ? <span className="i6-tag i6-tag-cyan">{upper(match.venueName)}</span> : null}
      </div>
      {toss.known && <div className="i6-pill i6-pill-red i6-vs-toss">{toss.line}</div>}
    </FestStage>
  );
}

/* ── Toss ──────────────────────────────────────────────────────── */
function Toss({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  return (
    <FestStage hiding={hiding}>
      <Capsule className="i6-top i6-big">TOSS TIME</Capsule>
      {toss.known ? (
        <>
          <div className="i6-toss-disc"><Logo src={getAbsoluteUrl(toss.winnerLogo)} name={toss.winner} className="i6-vs-logo" /></div>
          <div className="i6-toss-name" style={fit(toss.winner, 110, 14)}>{upper(toss.winner)}</div>
          <div className="i6-pill i6-pill-red i6-toss-call">WON THE TOSS &amp; CHOSE TO <b>{toss.decision}</b></div>
        </>
      ) : <div className="i6-empty">Toss result not entered yet.</div>}
    </FestStage>
  );
}

/* ── Match won: fireworks burst ────────────────────────────────── */
function Winner({ winnerInfo, getAbsoluteUrl }) {
  if (!winnerInfo) return null;
  return (
    <FestStage>
      <div className="i6-burst" />
      <div className="i6-fireworks">{Array.from({ length: 5 }).map((_, i) => <i key={i} style={{ left: `${10 + i * 20}%`, top: `${15 + (i % 2) * 30}%`, animationDelay: `${i * 0.4}s` }} />)}</div>
      <div className="i6-win-disc"><Logo src={getAbsoluteUrl(winnerInfo.logo)} name={winnerInfo.team} className="i6-vs-logo" /></div>
      <Capsule className="i6-win-cap" style={fit(winnerInfo.team, 96, 14)}>{upper(winnerInfo.team)}</Capsule>
      <div className="i6-win-label">CHAMPIONS OF THE DAY</div>
      <div className="i6-pill i6-pill-red i6-win-text">{upper(winnerInfo.text)}</div>
    </FestStage>
  );
}

/* ── Summary ───────────────────────────────────────────────────── */
function Summary({ match, getAbsoluteUrl, getOvers, isMatchFinished, finalWinnerTeam, finalWinnerText }) {
  const legal = match.legalBallCount ?? match.totalBalls ?? 0;
  const hasFirst = match.isSecondInnings && match.firstInningsScore != null;
  const fow = (match.fallOfWickets || []).slice(-6);
  return (
    <FestStage>
      <Capsule className="i6-top">{isMatchFinished ? "MATCH SUMMARY" : "SCORE SUMMARY"}</Capsule>
      <div className="i6-sum-cards">
        {hasFirst && (
          <div className="i6-sum-card">
            <Logo src={getAbsoluteUrl(match.leagueLogo)} name={match.bowlingTeam} className="i6-sum-logo" />
            <div className="i6-sum-team">{upper(match.bowlingTeam)}</div>
            <div className="i6-sum-score">{match.firstInningsScore}-{match.firstInningsWickets ?? 0}</div>
            <div className="i6-sum-ov">{getOvers(match.firstInningsOvers || 0)} OVERS</div>
          </div>
        )}
        <div className="i6-sum-card is-live">
          <Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="i6-sum-logo" />
          <div className="i6-sum-team">{upper(match.battingTeam)}</div>
          <div className="i6-sum-score">{match.score}-{match.wickets}</div>
          <div className="i6-sum-ov">{getOvers(legal)} OVERS</div>
        </div>
      </div>
      {isMatchFinished && finalWinnerText && <div className="i6-pill i6-pill-red i6-sum-result">{upper(`${finalWinnerTeam || ""} ${finalWinnerText}`.trim())}</div>}
      <div className="i6-sum-strip">
        <div className="i6-box">
          <div className="i6-box-h">BATTERS</div>
          {[match.player1, match.player2].filter((p) => p?.name).map((p, i) => <div key={i} className="i6-kv"><span>{upper(p.name)}{p.onStrike ? " *" : ""}</span><b>{p.runs ?? 0} <small>({p.balls ?? 0})</small></b></div>)}
        </div>
        <div className="i6-box">
          <div className="i6-box-h">BOWLER</div>
          <div className="i6-kv"><span>{upper(match.bowler?.name, "—")}</span><b>{match.bowler?.wickets ?? 0}-{match.bowler?.runs ?? 0} <small>({match.bowler?.overs ?? 0})</small></b></div>
        </div>
        <div className="i6-box">
          <div className="i6-box-h">WICKETS</div>
          <div className="i6-fow">{fow.length === 0 ? <span className="i6-muted">No wickets fallen</span> : fow.map((w, i) => <span key={i} className="i6-fow-chip">{w.score ?? 0}-{w.wicket ?? i + 1}</span>)}</div>
        </div>
      </div>
    </FestStage>
  );
}

/* ── Chase: capsule + ball dots ────────────────────────────────── */
function Chase({ match, getAbsoluteUrl, getOvers }) {
  const c = chaseInfo(match);
  const showDots = c.chasing && c.ballsLeft > 0 && c.ballsLeft <= 60;
  return (
    <FestStage>
      <Capsule className="i6-top">{c.chasing ? `TARGET ${c.target}` : upper(match.tournamentName, "LIVE")}</Capsule>
      <div className="i6-ch-head">
        <div className="i6-ch-disc"><Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="i6-vs-logo" /></div>
        <div className="i6-ch-name" style={fit(match.battingTeam, 80, 18)}>{upper(match.battingTeam)}</div>
      </div>
      <Capsule className="i6-ch-cap">
        {c.chasing ? (c.runsNeeded > 0 ? <>NEED <b>{c.runsNeeded}</b> OFF <b>{c.ballsLeft}</b></> : <>{upper(match.battingTeam)} WIN!</>)
          : <><b>{match.score}/{match.wickets}</b> AFTER <b>{getOvers(c.legal)}</b> OV</>}
      </Capsule>
      {showDots && (
        <div className="i6-dots" style={{ gridTemplateColumns: `repeat(${Math.min(c.ballsLeft, 20)}, 1fr)` }}>
          {Array.from({ length: c.ballsLeft }).map((_, i) => <i key={i} />)}
        </div>
      )}
      <div className="i6-ch-pills">
        <div className="i6-pill"><span>CRR</span><b>{c.crr}</b></div>
        {c.chasing ? <div className="i6-pill i6-pill-red"><span>RRR</span><b>{c.rrr}</b></div> : <div className="i6-pill i6-pill-red"><span>PROJECTED</span><b>{Math.round(Number(c.crr) * (match.maxOvers || 20))}</b></div>}
        <div className="i6-pill i6-pill-cyan"><span>WKTS LEFT</span><b>{Math.max(0, 10 - (match.wickets || 0))}</b></div>
      </div>
    </FestStage>
  );
}

/* ── Player of the match ───────────────────────────────────────── */
function Potm({ match, getAbsoluteUrl }) {
  return (
    <FestStage>
      <div className="i6-burst i6-burst-left" />
      <div className="i6-potm-disc"><Logo src={match.potmPhoto ? getAbsoluteUrl(match.potmPhoto) : ""} name={match.potmName} className="i6-potm-photo" /></div>
      <div className="i6-potm-info">
        <Capsule className="i6-inline">PLAYER OF THE MATCH</Capsule>
        <div className="i6-potm-name" style={fit(match.potmName, 130, 12)}>{upper(match.potmName)}</div>
        {match.potmTeam && <div className="i6-tag i6-tag-cyan i6-potm-team">{upper(match.potmTeam)}</div>}
        {match.potmFigures && <div className="i6-pill i6-pill-red i6-potm-figs">{upper(match.potmFigures)}</div>}
      </div>
    </FestStage>
  );
}

/* ── Partnership ───────────────────────────────────────────────── */
function Partnership({ match }) {
  const p = match.partnership || {};
  const bats = [match.player1, match.player2].filter((x) => x?.name);
  return (
    <FestStage>
      <Capsule className="i6-top">PARTNERSHIP</Capsule>
      <div className="i6-ps-ball"><b>{p.runs ?? 0}</b><span>{p.balls ?? 0} BALLS</span></div>
      <div className="i6-ps-row">
        {bats.map((b, i) => (
          <div key={i} className={`i6-pill ${i ? "i6-pill-red" : ""} i6-ps-bat`}>
            <span>{upper(b.name)}</span><b>{b.runs ?? 0}<small> ({b.balls ?? 0})</small></b>
          </div>
        ))}
      </div>
    </FestStage>
  );
}

/* ── Squad ─────────────────────────────────────────────────────── */
function Squad({ match, getAbsoluteUrl }) {
  const { teamName, teamLogo, players } = squadInfo(match, getAbsoluteUrl);
  const half = Math.ceil(players.length / 2);
  const col = (list, start) => (
    <div className="i6-sq-col">
      {list.map((p, i) => (
        <div key={i} className="i6-sq-pill" style={{ animationDelay: `${(start + i) * 55}ms` }}>
          <span className="i6-sq-no">{p.jerseyNumber ?? start + i + 1}</span>
          <span className="i6-sq-name">{upper(p.name)}</span>
          <span className="i6-sq-role">{roleLabel(p.role)}</span>
        </div>
      ))}
    </div>
  );
  return (
    <FestStage>
      <div className="i6-sq-head">
        <div className="i6-sq-disc"><Logo src={teamLogo} name={teamName} className="i6-vs-logo" /></div>
        <Capsule className="i6-inline" style={fit(teamName, 64, 18)}>{upper(teamName, "TEAM")}</Capsule>
      </div>
      {players.length === 0 ? <div className="i6-empty">No squad added for this team yet.</div> : (
        <div className="i6-sq-cols">{col(players.slice(0, half), 0)}{col(players.slice(half), half)}</div>
      )}
    </FestStage>
  );
}

/* ── Points table ──────────────────────────────────────────────── */
function PointsTable({ match, pointsTable, hasTournament, getAbsoluteUrl }) {
  const groups = pointsTable?.groups || [];
  const g = groups[useRotate(groups.length)];
  const message = pointsTableMessage(pointsTable, hasTournament, g);
  const rows = (g?.rows || []).slice(0, 10);
  return (
    <FestStage className={rows.length > 7 ? "i6-pt-dense" : ""}>
      <Capsule className="i6-top">POINTS TABLE{g && groups.length > 1 ? ` • ${upper(g.name)}` : ""}</Capsule>
      {message ? <div className="i6-empty">{message}</div> : (
        <div className="i6-pt" key={g.groupId}>
          <div className="i6-pt-row i6-pt-head"><span /><span className="i6-pt-team">TEAM</span><span>P</span><span>W</span><span>L</span><span>NR</span><span>NRR</span><span>PTS</span></div>
          {rows.map((r, i) => (
            <div key={r.teamId} className={`i6-pt-row ${r.inQualifyingPosition ? "is-q" : ""} ${r.eliminated ? "is-out" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
              <span className="i6-pt-pos">{r.position}</span>
              <span className="i6-pt-team"><Logo src={getAbsoluteUrl(r.logo || pointsTable.teams?.[r.teamId]?.logo || "")} name={r.name} className="i6-pt-logo" />{upper(r.name)}{r.qualified && <em>Q</em>}</span>
              <span>{r.played}</span><span>{r.won}</span><span>{r.lost}</span><span>{(r.tied || 0) + (r.noResult || 0)}</span>
              <span>{r.nrrDisplay}</span>
              <span className="i6-pt-pts">{r.points}</span>
            </div>
          ))}
        </div>
      )}
      <div className="i6-pt-sub">{upper(match.tournamentName)}</div>
    </FestStage>
  );
}

/* ── Leaders: podium ───────────────────────────────────────────── */
function Leaders({ match, rows = [], kind = "runs", getAbsoluteUrl }) {
  const isRuns = kind === "runs";
  const top = rows.slice(0, 5);
  const val = (r) => (isRuns ? r.runs : r.wickets);
  const unit = isRuns ? "RUNS" : "WKTS";
  const order = [top[1], top[0], top[2]];
  return (
    <FestStage>
      <Capsule className="i6-top">{isRuns ? "TOP RUN SCORERS" : "TOP WICKET TAKERS"}</Capsule>
      {!top[0] ? <div className="i6-empty">No completed-match statistics yet.</div> : (
        <>
          <div className="i6-podium">
            {order.map((r, i) => r && (
              <div key={r.name + i} className={`i6-pod i6-pod-${i}`}>
                <Logo src={findPlayerPhoto(match, r.name) ? getAbsoluteUrl(findPlayerPhoto(match, r.name)) : ""} name={r.name} className="i6-pod-photo" />
                <div className="i6-pod-name">{upper(r.name)}</div>
                <div className="i6-pod-team">{upper(r.team)}</div>
                <div className="i6-pod-block"><span>{r.rank}</span><b>{val(r)} <small>{unit}</small></b></div>
              </div>
            ))}
          </div>
          {top.length > 3 && (
            <div className="i6-ld-rest">
              {top.slice(3).map((r, i) => (
                <div key={r.name + i} className="i6-pill"><span>{r.rank}. {upper(r.name)}</span><b>{val(r)} <small>{unit}</small></b></div>
              ))}
            </div>
          )}
        </>
      )}
    </FestStage>
  );
}

/* ── Lower thirds ──────────────────────────────────────────────── */
function LastOut({ match }) {
  return (
    <div className="i6-lt">
      <span className="i6-lt-tag">OUT!</span>
      <span className="i6-lt-main">{upper(match.lastWicketName)}</span>
      <span className="i6-lt-side">{match.lastWicketRuns ?? 0} ({match.lastWicketBalls ?? 0}) • {upper(match.lastWicketDismissal, "OUT")}</span>
    </div>
  );
}
function CustomText({ match }) {
  return (
    <div className="i6-lt i6-lt-custom">
      <span className="i6-lt-main">{match.customText}</span>
    </div>
  );
}

export default {
  Versus, Toss, Winner, Summary, MatchSituation: Chase, NeedRun: Chase, Potm, Partnership,
  Squad, PointsTable, Leaders, LastOut, CustomText,
};
