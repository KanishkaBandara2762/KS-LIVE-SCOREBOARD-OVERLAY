import React from "react";
import "./lightning.css";
import { upper, fit, Logo, Stage, tossInfo, chaseInfo, squadInfo, roleLabel, findPlayerPhoto, useRotate, pointsTableMessage } from "./common";

/* ================================================================
   LIGHTNING_BAR / ABUDHABI_T10 theme pack.
   Built from the lightning bar itself: navy #05091D, royal blue #2f5be0,
   yellow #cdb21f and gold outline #C6A12B, white lightning-bolt panels,
   Roboto Slab numbers + Barlow text.
   ================================================================ */

const NavyBg = () => (
  <>
    <div className="lb-bg" />
    <div className="lb-edge lb-edge-l" />
    <div className="lb-edge lb-edge-r" />
    <svg className="lb-bolts" viewBox="0 0 1920 1080" preserveAspectRatio="none">
      <polyline points="0,180 420,120 360,260 900,160" />
      <polyline points="1920,900 1500,960 1560,820 1020,920" />
    </svg>
  </>
);

const NavyStage = ({ hiding, className = "", children }) => (
  <Stage canvasClass={`lb-canvas ${className}`} hiding={hiding} background={<NavyBg />}>{children}</Stage>
);

/** White lightning-bolt panel with gold outline (same shape as the bar's centre). */
const Bolt = ({ className = "", children, style }) => (
  <div className={`lb-bolt ${className}`} style={style}>
    <svg viewBox="0 0 520 135" preserveAspectRatio="none" className="lb-bolt-svg">
      <polygon points="50,3 470,3 440,50 510,40 446,92 470,132 50,132 74,92 10,40 80,50" fill="#fff" />
      <polygon points="50,3 470,3 440,50 510,40 446,92 470,132 50,132 74,92 10,40 80,50" fill="none" stroke="#C6A12B" strokeWidth="4" vectorEffect="non-scaling-stroke" />
    </svg>
    <div className="lb-bolt-in">{children}</div>
  </div>
);

const TeamBox = ({ src, name, side, getAbsoluteUrl, className = "" }) => (
  <div className={`lb-tbox lb-tbox-${side} ${className}`}><Logo src={getAbsoluteUrl(src)} name={name} className="lb-tbox-img" /></div>
);

