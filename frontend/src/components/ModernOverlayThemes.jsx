import React from 'react';
import './ModernBroadcastThemes.css';
import './ModernBroadcastSkins.css';

// New themes reuse an original layout and add their own skin (styling only).
const SKIN_LAYOUTS = {
  APEX: 'ICC_GLOBAL',
  SHAKTI: 'ICC_GLOBAL',
  DIAMOND: 'SKY_HYPERION',
  VOLT: 'FOX_STRIKE',
  THUNDER: 'FOX_STRIKE',
  BLITZ: 'JIO_TITAN',
  FRANCHISE: 'JIO_TITAN',
  ELITE: 'SUPERSPORT_AURA',
};

/**
 * ModernOverlayThemes Component
 * Renders cutting-edge international broadcast overlays for live scoring:
 * - ICC_GLOBAL (ICC T20 Global Apex)
 * - SKY_HYPERION (Sky Sports Hyperion Pro)
 * - JIO_TITAN (Jio Premier League Titan)
 * - FOX_STRIKE (Fox Cricket BBL Strike)
 * - SUPERSPORT_AURA (SuperSport Aura Glass)
 */
export default function ModernOverlayThemes({
  themeId,
  match,
  showEvent,
  eventType,
  eventWicketName,
  getHowOutText,
  scoreAnimClass,
  getOvers,
  getAbsoluteUrl,
  TeamLogo,
}) {
  if (!match) return null;

  const layoutId = SKIN_LAYOUTS[themeId] || themeId;
  const skinClass = SKIN_LAYOUTS[themeId] ? `skin-${themeId.toLowerCase()}` : '';

  const bpo = match.ballsPerOver || 6;
  const legalDeliveries = match.legalBallCount ?? match.totalBalls ?? 0;
  const maxOvers = match.maxOvers || 20;
  const oversStr = `${Math.floor(legalDeliveries / bpo)}.${legalDeliveries % bpo}`;
  
  const totalMatchBalls = match.targetBalls > 0 ? match.targetBalls : maxOvers * bpo;
  const remainBalls = match.manualBallsOverride
    ? (match.manualBallsValue || 0)
    : Math.max(0, totalMatchBalls - legalDeliveries);
  const runsNeeded = match.isSecondInnings ? Math.max(0, (match.targetScore || 0) - match.score) : 0;
  
  const crr = legalDeliveries > 0 ? (match.score / (legalDeliveries / bpo)).toFixed(2) : "0.00";
  const rrr = remainBalls > 0 && runsNeeded > 0 ? (runsNeeded / (remainBalls / bpo)).toFixed(2) : "--";

  const striker = match.player1?.onStrike ? match.player1 : match.player2;
  const nonStriker = match.player1?.onStrike ? match.player2 : match.player1;
  const bowler = match.bowler;
  const recentBalls = match.recentBalls || [];

  // Striker / Non-striker Strike Rate calculation
  const getSR = (p) => {
    if (!p || !p.balls) return "0.0";
    return ((p.runs / p.balls) * 100).toFixed(1);
  };

  // Bowler economy rate calculation
  const getEcon = (b) => {
    if (!b) return "0.00";
    const balls = (b.overs ? Math.floor(b.overs) * bpo + Math.round((b.overs % 1) * 10) : 0);
    if (!balls) return "0.00";
    return ((b.runs || 0) / (balls / bpo)).toFixed(2);
  };

  // Ball class helper
  const getBallBadgeType = (b) => {
    if (!b) return '';
    if (b === '4') return 'four';
    if (b === '6') return 'six';
    if (b.includes('W')) return 'wicket';
    if (b.includes('WD') || b.includes('NB') || b.includes('LB') || b.includes('B')) return 'extra';
    return 'single';
  };

  // Render Event Banner
  const renderEventBanner = () => {
    if (!showEvent || !["FOUR", "SIX", "WICKET", "50", "100"].includes(eventType)) return null;

    let bannerClass = "mbo-event-four";
    let title = "FOUR!";
    if (eventType === "SIX") {
      bannerClass = "mbo-event-six";
      title = "MAXIMUM SIX!";
    } else if (eventType === "WICKET") {
      bannerClass = "mbo-event-wicket";
      title = "WICKET!";
    } else if (eventType === "50" || eventType === "100") {
      bannerClass = "mbo-event-milestone";
      title = eventType === "50" ? "HALF CENTURY!" : "CENTURY!";
    }

    return (
      <div className={`mbo-event-banner ${bannerClass}`}>
        <h1 className="mbo-event-title">{title}</h1>
        {eventType === "WICKET" && (
          <div className="mbo-event-details">
            <span className="mbo-event-player">{eventWicketName} OUT</span>
            <span className="mbo-event-sub">{getHowOutText ? getHowOutText() : ''}</span>
          </div>
        )}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 1. ICC_GLOBAL — ICC T20 GLOBAL APEX
  // ══════════════════════════════════════════════════════════════════════════
  if (layoutId === 'ICC_GLOBAL') {
    return (
      <div className={`mbo-wrapper icc-wrapper ${skinClass}`}>
        {renderEventBanner()}

        {/* Top Info Ribbon */}
        <div className="icc-top-ribbon">
          <div className="icc-live-beacon">
            <span className="icc-live-dot" />
            <span>LIVE • {match.tournamentName || "ICC T20 GLOBAL"}</span>
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <span>CRR: <strong style={{ color: '#00f5ff' }}>{crr}</strong></span>
            {match.isSecondInnings && match.targetScore && (
              <span>TARGET: <strong style={{ color: '#ff007a' }}>{match.targetScore}</strong> (RRR: {rrr})</span>
            )}
            <span>{match.matchTitle || "INTERNATIONAL"}</span>
          </div>
        </div>

        {/* Main Board */}
        <div className="icc-board">
          {/* Batting Team & Big Score */}
          <div className="icc-team-section">
            <div className="icc-logo-box">
              <TeamLogo src={getAbsoluteUrl(match.battingLogo)} teamName={match.battingTeam} size={54} />
            </div>
            <div className="icc-team-meta">
              <span className="icc-team-name">{match.battingTeam || "TEAM 1"}</span>
              <span className="icc-sub-meta">{match.matchType || "T20"} • {match.matchStatus || "LIVE"}</span>
            </div>
            <div className="icc-score-capsule">
              <span className={`icc-score-main ${scoreAnimClass ? 'mbo-score-pop' : ''}`}>
                {match.score}/{match.wickets}
              </span>
              <span className="icc-overs-main">
                {oversStr} / {maxOvers} OVERS
              </span>
            </div>
          </div>

          {/* Batsmen */}
          <div className="icc-batsmen-section">
            <div className={`icc-bat-row striker`}>
              <div className="icc-bat-name-box">
                <span className="icc-striker-arrow">▶</span>
                <span>{striker?.name || "BATTER 1"}</span>
              </div>
              <div>
                <span className="icc-bat-stats">{striker?.runs || 0}</span>
                <span className="icc-bat-balls"> ({striker?.balls || 0})</span>
                <span className="icc-bat-sr">SR {getSR(striker)}</span>
              </div>
            </div>

            <div className="icc-bat-row">
              <div className="icc-bat-name-box">
                <span style={{ width: '12px', display: 'inline-block' }} />
                <span>{nonStriker?.name || "BATTER 2"}</span>
              </div>
              <div>
                <span className="icc-bat-stats">{nonStriker?.runs || 0}</span>
                <span className="icc-bat-balls"> ({nonStriker?.balls || 0})</span>
                <span className="icc-bat-sr">SR {getSR(nonStriker)}</span>
              </div>
            </div>
          </div>

          {/* Bowler & Tracker */}
          <div className="icc-bowler-section">
            <div className="icc-bowler-meta">
              <span className="icc-bowler-tag">CURRENT BOWLER</span>
              <span className="icc-bowler-name">{bowler?.name || "BOWLER"}</span>
              <span className="icc-bowler-figs">
                {bowler?.wickets || 0}-{bowler?.runs || 0} ({getOvers(Math.round((bowler?.overs || 0) * bpo))})
              </span>
            </div>

            <div className="icc-ball-track">
              {Array.from({ length: Math.max(bpo, recentBalls.length) }).map((_, i) => {
                const b = recentBalls[i] || '';
                const type = getBallBadgeType(b);
                let cls = 'icc-ball-dot';
                if (type === 'four') cls += ' is-four';
                else if (type === 'six') cls += ' is-six';
                else if (type === 'wicket') cls += ' is-wicket';
                else if (type === 'extra') cls += ' is-extra';
                return (
                  <div key={i} className={cls}>
                    {b === '•' ? '0' : b}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Opponent Logo */}
          <div className="icc-right-badge">
            <TeamLogo src={getAbsoluteUrl(match.leagueLogo)} teamName={match.bowlingTeam} size={48} />
          </div>
        </div>

        {/* 2nd Innings Target Strip */}
        {match.isSecondInnings && runsNeeded > 0 && (
          <div className="mbo-target-strip mbo-target-icc">
            <span>{match.battingTeam} NEED <strong>{runsNeeded} RUNS</strong> FROM <strong>{remainBalls} BALLS</strong></span>
            <span>RRR: <strong>{rrr}</strong> | TARGET: <strong>{match.targetScore}</strong></span>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. SKY_HYPERION — SKY SPORTS HYPERION PRO (UK & The Hundred)
  // ══════════════════════════════════════════════════════════════════════════
  if (layoutId === 'SKY_HYPERION') {
    return (
      <div className={`mbo-wrapper skyh-wrapper ${skinClass}`}>
        {renderEventBanner()}

        <div className="skyh-board">
          {/* Team & Main Score */}
          <div className="skyh-team-col">
            <TeamLogo src={getAbsoluteUrl(match.battingLogo)} teamName={match.battingTeam} size={50} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="skyh-team-name">{match.battingTeam ? match.battingTeam.toUpperCase() : "TEAM"}</span>
              <span style={{ fontSize: '11px', color: '#8e929b', fontWeight: 800 }}>{match.tournamentName || "SKY SPORTS LIVE"}</span>
            </div>
            <div className="skyh-score-wrap">
              <div className={`skyh-score ${scoreAnimClass ? 'mbo-score-pop' : ''}`}>
                {match.score}-{match.wickets}
              </div>
              <div className="skyh-overs">{oversStr} ({maxOvers})</div>
            </div>
          </div>

          {/* Batsmen */}
          <div className="skyh-batsmen-col">
            <div className="skyh-bat-row active">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="skyh-tag-strike">STRIKE</span>
                <span>{striker?.name || "BATTER 1"}</span>
              </div>
              <div className="skyh-bat-nums">
                {striker?.runs || 0} <span style={{ color: '#8e929b', fontSize: '13px' }}>({striker?.balls || 0})</span>
              </div>
            </div>
            <div className="skyh-bat-row">
              <div style={{ paddingLeft: '48px' }}>
                <span>{nonStriker?.name || "BATTER 2"}</span>
              </div>
              <div className="skyh-bat-nums">
                {nonStriker?.runs || 0} <span style={{ color: '#8e929b', fontSize: '13px' }}>({nonStriker?.balls || 0})</span>
              </div>
            </div>
          </div>

          {/* Bowler & Over Tracker */}
          <div className="skyh-bowler-col">
            <div className="skyh-bowler-meta">
              <span className="skyh-bowler-lbl">BOWLING</span>
              <span className="skyh-bowler-name">{bowler?.name || "BOWLER"}</span>
              <span className="skyh-bowler-figs">
                {bowler?.wickets || 0}-{bowler?.runs || 0} (ECON: {getEcon(bowler)})
              </span>
            </div>

            <div className="skyh-delivery-track">
              {Array.from({ length: Math.max(bpo, recentBalls.length) }).map((_, i) => {
                const b = recentBalls[i] || '';
                const type = getBallBadgeType(b);
                let cls = 'skyh-ball-pill';
                if (type === 'four') cls += ' b-four';
                else if (type === 'six') cls += ' b-six';
                else if (type === 'wicket') cls += ' b-wicket';
                return (
                  <div key={i} className={cls}>
                    {b === '•' ? '0' : b}
                  </div>
                );
              })}
            </div>

            <TeamLogo src={getAbsoluteUrl(match.leagueLogo)} teamName={match.bowlingTeam} size={46} style={{ marginLeft: '12px' }} />
          </div>
        </div>

        {/* 2nd Innings Target Strip */}
        {match.isSecondInnings && runsNeeded > 0 && (
          <div className="mbo-target-strip mbo-target-sky">
            <span>TARGET: <strong>{match.targetScore}</strong> | NEED <strong>{runsNeeded} RUNS</strong> IN <strong>{remainBalls} BALLS</strong></span>
            <span>RRR: <strong>{rrr}</strong> | CRR: <strong>{crr}</strong></span>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. JIO_TITAN — JIO PREMIER LEAGUE TITAN (IPL Gold & Navy 4K)
  // ══════════════════════════════════════════════════════════════════════════
  if (layoutId === 'JIO_TITAN') {
    return (
      <div className={`mbo-wrapper jio-wrapper ${skinClass}`}>
        {renderEventBanner()}

        <div className="jio-board">
          {/* Batting Team & 3D Gold Score */}
          <div className="jio-team-pill">
            <div className="jio-logo-halo">
              <TeamLogo src={getAbsoluteUrl(match.battingLogo)} teamName={match.battingTeam} size={50} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="jio-team-name">{match.battingTeam || "TEAM 1"}</span>
              <span style={{ fontSize: '11px', color: '#e5b842', fontWeight: 800 }}>
                {match.tournamentName || "TATA IPL 2026"}
              </span>
            </div>
            <div className="jio-score-badge">
              <div className={`jio-score ${scoreAnimClass ? 'mbo-score-pop' : ''}`}>
                {match.score}/{match.wickets}
              </div>
              <div className="jio-overs">{oversStr} / {maxOvers} OVERS</div>
            </div>
          </div>

          {/* Batsmen */}
          <div className="jio-bat-section">
            <div className="jio-bat-row striker">
              <div>
                <span className="jio-star-icon">★</span>
                <span>{striker?.name || "BATTER 1"}</span>
              </div>
              <div>
                <strong style={{ color: '#ffd700', fontSize: '17px' }}>{striker?.runs || 0}</strong>
                <span style={{ color: '#9ca3af', fontSize: '13px' }}> ({striker?.balls || 0})</span>
              </div>
            </div>
            <div className="jio-bat-row">
              <div style={{ paddingLeft: '17px' }}>
                <span>{nonStriker?.name || "BATTER 2"}</span>
              </div>
              <div>
                <strong style={{ color: '#fff', fontSize: '17px' }}>{nonStriker?.runs || 0}</strong>
                <span style={{ color: '#9ca3af', fontSize: '13px' }}> ({nonStriker?.balls || 0})</span>
              </div>
            </div>
          </div>

          {/* Bowler & Over Tracker */}
          <div className="jio-bowl-section">
            <div className="jio-bowl-meta">
              <span className="jio-bowl-title">CURRENT BOWLER</span>
              <span className="jio-bowl-name">{bowler?.name || "BOWLER"}</span>
              <span className="jio-bowl-figs">
                {bowler?.wickets || 0}-{bowler?.runs || 0} ({getOvers(Math.round((bowler?.overs || 0) * bpo))})
              </span>
            </div>

            <div className="jio-balls-track">
              {Array.from({ length: Math.max(bpo, recentBalls.length) }).map((_, i) => {
                const b = recentBalls[i] || '';
                const type = getBallBadgeType(b);
                let cls = 'jio-ball';
                if (type === 'four') cls += ' j-four';
                else if (type === 'six') cls += ' j-six';
                else if (type === 'wicket') cls += ' j-w';
                return (
                  <div key={i} className={cls}>
                    {b === '•' ? '0' : b}
                  </div>
                );
              })}
            </div>

            <TeamLogo src={getAbsoluteUrl(match.leagueLogo)} teamName={match.bowlingTeam} size={48} style={{ marginLeft: '12px' }} />
          </div>
        </div>

        {/* 2nd Innings Target Strip */}
        {match.isSecondInnings && runsNeeded > 0 && (
          <div className="mbo-target-strip mbo-target-jio">
            <span>{match.battingTeam} NEED <strong>{runsNeeded} RUNS</strong> IN <strong>{remainBalls} BALLS</strong></span>
            <span>TARGET: <strong>{match.targetScore}</strong> | RRR: <strong>{rrr}</strong></span>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. FOX_STRIKE — FOX CRICKET BBL STRIKE (Australia Action Slant)
  // ══════════════════════════════════════════════════════════════════════════
  if (layoutId === 'FOX_STRIKE') {
    return (
      <div className={`mbo-wrapper fox-wrapper ${skinClass}`}>
        {renderEventBanner()}

        <div className="fox-board">
          {/* Batting Team & Blazing Score */}
          <div className="fox-team-block">
            <TeamLogo src={getAbsoluteUrl(match.battingLogo)} teamName={match.battingTeam} size={50} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="fox-team-name">{match.battingTeam || "TEAM 1"}</span>
              <span style={{ fontSize: '11px', color: '#ffb700', fontWeight: 900 }}>
                {match.tournamentName || "FOX CRICKET LIVE"}
              </span>
            </div>
            <div className="fox-score-wrap">
              <div className={`fox-score ${scoreAnimClass ? 'mbo-score-pop' : ''}`}>
                {match.score}/{match.wickets}
              </div>
              <div className="fox-overs">{oversStr} ({maxOvers} OV)</div>
            </div>
          </div>

          {/* Batsmen */}
          <div className="fox-bat-block">
            <div className="fox-bat-row striker">
              <div>
                <span className="fox-fire-arrow">▶</span>
                <span>{striker?.name || "BATTER 1"}</span>
              </div>
              <div>
                <span style={{ color: '#fff', fontSize: '18px' }}>{striker?.runs || 0}</span>
                <span style={{ color: '#9ca3af', fontSize: '13px' }}> ({striker?.balls || 0})</span>
              </div>
            </div>
            <div className="fox-bat-row">
              <div style={{ paddingLeft: '17px' }}>
                <span>{nonStriker?.name || "BATTER 2"}</span>
              </div>
              <div>
                <span style={{ color: '#fff', fontSize: '18px' }}>{nonStriker?.runs || 0}</span>
                <span style={{ color: '#9ca3af', fontSize: '13px' }}> ({nonStriker?.balls || 0})</span>
              </div>
            </div>
          </div>

          {/* Bowler & Over Tracker */}
          <div className="fox-bowl-block">
            <div className="fox-bowl-meta">
              <span className="fox-bowl-title">BOWLER</span>
              <span className="fox-bowl-name">{bowler?.name || "BOWLER"}</span>
              <span className="fox-bowl-figs">
                {bowler?.wickets || 0}-{bowler?.runs || 0} ({getOvers(Math.round((bowler?.overs || 0) * bpo))})
              </span>
            </div>

            <div className="fox-ball-track">
              {Array.from({ length: Math.max(bpo, recentBalls.length) }).map((_, i) => {
                const b = recentBalls[i] || '';
                const type = getBallBadgeType(b);
                let cls = 'fox-ball';
                if (type === 'four') cls += ' f-four';
                else if (type === 'six') cls += ' f-six';
                else if (type === 'wicket') cls += ' f-w';
                return (
                  <div key={i} className={cls}>
                    {b === '•' ? '0' : b}
                  </div>
                );
              })}
            </div>

            <TeamLogo src={getAbsoluteUrl(match.leagueLogo)} teamName={match.bowlingTeam} size={48} style={{ marginLeft: '12px' }} />
          </div>
        </div>

        {/* 2nd Innings Target Strip */}
        {match.isSecondInnings && runsNeeded > 0 && (
          <div className="mbo-target-strip mbo-target-fox">
            <span>{match.battingTeam} REQUIRE <strong>{runsNeeded} RUNS</strong> IN <strong>{remainBalls} BALLS</strong></span>
            <span>TARGET: <strong>{match.targetScore}</strong> | RRR: <strong>{rrr}</strong></span>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. SUPERSPORT_AURA — SUPERSPORT AURA GLASS (International Glassmorphism)
  // ══════════════════════════════════════════════════════════════════════════
  if (layoutId === 'SUPERSPORT_AURA') {
    return (
      <div className={`mbo-wrapper ss-wrapper ${skinClass}`}>
        {renderEventBanner()}

        <div className="ss-board">
          {/* Batting Team & Emerald Score */}
          <div className="ss-team-box">
            <TeamLogo src={getAbsoluteUrl(match.battingLogo)} teamName={match.battingTeam} size={50} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="ss-team-name">{match.battingTeam || "TEAM 1"}</span>
              <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 800 }}>
                {match.tournamentName || "INTERNATIONAL CRICKET"}
              </span>
            </div>
            <div className="ss-score-box">
              <div className={`ss-score ${scoreAnimClass ? 'mbo-score-pop' : ''}`}>
                {match.score}-{match.wickets}
              </div>
              <div className="ss-overs">{oversStr} / {maxOvers} OVERS</div>
            </div>
          </div>

          {/* Batsmen */}
          <div className="ss-bat-box">
            <div className="ss-bat-row striker">
              <div>
                <span className="ss-dot-strike" />
                <span>{striker?.name || "BATTER 1"}</span>
              </div>
              <div>
                <strong style={{ color: '#34d399', fontSize: '17px' }}>{striker?.runs || 0}</strong>
                <span style={{ color: '#94a3b8', fontSize: '13px' }}> ({striker?.balls || 0})</span>
              </div>
            </div>
            <div className="ss-bat-row">
              <div style={{ paddingLeft: '12px' }}>
                <span>{nonStriker?.name || "BATTER 2"}</span>
              </div>
              <div>
                <strong style={{ color: '#fff', fontSize: '17px' }}>{nonStriker?.runs || 0}</strong>
                <span style={{ color: '#94a3b8', fontSize: '13px' }}> ({nonStriker?.balls || 0})</span>
              </div>
            </div>
          </div>

          {/* Bowler & Over Tracker */}
          <div className="ss-bowl-box">
            <div className="ss-bowl-meta">
              <span className="ss-bowl-tag">BOWLING</span>
              <span className="ss-bowl-name">{bowler?.name || "BOWLER"}</span>
              <span className="ss-bowl-figs">
                {bowler?.wickets || 0}-{bowler?.runs || 0} ({getOvers(Math.round((bowler?.overs || 0) * bpo))})
              </span>
            </div>

            <div className="ss-ball-track">
              {Array.from({ length: Math.max(bpo, recentBalls.length) }).map((_, i) => {
                const b = recentBalls[i] || '';
                const type = getBallBadgeType(b);
                let cls = 'ss-ball';
                if (type === 'four') cls += ' s-four';
                else if (type === 'six') cls += ' s-six';
                else if (type === 'wicket') cls += ' s-w';
                return (
                  <div key={i} className={cls}>
                    {b === '•' ? '0' : b}
                  </div>
                );
              })}
            </div>

            <TeamLogo src={getAbsoluteUrl(match.leagueLogo)} teamName={match.bowlingTeam} size={48} style={{ marginLeft: '12px' }} />
          </div>
        </div>

        {/* 2nd Innings Target Strip */}
        {match.isSecondInnings && runsNeeded > 0 && (
          <div className="mbo-target-strip mbo-target-ss">
            <span>{match.battingTeam} NEED <strong>{runsNeeded} RUNS</strong> FROM <strong>{remainBalls} BALLS</strong></span>
            <span>TARGET: <strong>{match.targetScore}</strong> | RRR: <strong>{rrr}</strong></span>
          </div>
        )}
      </div>
    );
  }

  return null;
}

