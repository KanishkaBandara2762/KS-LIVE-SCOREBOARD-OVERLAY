import React from "react";
import "./ksPremium.css";
import { upper, fit, Logo, Stage, tossInfo, chaseInfo, squadInfo, roleLabel, findPlayerPhoto, useRotate, pointsTableMessage } from "./common";

/* ================================================================
   KS_PREMIUM theme pack — dark navy "HUD" look:
   Bebas Neue headings, amber highlights, cyan glow lines, red alerts.
   ================================================================ */

const HudBg = () => (
  <>
    <div className="kp-bg" />
    <div className="kp-grid" />
    <div className="kp-scan" />
    <div className="kp-corner kp-c1" /><div className="kp-corner kp-c2" /><div className="kp-corner kp-c3" /><div className="kp-corner kp-c4" />
  </>
);

const HudStage = ({ hiding, className = "", children }) => (
  <Stage canvasClass={`kp-canvas ${className}`} hiding={hiding} background={<HudBg />}>{children}</Stage>
);

const Kicker = ({ children, className = "" }) => <div className={`kp-kicker ${className}`}>{children}</div>;

/* ── Versus: diagonal split screen ─────────────────────────────── */
function Versus({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  return (
    <HudStage hiding={hiding}>
      <div className="kp-vs-half kp-vs-left" />
      <div className="kp-vs-half kp-vs-right" />
      <Kicker className="kp-vs-kicker">{upper(match.tournamentName || match.matchTitle, "KS LIVE")}{match.matchNumber ? `  //  MATCH ${match.matchNumber}` : ""}</Kicker>
      <div className="kp-vs-team kp-vs-team-a">
        <Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="kp-vs-logo" />
        <div className="kp-vs-name" style={fit(match.battingTeam, 96, 14)}>{upper(match.battingTeam, "TEAM A")}</div>
      </div>
      <div className="kp-vs-team kp-vs-team-b">
        <Logo src={getAbsoluteUrl(match.leagueLogo)} name={match.bowlingTeam} className="kp-vs-logo" />
        <div className="kp-vs-name" style={fit(match.bowlingTeam, 96, 14)}>{upper(match.bowlingTeam, "TEAM B")}</div>
      </div>
      <div className="kp-vs-bolt">VS</div>
      <div className="kp-hudbar kp-vs-bar">
        <span>{upper(match.venueName, "VENUE TBA")}</span>
        <b>{toss.known ? toss.line : upper(match.matchType, "LIVE MATCH")}</b>
        <span>{upper(match.matchDate, "")}</span>
      </div>
    </HudStage>
  );
}

/* ── Toss: vertical title + winner card ────────────────────────── */
function Toss({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  return (
    <HudStage hiding={hiding}>
      <div className="kp-toss-word">TOSS</div>
      {toss.known ? (
        <div className="kp-frame kp-toss-card">
          <Kicker>TOSS RESULT</Kicker>
          <div className="kp-toss-row">
            <Logo src={getAbsoluteUrl(toss.winnerLogo)} name={toss.winner} className="kp-toss-logo" />
            <div>
              <div className="kp-toss-name" style={fit(toss.winner, 120, 13)}>{upper(toss.winner)}</div>
              <div className="kp-toss-won">WON THE TOSS</div>
            </div>
          </div>
          <div className="kp-chip">ELECTED TO {toss.decision} FIRST</div>
          {toss.loser && <div className="kp-toss-vs">VS {upper(toss.loser)}</div>}
        </div>
      ) : <div className="kp-empty">Toss result not entered yet.</div>}
    </HudStage>
  );
}

/* ── Match won: amber band across the screen ───────────────────── */
function Winner({ winnerInfo, getAbsoluteUrl, match }) {
  if (!winnerInfo) return null;
  return (
    <HudStage>
      <div className="kp-sparks">{Array.from({ length: 24 }).map((_, i) => <i key={i} style={{ left: `${(i * 41) % 100}%`, top: `${(i * 23) % 100}%`, animationDelay: `${(i % 6) * 0.3}s` }} />)}</div>
      <Kicker className="kp-win-kicker">{upper(match.tournamentName, "MATCH RESULT")}</Kicker>
      <div className="kp-win-band">
        <Logo src={getAbsoluteUrl(winnerInfo.logo)} name={winnerInfo.team} className="kp-win-logo" />
        <div className="kp-win-text">
          <div className="kp-win-label">WINNERS</div>
          <div className="kp-win-team" style={fit(winnerInfo.team, 170, 12)}>{upper(winnerInfo.team)}</div>
        </div>
      </div>
      <div className="kp-chip kp-win-result">{upper(winnerInfo.text)}</div>
    </HudStage>
  );
}

/* ── Summary: two innings tiles + three HUD panels ─────────────── */
function Summary({ match, getAbsoluteUrl, getOvers, isMatchFinished, finalWinnerTeam, finalWinnerText }) {
  const legal = match.legalBallCount ?? match.totalBalls ?? 0;
  const hasFirst = match.isSecondInnings && match.firstInningsScore != null;
  const fow = (match.fallOfWickets || []).slice(-7);
  const tile = (team, logo, score, overs, live) => (
    <div className={`kp-frame kp-sum-tile ${live ? "is-live" : ""}`}>
      <Logo src={getAbsoluteUrl(logo)} name={team} className="kp-sum-logo" />
      <div className="kp-sum-tname" style={fit(team, 70, 11)}>{upper(team)}</div>
      <div className="kp-sum-tscore">{score}<small>{overs} OV</small></div>
    </div>
  );
  return (
    <HudStage>
      <div className="kp-h1 kp-sum-h">{isMatchFinished ? "MATCH SUMMARY" : "INNINGS SUMMARY"}</div>
      <Kicker className="kp-sum-k">{upper(match.tournamentName || match.matchTitle, "KS LIVE")}</Kicker>
      <div className="kp-sum-tiles">
        {hasFirst && tile(match.bowlingTeam, match.leagueLogo, `${match.firstInningsScore}-${match.firstInningsWickets ?? 0}`, getOvers(match.firstInningsOvers || 0), false)}
        {tile(match.battingTeam, match.battingLogo, `${match.score}-${match.wickets}`, getOvers(legal), true)}
      </div>
      {isMatchFinished && finalWinnerText && <div className="kp-chip kp-sum-result">{upper(`${finalWinnerTeam || ""} ${finalWinnerText}`.trim())}</div>}
      <div className="kp-sum-panels">
        <div className="kp-frame kp-panel">
          <div className="kp-panel-h">BATTING</div>
          {[match.player1, match.player2].filter((p) => p?.name).map((p, i) => (
            <div key={i} className="kp-line"><span>{upper(p.name)}{p.onStrike ? <i>●</i> : null}</span><b>{p.runs ?? 0}</b><em>{p.balls ?? 0}</em></div>
          ))}
        </div>
        <div className="kp-frame kp-panel">
          <div className="kp-panel-h">BOWLING</div>
          <div className="kp-line"><span>{upper(match.bowler?.name, "—")}</span><b>{match.bowler?.wickets ?? 0}-{match.bowler?.runs ?? 0}</b><em>{match.bowler?.overs ?? 0}</em></div>
          {match.isSecondInnings && match.targetScore > 0 && <div className="kp-line"><span>TARGET</span><b>{match.targetScore}</b><em /></div>}
        </div>
        <div className="kp-frame kp-panel">
          <div className="kp-panel-h">FALL OF WICKETS</div>
          {fow.length === 0 ? <div className="kp-muted">No wickets fallen</div> : fow.map((w, i) => (
            <div key={i} className="kp-line"><span>{upper(w.playerName || w.name, "BATTER")}</span><b>{w.score ?? 0}-{w.wicket ?? i + 1}</b><em>{w.overAtFall || "0.0"}</em></div>
          ))}
        </div>
      </div>
    </HudStage>
  );
}

/* ── Chase / need run: circular gauge ──────────────────────────── */
function Chase({ match, getAbsoluteUrl, getOvers }) {
  const c = chaseInfo(match);
  const R = 230, C = 2 * Math.PI * R;
  const done = c.chasing && c.target > 0 ? Math.min(1, match.score / c.target) : Math.min(1, c.legal / Math.max(1, c.totalBalls));
  return (
    <HudStage>
      <div className="kp-h1 kp-ch-h">{c.chasing ? "THE CHASE" : "INNINGS PROGRESS"}</div>
      <div className="kp-ch-team">
        <Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="kp-ch-logo" />
        <span style={fit(match.battingTeam, 54, 20)}>{upper(match.battingTeam)}</span>
      </div>
      <div className="kp-gauge">
        <svg viewBox="0 0 520 520" width="520" height="520">
          <circle cx="260" cy="260" r={R} className="kp-gauge-track" />
          <circle cx="260" cy="260" r={R} className="kp-gauge-fill" strokeDasharray={C} strokeDashoffset={C * (1 - done)} />
        </svg>
        <div className="kp-gauge-mid">
          {c.chasing ? (
            c.runsNeeded > 0 ? (<><b>{c.runsNeeded}</b><span>RUNS NEEDED</span><em>FROM {c.ballsLeft} BALLS</em></>) : (<><b>WON</b><span>{upper(match.battingTeam)}</span></>)
          ) : (<><b>{match.score}-{match.wickets}</b><span>{getOvers(c.legal)} OVERS</span></>)}
        </div>
      </div>
      <div className="kp-ch-stats kp-ch-left">
        <div><span>{c.chasing ? "TARGET" : "OVERS"}</span><b>{c.chasing ? c.target : `${getOvers(c.legal)}/${match.maxOvers || 20}`}</b></div>
        <div><span>CURRENT RR</span><b>{c.crr}</b></div>
      </div>
      <div className="kp-ch-stats kp-ch-right">
        <div><span>{c.chasing ? "REQUIRED RR" : "PROJECTED"}</span><b>{c.chasing ? c.rrr : Math.round(Number(c.crr) * (match.maxOvers || 20))}</b></div>
        <div><span>WICKETS LEFT</span><b>{Math.max(0, 10 - (match.wickets || 0))}</b></div>
      </div>
    </HudStage>
  );
}

/* ── Player of the match ───────────────────────────────────────── */
function Potm({ match, getAbsoluteUrl }) {
  return (
    <HudStage>
      <div className="kp-potm-text">
        <Kicker>PLAYER OF THE MATCH</Kicker>
        <div className="kp-potm-name" style={fit(match.potmName, 170, 10)}>{upper(match.potmName)}</div>
        {match.potmTeam && <div className="kp-potm-team">{upper(match.potmTeam)}</div>}
        {match.potmFigures && <div className="kp-chip kp-potm-figs">{upper(match.potmFigures)}</div>}
      </div>
      <div className="kp-hex">
        <Logo src={match.potmPhoto ? getAbsoluteUrl(match.potmPhoto) : ""} name={match.potmName} className="kp-hex-photo" />
      </div>
    </HudStage>
  );
}

/* ── Partnership: twin vertical bars ───────────────────────────── */
function Partnership({ match }) {
  const p = match.partnership || {};
  const bats = [match.player1, match.player2].filter((x) => x?.name);
  const max = Math.max(1, ...bats.map((b) => b.runs || 0));
  return (
    <HudStage>
      <div className="kp-h1 kp-ch-h">PARTNERSHIP</div>
      <div className="kp-ps-total"><b>{p.runs ?? 0}</b><span>RUNS • {p.balls ?? 0} BALLS</span></div>
      <div className="kp-ps-bars">
        {bats.map((b, i) => (
          <div key={i} className="kp-ps-col">
            <div className="kp-ps-val">{b.runs ?? 0}<small> ({b.balls ?? 0})</small></div>
            <div className="kp-ps-bar"><div style={{ height: `${Math.max(6, ((b.runs || 0) / max) * 100)}%` }} /></div>
            <div className="kp-ps-name">{upper(b.name)}</div>
          </div>
        ))}
      </div>
    </HudStage>
  );
}

/* ── Squad: three columns of slim cards with jersey numbers ────── */
function Squad({ match, getAbsoluteUrl }) {
  const { teamName, teamLogo, players } = squadInfo(match, getAbsoluteUrl);
  return (
    <HudStage>
      <div className="kp-sq-head">
        <Logo src={teamLogo} name={teamName} className="kp-sq-logo" />
        <div>
          <Kicker>PLAYING SQUAD</Kicker>
          <div className="kp-h1 kp-sq-team" style={fit(teamName, 120, 18)}>{upper(teamName, "TEAM")}</div>
        </div>
      </div>
      {players.length === 0 ? <div className="kp-empty">No squad added for this team yet.</div> : (
        <div className="kp-sq-grid">
          {players.map((p, i) => (
            <div key={i} className="kp-sq-card" style={{ animationDelay: `${i * 50}ms` }}>
              <span className="kp-sq-no">{p.jerseyNumber ?? i + 1}</span>
              <Logo src={p.photo ? getAbsoluteUrl(p.photo) : ""} name={p.name} className="kp-sq-photo" />
              <span className="kp-sq-info"><b>{upper(p.name)}</b><small>{roleLabel(p.role)}</small></span>
            </div>
          ))}
        </div>
      )}
    </HudStage>
  );
}

/* ── Points table ──────────────────────────────────────────────── */
function PointsTable({ match, pointsTable, hasTournament, getAbsoluteUrl }) {
  const groups = pointsTable?.groups || [];
  const g = groups[useRotate(groups.length)];
  const message = pointsTableMessage(pointsTable, hasTournament, g);
  const rows = (g?.rows || []).slice(0, 10);
  return (
    <HudStage className={rows.length > 7 ? "kp-pt-dense" : ""}>
      <div className="kp-h1 kp-pt-h">POINTS TABLE</div>
      <Kicker className="kp-pt-k">{upper(match.tournamentName, "STANDINGS")}{g && groups.length > 1 ? `  //  ${upper(g.name)}` : ""}</Kicker>
      {message ? <div className="kp-empty">{message}</div> : (
        <div className="kp-pt" key={g.groupId}>
          <div className="kp-pt-row kp-pt-head"><span>#</span><span className="kp-pt-team">TEAM</span><span>P</span><span>W</span><span>L</span><span>NR</span><span>NRR</span><span>PTS</span></div>
          {rows.map((r, i) => (
            <div key={r.teamId} className={`kp-pt-row ${r.inQualifyingPosition ? "is-q" : ""} ${r.eliminated ? "is-out" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
              <span className="kp-pt-pos">{String(r.position).padStart(2, "0")}</span>
              <span className="kp-pt-team"><Logo src={getAbsoluteUrl(r.logo || pointsTable.teams?.[r.teamId]?.logo || "")} name={r.name} className="kp-pt-logo" />{upper(r.name)}{r.qualified && <em>Q</em>}</span>
              <span>{r.played}</span><span>{r.won}</span><span>{r.lost}</span><span>{(r.tied || 0) + (r.noResult || 0)}</span>
              <span className={`kp-pt-nrr ${r.nrr < 0 ? "neg" : ""}`}>{r.nrrDisplay}</span>
              <span><b className="kp-pt-pts">{r.points}</b></span>
            </div>
          ))}
        </div>
      )}
    </HudStage>
  );
}

/* ── Leaders: horizontal bar chart ─────────────────────────────── */
function Leaders({ match, rows = [], kind = "runs", getAbsoluteUrl }) {
  const isRuns = kind === "runs";
  const top = rows.slice(0, 5);
  const val = (r) => (isRuns ? r.runs : r.wickets) || 0;
  const max = Math.max(1, ...top.map(val));
  const leader = top[0];
  const photo = leader ? findPlayerPhoto(match, leader.name) : null;
  return (
    <HudStage>
      <div className="kp-h1 kp-ld-h">{isRuns ? "MOST RUNS" : "MOST WICKETS"}</div>
      <Kicker className="kp-ld-k">{upper(match.tournamentName, "TOURNAMENT LEADERS")}</Kicker>
      {!leader ? <div className="kp-empty">No completed-match statistics yet.</div> : (
        <>
          <div className="kp-ld-chart">
            {top.map((r, i) => (
              <div key={r.name + i} className={`kp-ld-row ${i === 0 ? "is-top" : ""}`} style={{ animationDelay: `${i * 90}ms` }}>
                <span className="kp-ld-rank">{r.rank}{r.tied ? "=" : ""}</span>
                <span className="kp-ld-who"><b>{upper(r.name)}</b><small>{upper(r.team)}</small></span>
                <span className="kp-ld-track"><span className="kp-ld-bar" style={{ width: `${(val(r) / max) * 100}%` }}><b>{val(r)}</b></span></span>
              </div>
            ))}
          </div>
          <div className="kp-hex kp-ld-hex"><Logo src={photo ? getAbsoluteUrl(photo) : ""} name={leader.name} className="kp-hex-photo" /></div>
          <div className="kp-ld-unit">{isRuns ? "RUNS" : "WICKETS"}</div>
        </>
      )}
    </HudStage>
  );
}

/* ── Lower thirds ──────────────────────────────────────────────── */
function LastOut({ match }) {
  return (
    <div className="kp-lt">
      <span className="kp-lt-tag">OUT</span>
      <span className="kp-lt-main">{upper(match.lastWicketName)}</span>
      <span className="kp-lt-side">{match.lastWicketRuns ?? 0} ({match.lastWicketBalls ?? 0}) // {upper(match.lastWicketDismissal, "OUT")}</span>
    </div>
  );
}
function CustomText({ match }) {
  return (
    <div className="kp-lt kp-lt-custom">
      <span className="kp-lt-tag">KS LIVE</span>
      <span className="kp-lt-main">{match.customText}</span>
    </div>
  );
}

export default {
  Versus, Toss, Winner, Summary, MatchSituation: Chase, NeedRun: Chase, Potm, Partnership,
  Squad, PointsTable, Leaders, LastOut, CustomText,
};