/* ── Versus ────────────────────────────────────────────────────── */
function Versus({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  return (
    <NavyStage hiding={hiding}>
      <div className="lb-kicker lb-top">{upper(match.tournamentName || match.matchTitle, "LIVE CRICKET")}</div>
      <TeamBox src={match.battingLogo} name={match.battingTeam} side="blue" getAbsoluteUrl={getAbsoluteUrl} className="lb-vs-l" />
      <TeamBox src={match.leagueLogo} name={match.bowlingTeam} side="gold" getAbsoluteUrl={getAbsoluteUrl} className="lb-vs-r" />
      <Bolt className="lb-vs-bolt">
        <div className="lb-vs-names">
          <span style={fit(match.battingTeam, 60, 12)}>{upper(match.battingTeam, "TEAM A")}</span>
          <b>VS</b>
          <span style={fit(match.bowlingTeam, 60, 12)}>{upper(match.bowlingTeam, "TEAM B")}</span>
        </div>
      </Bolt>
      <div className="lb-strip lb-vs-strip">
        {toss.known ? toss.line : [match.matchNumber ? `MATCH ${match.matchNumber}` : "", upper(match.venueName), upper(match.matchDate)].filter(Boolean).join("  •  ") || "LIVE MATCH"}
      </div>
    </NavyStage>
  );
}

/* ── Toss ──────────────────────────────────────────────────────── */
function Toss({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  return (
    <NavyStage hiding={hiding}>
      <div className="lb-slab lb-title">TOSS</div>
      {toss.known ? (
        <>
          <TeamBox src={toss.winnerLogo} name={toss.winner} side="blue" getAbsoluteUrl={getAbsoluteUrl} className="lb-toss-box" />
          <Bolt className="lb-toss-bolt">
            <div className="lb-toss-label">WON THE TOSS</div>
            <div className="lb-toss-name" style={fit(toss.winner, 84, 14)}>{upper(toss.winner)}</div>
          </Bolt>
          <div className="lb-strip lb-strip-gold lb-toss-dec">ELECTED TO {toss.decision} FIRST</div>
        </>
      ) : <div className="lb-empty">Toss result not entered yet.</div>}
    </NavyStage>
  );
}

/* ── Match won ─────────────────────────────────────────────────── */
function Winner({ match, winnerInfo, getAbsoluteUrl }) {
  if (!winnerInfo) return null;
  return (
    <NavyStage className="lb-winner">
      <div className="lb-flash" />
      <div className="lb-kicker lb-top">{upper(match.tournamentName, "MATCH RESULT")}</div>
      <TeamBox src={winnerInfo.logo} name={winnerInfo.team} side="gold" getAbsoluteUrl={getAbsoluteUrl} className="lb-win-box" />
      <div className="lb-slab lb-win-label">WINNERS</div>
      <Bolt className="lb-win-bolt"><div className="lb-win-team" style={fit(winnerInfo.team, 110, 13)}>{upper(winnerInfo.team)}</div></Bolt>
      <div className="lb-strip lb-win-text">{upper(winnerInfo.text)}</div>
    </NavyStage>
  );
}

/* ── Summary ───────────────────────────────────────────────────── */
function Summary({ match, getAbsoluteUrl, getOvers, isMatchFinished, finalWinnerTeam, finalWinnerText }) {
  const legal = match.legalBallCount ?? match.totalBalls ?? 0;
  const hasFirst = match.isSecondInnings && match.firstInningsScore != null;
  const fow = (match.fallOfWickets || []).slice(-6);
  const short = (t) => upper(t).slice(0, 3);
  return (
    <NavyStage>
      <div className="lb-kicker lb-top">{isMatchFinished ? "MATCH SUMMARY" : "INNINGS SUMMARY"}  •  {upper(match.tournamentName, "LIVE")}</div>
      <Bolt className="lb-sum-bolt">
        <div className="lb-sum-scores">
          {hasFirst && <div><span>{short(match.bowlingTeam)}</span><b>{match.firstInningsScore}-{match.firstInningsWickets ?? 0}</b><em>{getOvers(match.firstInningsOvers || 0)} OV</em></div>}
          <div className="is-live"><span>{short(match.battingTeam)}</span><b>{match.score}-{match.wickets}</b><em>{getOvers(legal)} OV</em></div>
        </div>
      </Bolt>
      {isMatchFinished && finalWinnerText && <div className="lb-strip lb-strip-gold lb-sum-result">{upper(`${finalWinnerTeam || ""} ${finalWinnerText}`.trim())}</div>}
      <div className="lb-sum-cols">
        <div className="lb-panel">
          <div className="lb-panel-h">BATTING</div>
          {[match.player1, match.player2].filter((p) => p?.name).map((p, i) => <div key={i} className="lb-row"><span>{upper(p.name)}{p.onStrike ? " ★" : ""}</span><b>{p.runs ?? 0}</b><em>{p.balls ?? 0}</em></div>)}
        </div>
        <div className="lb-panel">
          <div className="lb-panel-h">BOWLING</div>
          <div className="lb-row"><span>{upper(match.bowler?.name, "—")}</span><b>{match.bowler?.wickets ?? 0}-{match.bowler?.runs ?? 0}</b><em>{match.bowler?.overs ?? 0}</em></div>
          {match.isSecondInnings && match.targetScore > 0 && <div className="lb-row"><span>TARGET</span><b>{match.targetScore}</b><em /></div>}
        </div>
        <div className="lb-panel">
          <div className="lb-panel-h lb-panel-h-gold">FALL OF WICKETS</div>
          {fow.length === 0 ? <div className="lb-muted">No wickets fallen</div> : fow.map((w, i) => <div key={i} className="lb-row"><span>{upper(w.playerName || w.name, "BATTER")}</span><b>{w.score ?? 0}-{w.wicket ?? i + 1}</b><em>{w.overAtFall || "0.0"}</em></div>)}
        </div>
      </div>
    </NavyStage>
  );
}

/* ── Chase / need run ──────────────────────────────────────────── */
function Chase({ match, getAbsoluteUrl, getOvers }) {
  const c = chaseInfo(match);
  const tiles = c.chasing
    ? [["TARGET", c.target, "blue"], ["REQ. RATE", c.rrr, "gold"], ["RUN RATE", c.crr, "blue"], ["WKTS LEFT", Math.max(0, 10 - (match.wickets || 0)), "gold"]]
    : [["OVERS", `${getOvers(c.legal)}/${match.maxOvers || 20}`, "blue"], ["RUN RATE", c.crr, "gold"], ["PROJECTED", Math.round(Number(c.crr) * (match.maxOvers || 20)), "blue"], ["WKTS LEFT", Math.max(0, 10 - (match.wickets || 0)), "gold"]];
  return (
    <NavyStage>
      <div className="lb-kicker lb-top">{c.chasing ? "THE CHASE" : "MATCH SITUATION"}  •  {upper(match.battingTeam)}</div>
      <TeamBox src={match.battingLogo} name={match.battingTeam} side="blue" getAbsoluteUrl={getAbsoluteUrl} className="lb-ch-box" />
      <Bolt className="lb-ch-bolt">
        <div className="lb-ch-line">
          {c.chasing
            ? (c.runsNeeded > 0 ? <>NEED <b>{c.runsNeeded}</b> FROM <b>{c.ballsLeft}</b></> : <><b>{upper(match.battingTeam)}</b> WON</>)
            : <><b>{match.score}-{match.wickets}</b> IN <b>{getOvers(c.legal)}</b> OV</>}
        </div>
        {c.chasing && c.runsNeeded > 0 && <div className="lb-ch-sub">RUNS • BALLS</div>}
      </Bolt>
      <div className="lb-tiles">
        {tiles.map(([k, v, tone]) => <div key={k} className={`lb-tile lb-tile-${tone}`}><span>{k}</span><b>{v}</b></div>)}
      </div>
    </NavyStage>
  );
}

/* ── Player of the match ───────────────────────────────────────── */
function Potm({ match, getAbsoluteUrl }) {
  return (
    <NavyStage>
      <div className="lb-potm-photo-box"><Logo src={match.potmPhoto ? getAbsoluteUrl(match.potmPhoto) : ""} name={match.potmName} className="lb-potm-photo" /></div>
      <div className="lb-kicker lb-potm-kicker">PLAYER OF THE MATCH</div>
      <Bolt className="lb-potm-bolt"><div className="lb-potm-name" style={fit(match.potmName, 90, 13)}>{upper(match.potmName)}</div></Bolt>
      {match.potmTeam && <div className="lb-potm-team">{upper(match.potmTeam)}</div>}
      {match.potmFigures && <div className="lb-strip lb-strip-gold lb-potm-figs">{upper(match.potmFigures)}</div>}
    </NavyStage>
  );
}

/* ── Partnership ───────────────────────────────────────────────── */
function Partnership({ match }) {
  const p = match.partnership || {};
  const bats = [match.player1, match.player2].filter((x) => x?.name);
  return (
    <NavyStage>
      <div className="lb-slab lb-title">PARTNERSHIP</div>
      <Bolt className="lb-ps-bolt"><div className="lb-ps-num">{p.runs ?? 0}<small> RUNS</small></div><div className="lb-ps-balls">{p.balls ?? 0} BALLS</div></Bolt>
      <div className="lb-ps-bats">
        {bats.map((b, i) => (
          <div key={i} className={`lb-ps-bat ${i ? "is-gold" : ""}`}><span>{upper(b.name)}</span><b>{b.runs ?? 0}<small> ({b.balls ?? 0})</small></b></div>
        ))}
      </div>
    </NavyStage>
  );
}

/* ── Squad ─────────────────────────────────────────────────────── */
function Squad({ match, getAbsoluteUrl }) {
  const { teamName, teamLogo, players } = squadInfo(match, getAbsoluteUrl);
  return (
    <NavyStage>
      <div className="lb-sq-head">
        <div className="lb-tbox lb-tbox-blue lb-sq-box"><Logo src={teamLogo} name={teamName} className="lb-tbox-img" /></div>
        <div>
          <div className="lb-kicker">PLAYING SQUAD</div>
          <div className="lb-slab lb-sq-team" style={fit(teamName, 90, 18)}>{upper(teamName, "TEAM")}</div>
        </div>
      </div>
      {players.length === 0 ? <div className="lb-empty">No squad added for this team yet.</div> : (
        <div className="lb-sq-grid">
          {players.map((p, i) => (
            <div key={i} className="lb-sq-card" style={{ animationDelay: `${i * 50}ms` }}>
              <span className="lb-sq-no">{i + 1}</span>
              <span className="lb-sq-name">{upper(p.name)}</span>
              <span className="lb-sq-role">{roleLabel(p.role)}</span>
            </div>
          ))}
        </div>
      )}
    </NavyStage>
  );
}

/* ── Points table ──────────────────────────────────────────────── */
function PointsTable({ match, pointsTable, hasTournament, getAbsoluteUrl }) {
  const groups = pointsTable?.groups || [];
  const g = groups[useRotate(groups.length)];
  const message = pointsTableMessage(pointsTable, hasTournament, g);
  const rows = (g?.rows || []).slice(0, 10);
  return (
    <NavyStage className={rows.length > 7 ? "lb-pt-dense" : ""}>
      <Bolt className="lb-pt-bolt"><div className="lb-pt-title">POINTS TABLE{g && groups.length > 1 ? ` • ${upper(g.name)}` : ""}</div></Bolt>
      <div className="lb-kicker lb-pt-kicker">{upper(match.tournamentName, "STANDINGS")}</div>
      {message ? <div className="lb-empty">{message}</div> : (
        <div className="lb-pt" key={g.groupId}>
          <div className="lb-pt-row lb-pt-head"><span>#</span><span className="lb-pt-team">TEAM</span><span>P</span><span>W</span><span>L</span><span>NR</span><span>NRR</span><span>PTS</span></div>
          {rows.map((r, i) => (
            <div key={r.teamId} className={`lb-pt-row ${r.inQualifyingPosition ? "is-q" : ""} ${r.eliminated ? "is-out" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
              <span className="lb-pt-pos">{r.position}</span>
              <span className="lb-pt-team"><Logo src={getAbsoluteUrl(r.logo || pointsTable.teams?.[r.teamId]?.logo || "")} name={r.name} className="lb-pt-logo" />{upper(r.name)}{r.qualified && <em>Q</em>}</span>
              <span>{r.played}</span><span>{r.won}</span><span>{r.lost}</span><span>{(r.tied || 0) + (r.noResult || 0)}</span>
              <span>{r.nrrDisplay}</span>
              <span className="lb-pt-pts">{r.points}</span>
            </div>
          ))}
        </div>
      )}
    </NavyStage>
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
    <NavyStage>
      <div className="lb-kicker lb-top">{isRuns ? "MOST RUNS" : "MOST WICKETS"}  •  {upper(match.tournamentName, "TOURNAMENT")}</div>
      {!leader ? <div className="lb-empty">No completed-match statistics yet.</div> : (
        <>
          <div className="lb-tbox lb-tbox-gold lb-ld-photo-box"><Logo src={photo ? getAbsoluteUrl(photo) : ""} name={leader.name} className="lb-tbox-img lb-ld-photo" /></div>
          <Bolt className="lb-ld-bolt">
            <div className="lb-ld-hero"><span style={fit(leader.name, 60, 14)}>{upper(leader.name)}</span><b>{val(leader)}<small> {isRuns ? "RUNS" : "WKTS"}</small></b></div>
          </Bolt>
          <div className="lb-ld-list">
            {top.slice(1).map((r, i) => (
              <div key={r.name + i} className="lb-ld-row" style={{ animationDelay: `${i * 80}ms` }}>
                <span className="lb-ld-rank">{r.rank}</span>
                <span className="lb-ld-name"><b style={fit(r.name, 46, 11)}>{upper(r.name)}</b><small>{upper(r.team)}</small></span>
                <span className="lb-ld-val">{val(r)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </NavyStage>
  );
}

/* ── Lower thirds ──────────────────────────────────────────────── */
function LastOut({ match }) {
  return (
    <div className="lb-lt">
      <span className="lb-lt-tag">OUT</span>
      <span className="lb-lt-main">{upper(match.lastWicketName)}</span>
      <span className="lb-lt-side">{match.lastWicketRuns ?? 0} ({match.lastWicketBalls ?? 0}) • {upper(match.lastWicketDismissal, "OUT")}</span>
    </div>
  );
}
function CustomText({ match }) {
  return (
    <div className="lb-lt lb-lt-custom">
      <span className="lb-lt-tag">⚡</span>
      <span className="lb-lt-main">{match.customText}</span>
    </div>
  );
}

export default {
  Versus, Toss, Winner, Summary, MatchSituation: Chase, NeedRun: Chase, Potm, Partnership,
  Squad, PointsTable, Leaders, LastOut, CustomText,
};
