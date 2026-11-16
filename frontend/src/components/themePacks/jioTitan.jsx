import React from "react";
import "./jioTitan.css";
import { upper, fit, Logo, Stage, tossInfo, chaseInfo, squadInfo, roleLabel, findPlayerPhoto, useRotate, pointsTableMessage } from "./common";

/* ================================================================
   JIO_TITAN theme pack — royal purple + gold (#ffd700), with violet
   (#c084fc) and sky (#38bdf8) accents. Everything is built on circles:
   gold rings, orbiting medallions, round score badges and avatars.
   ================================================================ */

const RoyalBg = () => (
  <>
    <div className="jt-bg" />
    <div className="jt-orbit jt-o1" /><div className="jt-orbit jt-o2" /><div className="jt-orbit jt-o3" />
    <div className="jt-stars" />
  </>
);
const RoyalStage = ({ hiding, className = "", children }) => (
  <Stage canvasClass={`jt-canvas ${className}`} hiding={hiding} background={<RoyalBg />}>{children}</Stage>
);
const Medal = ({ src, name, className = "", getAbsoluteUrl }) => (
  <div className={`jt-medal ${className}`}><div className="jt-medal-ring" /><Logo src={getAbsoluteUrl(src)} name={name} className="jt-medal-img" /></div>
);
const Pill = ({ children, className = "" }) => <div className={`jt-pill ${className}`}>{children}</div>;

