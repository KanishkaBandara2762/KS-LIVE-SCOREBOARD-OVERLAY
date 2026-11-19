import React from "react";
import { Crown, Trophy } from "lucide-react";
import "./iplGold.css";
import { resolveTeamColors, shade } from "../../utils/teamColors";
import { upper, fit, Logo, Stage, tossInfo, chaseInfo, squadInfo, roleLabel, findPlayerPhoto, useRotate, pointsTableMessage } from "./common";

/* ================================================================
   IPL_GOLD theme pack — navy + gold full screens.
   Matches the IPL Gold scorebar (slate navy, gold accent, royal blue).
   ================================================================ */

const GoldBg = () => (
  <>
    <div className="ig-bg" />
    <div className="ig-rays" />
    <div className="ig-lines" />
    <div className="ig-floor" />
    <div className="ig-frame" />
  </>
);

const GoldStage = ({ hiding, className = "", children }) => (
  <Stage canvasClass={`ig-canvas ${className}`} hiding={hiding} background={<GoldBg />}>{children}</Stage>
);

const Ribbon = ({ children, className = "" }) => <div className={`ig-ribbon ${className}`}><span>{children}</span></div>;

/* ── Versus ────────────────────────────────────────────────────── */
function Versus({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  const info = [match.matchNumber ? `MATCH ${match.matchNumber}` : upper(match.matchType), upper(match.venueName), upper(match.matchDate)].filter(Boolean).join("  •  ");
  const team = (name, logo, side) => (
    <div className={`ig-vs-card ig-vs-${side}`}>
      <div className="ig-vs-ring"><Logo src={getAbsoluteUrl(logo)} name={name} className="ig-vs-logo" /></div>
      <div className="ig-vs-name" style={fit(name, 64, 16)}>{upper(name, side === "a" ? "TEAM A" : "TEAM B")}</div>
    </div>
  );
  return (
    <GoldStage hiding={hiding}>
      <Ribbon className="ig-top-ribbon">{upper(match.tournamentName || match.matchTitle, "LIVE CRICKET")}</Ribbon>
      {team(match.battingTeam, match.battingLogo, "a")}
      {team(match.bowlingTeam, match.leagueLogo, "b")}
      <div className="ig-vs-medal"><div className="ig-vs-medal-ring" /><span>VS</span></div>
      {info && <div className="ig-vs-info">{info}</div>}
      {toss.known && <div className="ig-goldbar ig-vs-toss">{toss.line}</div>}
    </GoldStage>
  );
}

/* ── Toss ──────────────────────────────────────────────────────── */
function Toss({ match, getAbsoluteUrl, hiding }) {
  const toss = tossInfo(match);
  return (
    <GoldStage hiding={hiding}>
      <div className="ig-title ig-toss-title">THE TOSS</div>
      <div className="ig-coin"><div className="ig-coin-face">KS</div></div>
      {toss.known ? (
        <>
          <div className="ig-toss-team">
            <div className="ig-toss-ring"><Logo src={getAbsoluteUrl(toss.winnerLogo)} name={toss.winner} className="ig-toss-logo" /></div>
            <div>
              <div className="ig-toss-label">WON THE TOSS</div>
              <div className="ig-toss-name" style={fit(toss.winner, 96, 18)}>{upper(toss.winner)}</div>
            </div>
          </div>
          <div className="ig-goldbar ig-toss-decision">ELECTED TO {toss.decision} FIRST</div>
        </>
      ) : <div className="ig-empty ig-toss-empty">Toss result not entered yet.</div>}
    </GoldStage>
  );
}

/* ── Match won ─────────────────────────────────────────────────── */
function Winner({ winnerInfo, getAbsoluteUrl }) {
  if (!winnerInfo) return null;
  return (
    <GoldStage className="ig-winner" >
      <div className="ig-confetti">{Array.from({ length: 28 }).map((_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.35}s`, animationDuration: `${3 + (i % 5) * 0.6}s` }} />)}</div>
      <div className="ig-win-trophy"><Trophy size={120} strokeWidth={1.6} /></div>
      <div className="ig-win-ring"><Logo src={getAbsoluteUrl(winnerInfo.logo)} name={winnerInfo.team} className="ig-win-logo" /></div>
      <div className="ig-win-label">WINNERS</div>
      <div className="ig-title ig-win-team" style={fit(winnerInfo.team, 150, 18)}>{upper(winnerInfo.team)}</div>
      <div className="ig-goldbar ig-win-text">{upper(winnerInfo.text)}</div>
    </GoldStage>
  );
}

/* ── Summary ───────────────────────────────────────────────────── */
function Summary({ match, getAbsoluteUrl, getOvers, isMatchFinished, finalWinnerTeam, finalWinnerText, bannerInfo = {} }) {
  const hasFirst = match.isSecondInnings && match.firstInningsScore !== undefined && match.firstInningsScore !== null;
  const fow = (match.fallOfWickets || []).slice(-8);
  const sub = isMatchFinished
    ? [bannerInfo.title, bannerInfo.venue, bannerInfo.date].filter(Boolean).join("  •  ")
    : upper(match.tournamentName, "MATCH SUMMARY");
  return (
    <GoldStage>
      <div className="ig-sum-head">
        <Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="ig-sum-logo" />
        <div className="ig-sum-team">
          <div className="ig-title ig-sum-name" style={fit(match.battingTeam, 96, 18)}>{upper(match.battingTeam)}</div>
          <div className="ig-sum-sub">{upper(sub)}</div>
        </div>
        <div className="ig-sum-score">
          <b>{match.score}-{match.wickets}</b>
          <span>OVERS {getOvers(match.legalBallCount ?? match.totalBalls ?? 0)} / {match.maxOvers}</span>
        </div>
      </div>
      {isMatchFinished && finalWinnerText && (
        <div className="ig-goldbar ig-sum-result">{upper(finalWinnerTeam)} {upper(finalWinnerText)}</div>
      )}
      <div className="ig-sum-grid">
        <div className="ig-panel">
          <div className="ig-panel-h">INNINGS</div>
          {hasFirst && (
            <div className="ig-row"><span>{upper(match.bowlingTeam)}</span><b>{match.firstInningsScore}-{match.firstInningsWickets ?? 0}</b><em>({getOvers(match.firstInningsOvers || 0)})</em></div>
          )}
          <div className="ig-row is-hi"><span>{upper(match.battingTeam)}</span><b>{match.score}-{match.wickets}</b><em>({getOvers(match.legalBallCount ?? match.totalBalls ?? 0)})</em></div>
          {match.isSecondInnings && match.targetScore > 0 && <div className="ig-row"><span>TARGET</span><b>{match.targetScore}</b><em /></div>}
          {match.extras !== undefined && <div className="ig-row"><span>EXTRAS</span><b>{typeof match.extras === "object" ? Object.values(match.extras).reduce((a, v) => a + (Number(v) || 0), 0) : match.extras}</b><em /></div>}
        </div>
        <div className="ig-panel">
          <div className="ig-panel-h">AT THE CREASE</div>
          {[match.player1, match.player2].filter((p) => p?.name).map((p, i) => (
            <div key={i} className="ig-row"><span>{upper(p.name)}{p.onStrike ? " *" : ""}</span><b>{p.runs ?? 0}</b><em>({p.balls ?? 0})</em></div>
          ))}
          <div className="ig-panel-h ig-panel-h2">BOWLER</div>
          <div className="ig-row"><span>{upper(match.bowler?.name, "—")}</span><b>{match.bowler?.wickets ?? 0}-{match.bowler?.runs ?? 0}</b><em>({match.bowler?.overs ?? 0})</em></div>
        </div>
        <div className="ig-panel">
          <div className="ig-panel-h">FALL OF WICKETS</div>
          {fow.length === 0 ? <div className="ig-muted">No wickets fallen</div> : fow.map((w, i) => (
            <div key={i} className="ig-row"><span>{upper(w.playerName || w.name, "BATTER")}</span><b>{w.score ?? 0}-{w.wicket ?? i + 1}</b><em>({w.overAtFall || "0.0"})</em></div>
          ))}
        </div>
      </div>
    </GoldStage>
  );
}

/* ── Chase target / need run ───────────────────────────────────── */
function Chase({ match, getAbsoluteUrl, getOvers }) {
  const c = chaseInfo(match);
  const pct = c.target > 0 ? Math.min(100, Math.round((match.score / c.target) * 100)) : 0;
  const projected = Math.round(Number(c.crr) * (match.maxOvers || 20));
  return (
    <GoldStage>
      {c.chasing ? <Ribbon className="ig-top-ribbon">TARGET {c.target}</Ribbon> : <Ribbon className="ig-top-ribbon">{upper(match.tournamentName, "MATCH SITUATION")}</Ribbon>}
      <div className="ig-ch-team">
        <div className="ig-toss-ring ig-ch-ring"><Logo src={getAbsoluteUrl(match.battingLogo)} name={match.battingTeam} className="ig-toss-logo" /></div>
        <div className="ig-title ig-ch-name" style={fit(match.battingTeam, 90, 26)}>{upper(match.battingTeam)}</div>
      </div>
      {c.chasing ? (
        c.runsNeeded > 0 ? (
          <div className="ig-ch-line">NEED <b>{c.runsNeeded}</b> RUNS FROM <b>{c.ballsLeft}</b> BALLS</div>
        ) : <div className="ig-ch-line"><b>{upper(match.battingTeam)} WON</b></div>
      ) : (
        <div className="ig-ch-line"><b>{match.score}-{match.wickets}</b> IN <b>{getOvers(c.legal)}</b> OVERS</div>
      )}
      {c.chasing && (
        <div className="ig-ch-progress"><div style={{ width: `${pct}%` }} /><span>{match.score} / {c.target}</span></div>
      )}
      <div className="ig-ch-stats">
        <div><span>CURRENT RR</span><b>{c.crr}</b></div>
        {c.chasing ? <div><span>REQUIRED RR</span><b>{c.rrr}</b></div> : <div><span>PROJECTED</span><b>{projected}</b></div>}
        <div><span>{c.chasing ? "BALLS LEFT" : "OVERS"}</span><b>{c.chasing ? c.ballsLeft : `${getOvers(c.legal)}/${match.maxOvers || 20}`}</b></div>
        <div><span>WICKETS IN HAND</span><b>{Math.max(0, 10 - (match.wickets || 0))}</b></div>
      </div>
    </GoldStage>
  );
}

/* ── Player of the match ───────────────────────────────────────── */
function Potm({ match, getAbsoluteUrl }) {
  return (
    <GoldStage>
      <div className="ig-potm-frame">
        <div className="ig-potm-crown"><Crown size={86} strokeWidth={1.8} /></div>
        <Logo src={match.potmPhoto ? getAbsoluteUrl(match.potmPhoto) : ""} name={match.potmName} className="ig-potm-photo" />
      </div>
      <div className="ig-potm-info">
        <Ribbon>PLAYER OF THE MATCH</Ribbon>
        <div className="ig-title ig-potm-name" style={fit(match.potmName, 150, 11)}>{upper(match.potmName)}</div>
        {match.potmTeam && <div className="ig-potm-team">{upper(match.potmTeam)}</div>}
        {match.potmFigures && <div className="ig-goldbar ig-potm-figs">{upper(match.potmFigures)}</div>}
      </div>
    </GoldStage>
  );
}

/* ── Partnership ───────────────────────────────────────────────── */
function Partnership({ match }) {
  const p = match.partnership || {};
  const bats = [match.player1, match.player2].filter((x) => x?.name);
  const total = bats.reduce((a, b) => a + (b.runs || 0), 0) || 1;
  return (
    <GoldStage>
      <div className="ig-title ig-pt-heading">PARTNERSHIP</div>
      <div className="ig-pship-num">{p.runs ?? 0}<small>RUNS</small></div>
      <div className="ig-pship-balls">FROM {p.balls ?? 0} BALLS</div>
      <div className="ig-pship-bats">
        {bats.map((b, i) => (
          <div key={i} className="ig-panel ig-pship-bat">
            <div className="ig-pship-bname">{upper(b.name)}</div>
            <div className="ig-pship-bruns">{b.runs ?? 0}<small> ({b.balls ?? 0})</small></div>
          </div>
        ))}
      </div>
      {bats.length === 2 && (
        <div className="ig-pship-split">
          <div style={{ width: `${Math.round(((bats[0].runs || 0) / total) * 100)}%` }} />
        </div>
      )}
    </GoldStage>
  );
}

/* ── Squad: both teams side by side, each column in its team colour ─────── */
function Squad({ match, getAbsoluteUrl }) {
  const colors = resolveTeamColors(match);
  const cols = [
    { name: match.battingTeam, logo: match.battingLogo, players: match.battingSquad, color: colors.batting, text: colors.battingText },
    { name: match.bowlingTeam, logo: match.leagueLogo, players: match.bowlingSquad, color: colors.bowling, text: colors.bowlingText },
  ].map((c) => ({ ...c, players: (c.players || []).slice(0, 12).map((x) => (typeof x === "string" ? { name: x } : x)) }));
  const empty = cols.every((c) => c.players.length === 0);
  return (
    <GoldStage>
      <div className="ig-sq2-top">{upper(match.tournamentName, "TOURNAMENT")}</div>
      <div className="ig-sq2-title">
        <div className="ig-title">TEAM SQUAD</div>
      </div>
      {empty ? <div className="ig-empty">No squad added for these teams yet.</div> : (
        <div className="ig-sq2-cols">
          {cols.map((c, ci) => (
            <div key={ci} className="ig-sq2-col">
              <div className="ig-sq2-head" style={{ background: `linear-gradient(90deg, ${shade(c.color, -0.3)}, ${c.color})`, color: c.text }}>
                <Logo src={getAbsoluteUrl(c.logo)} name={c.name} className="ig-sq2-logo" />
                <span style={fit(c.name, 52, 14)}>{upper(c.name, ci ? "BOWLING TEAM" : "BATTING TEAM")}</span>
              </div>
              <div className="ig-sq2-list" style={{ borderRight: `10px solid ${c.color}` }}>
                {c.players.map((pl, i) => (
                  <div key={i} className="ig-sq2-row" style={{ animationDelay: `${(ci * 12 + i) * 45}ms` }}>
                    <span>{upper(pl.name)}</span>
                    {roleLabel(pl.role) === "WICKET KEEPER" && <em>WK</em>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </GoldStage>
  );
}

/* ── Points table ──────────────────────────────────────────────── */
function PointsTable({ match, pointsTable, hasTournament, getAbsoluteUrl }) {
  const groups = pointsTable?.groups || [];
  const g = groups[useRotate(groups.length)];
  const message = pointsTableMessage(pointsTable, hasTournament, g);
  const rows = (g?.rows || []).slice(0, 10);
  return (
    <GoldStage className={rows.length > 7 ? "ig-pt-dense" : ""}>
      <div className="ig-title ig-pt-heading">POINTS TABLE</div>
      <div className="ig-pt-sub">{upper(match.tournamentName)}{g && groups.length > 1 ? `  •  ${upper(g.name)}` : ""}</div>
      {message ? <div className="ig-empty">{message}</div> : (
        <div className="ig-pt" key={g.groupId}>
          <div className="ig-pt-row ig-pt-head"><span>POS</span><span className="ig-pt-team">TEAM</span><span>P</span><span>W</span><span>L</span><span>NR</span><span>NRR</span><span>PTS</span></div>
          {rows.map((r, i) => {
            const logo = getAbsoluteUrl(r.logo || pointsTable.teams?.[r.teamId]?.logo || "");
            return (
              <div key={r.teamId} className={`ig-pt-row ${r.inQualifyingPosition ? "is-q" : ""} ${r.eliminated ? "is-out" : ""}`} style={{ animationDelay: `${i * 70}ms` }}>
                <span className="ig-pt-pos">{r.position}</span>
                <span className="ig-pt-team"><Logo src={logo} name={r.name} className="ig-pt-logo" />{upper(r.name)}{r.qualified && <em>Q</em>}</span>
                <span>{r.played}</span><span>{r.won}</span><span>{r.lost}</span><span>{(r.tied || 0) + (r.noResult || 0)}</span>
                <span className={`ig-pt-nrr ${r.nrr < 0 ? "neg" : ""}`}>{r.nrrDisplay}</span>
                <span className="ig-pt-pts">{r.points}</span>
              </div>
            );
          })}
        </div>
      )}
    </GoldStage>
  );
}

/* ── Leaders (most runs / most wickets) ────────────────────────── */
function Leaders({ match, rows = [], kind = "runs", getAbsoluteUrl }) {
  const isRuns = kind === "runs";
  const top = rows.slice(0, 5);
  const leader = top[0];
  const val = (r) => (isRuns ? r.runs : r.wickets);
  const unit = isRuns ? "RUNS" : "WKTS";
  return (
    <GoldStage>
      <div className="ig-title ig-ld-heading">{isRuns ? "ORANGE CAP RACE" : "PURPLE CAP RACE"}</div>
      <div className="ig-pt-sub ig-ld-sub">{isRuns ? "MOST RUNS" : "MOST WICKETS"}  •  {upper(match.tournamentName, "TOURNAMENT")}</div>
      {!leader ? <div className="ig-empty">No completed-match statistics yet.</div> : (
        <>
          <div className={`ig-ld-hero ${isRuns ? "is-orange" : "is-purple"}`}>
            <div className="ig-ld-cap">#1</div>
            <Logo src={findPlayerPhoto(match, leader.name) ? getAbsoluteUrl(findPlayerPhoto(match, leader.name)) : ""} name={leader.name} className="ig-ld-photo" />
            <div className="ig-ld-hname" style={fit(leader.name, 64, 16)}>{upper(leader.name)}</div>
            <div className="ig-ld-hteam">{upper(leader.team)}</div>
            <div className="ig-ld-hval">{val(leader)}<small> {unit}</small></div>
          </div>
          <div className="ig-ld-list">
            {top.slice(1).map((r, i) => (
              <div key={r.name + i} className="ig-ld-row" style={{ animationDelay: `${i * 90}ms` }}>
                <span className="ig-ld-rank">{r.rank}{r.tied ? "=" : ""}</span>
                <span className="ig-ld-name"><b>{upper(r.name)}</b><small>{upper(r.team)}</small></span>
                <span className="ig-ld-val">{val(r)}<small> {unit}</small></span>
              </div>
            ))}
          </div>
        </>
      )}
    </GoldStage>
  );
}

/* ── Lower thirds ──────────────────────────────────────────────── */
function LastOut({ match }) {
  return (
    <div className="ig-lt">
      <div className="ig-lt-tag">OUT</div>
      <div className="ig-lt-main">{upper(match.lastWicketName)}</div>
      <div className="ig-lt-side">{match.lastWicketRuns ?? 0} ({match.lastWicketBalls ?? 0})  •  {upper(match.lastWicketDismissal, "OUT")}</div>
    </div>
  );
}

function CustomText({ match }) {
  return (
    <div className="ig-lt ig-lt-custom">
      <div className="ig-lt-tag">★</div>
      <div className="ig-lt-main">{match.customText}</div>
    </div>
  );
}

export default {
  Versus, Toss, Winner, Summary, MatchSituation: Chase, NeedRun: Chase, Potm, Partnership,
  Squad, PointsTable, Leaders, LastOut, CustomText,
};