/* ── Versus ────────────────────────────────────────────────────── */
function Versus({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  return (
    <RoyalStage hiding={hiding}>
      <div className="jt-kicker jt-top">{upper(match.tournamentName || match.matchTitle, "PREMIER LEAGUE")}{match.matchNumber ? `  ✦  MATCH ${match.matchNumber}` : ""}</div>
      <Medal src={match.battingLogo} name={match.battingTeam} getAbsoluteUrl={getAbsoluteUrl} className="jt-vs-a" />
      <Medal src={match.leagueLogo} name={match.bowlingTeam} getAbsoluteUrl={getAbsoluteUrl} className="jt-vs-b" />
      <div className="jt-name jt-vs-na" style={fit(match.battingTeam, 60, 16)}>{upper(match.battingTeam, "TEAM A")}</div>
      <div className="jt-name jt-vs-nb" style={fit(match.bowlingTeam, 60, 16)}>{upper(match.bowlingTeam, "TEAM B")}</div>
      <div className="jt-vs-coin"><div className="jt-vs-dash" /><span>VS</span></div>
      <Pill className="jt-vs-pill">{toss.known ? toss.line : [upper(match.venueName), upper(match.matchDate)].filter(Boolean).join("  ✦  ") || "LIVE"}</Pill>
    </RoyalStage>
  );
}

/* ── Toss ──────────────────────────────────────────────────────── */
function Toss({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  return (
    <RoyalStage hiding={hiding}>
      <div className="jt-gold jt-title">THE TOSS</div>
      {toss.known ? (
        <>
          <div className="jt-coin"><Medal src={toss.winnerLogo} name={toss.winner} getAbsoluteUrl={getAbsoluteUrl} className="jt-coin-medal" /></div>
          <div className="jt-name jt-toss-name" style={fit(toss.winner, 96, 16)}>{upper(toss.winner)}</div>
          <Pill className="jt-toss-pill">WON THE TOSS • CHOSE TO <b>{toss.decision}</b></Pill>
        </>
      ) : <div className="jt-empty">Toss result not entered yet.</div>}
    </RoyalStage>
  );
}

/* ── Match won ─────────────────────────────────────────────────── */
function Winner({ match, winnerInfo, getAbsoluteUrl }) {
  if (!winnerInfo) return null;
  return (
    <RoyalStage className="jt-winner">
      <div className="jt-rays" />
      <div className="jt-kicker jt-top">{upper(match.tournamentName, "MATCH RESULT")}</div>
      <Medal src={winnerInfo.logo} name={winnerInfo.team} getAbsoluteUrl={getAbsoluteUrl} className="jt-win-medal" />
      <div className="jt-gold jt-win-label">CHAMPIONS</div>
      <div className="jt-name jt-win-team" style={fit(winnerInfo.team, 110, 15)}>{upper(winnerInfo.team)}</div>
      <Pill className="jt-win-pill">{upper(winnerInfo.text)}</Pill>
    </RoyalStage>
  );
}

/* ── Summary: round score badges ───────────────────────────────── */
function Summary({ match, getAbsoluteUrl, getOvers, isMatchFinished, finalWinnerTeam, finalWinnerText }) {
  const legal = match.legalBallCount ?? match.totalBalls ?? 0;
  const hasFirst = match.isSecondInnings && match.firstInningsScore != null;
  const fow = (match.fallOfWickets || []).slice(-6);
  const badge = (team, logo, score, overs, live) => (
    <div className={`jt-badge ${live ? "is-live" : ""}`}>
      <Logo src={getAbsoluteUrl(logo)} name={team} className="jt-badge-logo" />
      <b>{score}</b><span>{overs} OV</span>
      <div className="jt-badge-team">{upper(team)}</div>
    </div>
  );
  return (
    <RoyalStage>
      <div className="jt-kicker jt-top">{isMatchFinished ? "MATCH SUMMARY" : "SCORE SUMMARY"}  ✦  {upper(match.tournamentName, "LIVE")}</div>
      <div className="jt-badges">
        {hasFirst && badge(match.bowlingTeam, match.leagueLogo, `${match.firstInningsScore}/${match.firstInningsWickets ?? 0}`, getOvers(match.firstInningsOvers || 0), false)}
        {badge(match.battingTeam, match.battingLogo, `${match.score}/${match.wickets}`, getOvers(legal), true)}
      </div>
      {isMatchFinished && finalWinnerText && <Pill className="jt-sum-result">{upper(`${finalWinnerTeam || ""} ${finalWinnerText}`.trim())}</Pill>}
      <div className="jt-sum-cards">
        <div className="jt-card">
          <div className="jt-card-h">BATTING</div>
          {[match.player1, match.player2].filter((p) => p?.name).map((p, i) => <div key={i} className="jt-row"><span>{upper(p.name)}{p.onStrike ? " ✦" : ""}</span><b>{p.runs ?? 0}</b><em>{p.balls ?? 0}</em></div>)}
        </div>
        <div className="jt-card">
          <div className="jt-card-h">BOWLING</div>
          <div className="jt-row"><span>{upper(match.bowler?.name, "—")}</span><b>{match.bowler?.wickets ?? 0}-{match.bowler?.runs ?? 0}</b><em>{match.bowler?.overs ?? 0}</em></div>
        </div>
        <div className="jt-card">
          <div className="jt-card-h">WICKETS</div>
          {fow.length === 0 ? <div className="jt-muted">No wickets fallen</div> : fow.map((w, i) => <div key={i} className="jt-row"><span>{upper(w.playerName || w.name, "BATTER")}</span><b>{w.score ?? 0}-{w.wicket ?? i + 1}</b><em>{w.overAtFall || "0.0"}</em></div>)}
        </div>
      </div>
    </RoyalStage>
  );
}

/* ── Chase: twin rings (runs and balls) ────────────────────────── */
function Ring({ value, label, part, tone }) {
  const R = 170, C = 2 * Math.PI * R;
  return (
    <div className={`jt-ring jt-ring-${tone}`}>
      <svg viewBox="0 0 400 400" width="400" height="400">
        <circle cx="200" cy="200" r={R} className="jt-ring-track" />
        <circle cx="200" cy="200" r={R} className="jt-ring-fill" strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(1, part)))} />
      </svg>
      <div className="jt-ring-mid"><b>{value}</b><span>{label}</span></div>
    </div>
  );
}
function Chase({ match, getAbsoluteUrl, getOvers }) {
  const c = chaseInfo(match);
  return (
    <RoyalStage>
      <div className="jt-kicker jt-top">{c.chasing ? `TARGET ${c.target}` : "MATCH SITUATION"}  ✦  {upper(match.battingTeam)}</div>
      <Medal src={match.battingLogo} name={match.battingTeam} getAbsoluteUrl={getAbsoluteUrl} className="jt-ch-medal" />
      {c.chasing ? (
        <>
          <Ring value={c.runsNeeded > 0 ? c.runsNeeded : "✓"} label="RUNS NEEDED" part={c.target ? match.score / c.target : 0} tone="gold" />
          <Ring value={c.ballsLeft} label="BALLS LEFT" part={c.totalBalls ? c.ballsLeft / c.totalBalls : 0} tone="sky" />
        </>
      ) : (
        <>
          <Ring value={`${match.score}/${match.wickets}`} label="SCORE" part={c.legal / Math.max(1, c.totalBalls)} tone="gold" />
          <Ring value={getOvers(c.legal)} label={`OF ${match.maxOvers || 20} OVERS`} part={c.legal / Math.max(1, c.totalBalls)} tone="sky" />
        </>
      )}
      <div className="jt-ch-pills">
        <Pill>CRR <b>{c.crr}</b></Pill>
        {c.chasing ? <Pill>RRR <b>{c.rrr}</b></Pill> : <Pill>PROJECTED <b>{Math.round(Number(c.crr) * (match.maxOvers || 20))}</b></Pill>}
        <Pill>WKTS LEFT <b>{Math.max(0, 10 - (match.wickets || 0))}</b></Pill>
      </div>
    </RoyalStage>
  );
}

/* ── Player of the match ───────────────────────────────────────── */
function Potm({ match, getAbsoluteUrl }) {
  return (
    <RoyalStage>
      <div className="jt-rays jt-rays-left" />
      <div className="jt-potm-circle"><div className="jt-medal-ring" /><Logo src={match.potmPhoto ? getAbsoluteUrl(match.potmPhoto) : ""} name={match.potmName} className="jt-potm-img" /></div>
      <div className="jt-potm-info">
        <div className="jt-kicker">✦ PLAYER OF THE MATCH ✦</div>
        <div className="jt-gold jt-potm-name" style={fit(match.potmName, 130, 11)}>{upper(match.potmName)}</div>
        {match.potmTeam && <div className="jt-potm-team">{upper(match.potmTeam)}</div>}
        {match.potmFigures && <Pill className="jt-potm-figs">{upper(match.potmFigures)}</Pill>}
      </div>
    </RoyalStage>
  );
}

/* ── Partnership: two circles joined by a gold line ────────────── */
function Partnership({ match }) {
  const p = match.partnership || {};
  const bats = [match.player1, match.player2].filter((x) => x?.name);
  return (
    <RoyalStage>
      <div className="jt-gold jt-title">PARTNERSHIP</div>
      <div className="jt-ps-line" />
      {bats.map((b, i) => (
        <div key={i} className={`jt-ps-bat jt-ps-bat-${i}`}>
          <div className="jt-ps-circle"><b>{b.runs ?? 0}</b><span>({b.balls ?? 0})</span></div>
          <div className="jt-name jt-ps-name">{upper(b.name)}</div>
        </div>
      ))}
      <div className="jt-ps-total"><div className="jt-medal-ring" /><b>{p.runs ?? 0}</b><span>{p.balls ?? 0} BALLS</span></div>
    </RoyalStage>
  );
}

/* ── Squad: round avatars ──────────────────────────────────────── */
function Squad({ match, getAbsoluteUrl }) {
  const { teamName, teamLogo, players } = squadInfo(match, getAbsoluteUrl);
  return (
    <RoyalStage>
      <div className="jt-sq-head">
        <Medal src={teamLogo} name={teamName} getAbsoluteUrl={(u) => u} className="jt-sq-medal" />
        <div>
          <div className="jt-kicker">✦ PLAYING SQUAD</div>
          <div className="jt-gold jt-sq-team" style={fit(teamName, 96, 18)}>{upper(teamName, "TEAM")}</div>
        </div>
      </div>
      {players.length === 0 ? <div className="jt-empty">No squad added for this team yet.</div> : (
        <div className="jt-sq-grid">
          {players.map((p, i) => (
            <div key={i} className="jt-sq-card" style={{ animationDelay: `${i * 50}ms` }}>
              <Logo src={p.photo ? getAbsoluteUrl(p.photo) : ""} name={p.name} className="jt-sq-avatar" />
              <div className="jt-sq-name">{upper(p.name)}</div>
              <div className="jt-sq-role">{roleLabel(p.role)}</div>
            </div>
          ))}
        </div>
      )}
    </RoyalStage>
  );
}

/* ── Points table ──────────────────────────────────────────────── */
function PointsTable({ match, pointsTable, hasTournament, getAbsoluteUrl }) {
  const groups = pointsTable?.groups || [];
  const g = groups[useRotate(groups.length)];
  const message = pointsTableMessage(pointsTable, hasTournament, g);
  const rows = (g?.rows || []).slice(0, 10);
  return (
    <RoyalStage className={rows.length > 7 ? "jt-pt-dense" : ""}>
      <div className="jt-gold jt-title jt-pt-title">POINTS TABLE</div>
      <div className="jt-kicker jt-pt-sub">{upper(match.tournamentName, "STANDINGS")}{g && groups.length > 1 ? `  ✦  ${upper(g.name)}` : ""}</div>
      {message ? <div className="jt-empty">{message}</div> : (
        <div className="jt-pt" key={g.groupId}>
          <div className="jt-pt-row jt-pt-head"><span /><span className="jt-pt-team">TEAM</span><span>P</span><span>W</span><span>L</span><span>NR</span><span>NRR</span><span>PTS</span></div>
          {rows.map((r, i) => (
            <div key={r.teamId} className={`jt-pt-row ${r.inQualifyingPosition ? "is-q" : ""} ${r.eliminated ? "is-out" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
              <span><b className="jt-pt-pos">{r.position}</b></span>
              <span className="jt-pt-team"><Logo src={getAbsoluteUrl(r.logo || pointsTable.teams?.[r.teamId]?.logo || "")} name={r.name} className="jt-pt-logo" />{upper(r.name)}{r.qualified && <em>Q</em>}</span>
              <span>{r.played}</span><span>{r.won}</span><span>{r.lost}</span><span>{(r.tied || 0) + (r.noResult || 0)}</span>
              <span>{r.nrrDisplay}</span><span className="jt-pt-pts">{r.points}</span>
            </div>
          ))}
        </div>
      )}
    </RoyalStage>
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
    <RoyalStage>
      <div className="jt-gold jt-title jt-pt-title">{isRuns ? "ORANGE CAP" : "PURPLE CAP"}</div>
      <div className="jt-kicker jt-pt-sub">{isRuns ? "MOST RUNS" : "MOST WICKETS"}  ✦  {upper(match.tournamentName, "TOURNAMENT")}</div>
      {!leader ? <div className="jt-empty">No completed-match statistics yet.</div> : (
        <>
          <div className={`jt-ld-hero ${isRuns ? "is-orange" : "is-purple"}`}>
            <div className="jt-potm-circle jt-ld-circle"><div className="jt-medal-ring" /><Logo src={photo ? getAbsoluteUrl(photo) : ""} name={leader.name} className="jt-potm-img" /></div>
            <div className="jt-name jt-ld-hname" style={fit(leader.name, 52, 16)}>{upper(leader.name)}</div>
            <div className="jt-ld-hteam">{upper(leader.team)}</div>
            <Pill className="jt-ld-hval"><b>{val(leader)}</b> {isRuns ? "RUNS" : "WICKETS"}</Pill>
          </div>
          <div className="jt-ld-list">
            {top.slice(1).map((r, i) => (
              <div key={r.name + i} className="jt-ld-row" style={{ animationDelay: `${i * 80}ms` }}>
                <b className="jt-pt-pos">{r.rank}</b>
                <span className="jt-ld-name"><b>{upper(r.name)}</b><small>{upper(r.team)}</small></span>
                <span className="jt-ld-val">{val(r)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </RoyalStage>
  );
}

/* ── Lower thirds ──────────────────────────────────────────────── */
function LastOut({ match }) {
  return (
    <div className="jt-lt"><span className="jt-lt-dot">OUT</span><span className="jt-lt-main">{upper(match.lastWicketName)}</span><span className="jt-lt-side">{match.lastWicketRuns ?? 0} ({match.lastWicketBalls ?? 0}) ✦ {upper(match.lastWicketDismissal, "OUT")}</span></div>
  );
}
function CustomText({ match }) {
  return <div className="jt-lt jt-lt-custom"><span className="jt-lt-dot">✦</span><span className="jt-lt-main">{match.customText}</span></div>;
}

export default {
  Versus, Toss, Winner, Summary, MatchSituation: Chase, NeedRun: Chase, Potm, Partnership,
  Squad, PointsTable, Leaders, LastOut, CustomText,
};
