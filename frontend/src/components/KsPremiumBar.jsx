import React from "react";
import "./ks-premium.css";

/** KS Premium scorebar (moved out of ScorecardDisplay so the theme gallery can show it too). */
export default function KsPremiumBar({ match, getAbsoluteUrl, TeamLogo, getOvers, scoreAnimClass, showEvent, eventType, eventWicketName, getHowOutText, showOverBreakChase }) {
            const bpo = match.ballsPerOver || 6;
            const balls = match.recentBalls || [];
            const legalDeliveries = match.legalBallCount ?? match.totalBalls ?? 0;
            const totalMatchBallsKSP = (match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * (match.ballsPerOver || 6));
            const remainKSP = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, totalMatchBallsKSP - legalDeliveries);
            const runsNeeded = match.isSecondInnings ? Math.max(0, match.targetScore - match.score) : 0;
            
            return (
              <div className="ksp-wrapper">
                <div className="ksp-board">
                  <div className="ksp-bg-pattern" />

                  {/* Top Mini Bar */}
                  <div className="ksp-top-bar">
                    <div className="ksp-live-dot" />
                    {match.isSecondInnings ? `TARGET : ${match.targetScore}` : '1st Inning'}
                  </div>

                  {/* Left Block: Logo, Team, Score */}
                  <div className="ksp-left">
                    <TeamLogo src={getAbsoluteUrl(match.battingLogo)} teamName={match.battingTeam} className="ksp-logo" size={56} />
                    <div className="ksp-team-info">
                      <div className="ksp-team-name">{match.battingTeam}</div>
                      <div className="ksp-tournament">{match.tournamentName || "PREMIER LEAGUE"}</div>
                    </div>
                    <div className="ksp-score-wrapper" style={{ marginLeft: 'auto' }}>
                      <div className={`ksp-score ${scoreAnimClass ? 'ksp-score-update' : ''}`}>{match.score}-{match.wickets}</div>
                      <div className="ksp-overs">{getOvers(match.legalBallCount ?? match.totalBalls)} <span className="ksp-overs-max">({match.maxOvers} ov)</span></div>
                    </div>
                  </div>

                  {/* Center Block: Target OR Batters */}
                  <div className="ksp-center">
                    {/* Event Banner (inside center so score on left stays visible) */}
                    {showEvent && ["FOUR", "SIX", "WICKET"].includes(eventType) && (
                      <div className={`ksp-event-banner ksp-event-${eventType.toLowerCase()}`}>
                        <div className="ksp-sweep" />
                        <div className="ksp-event-text">
                          {eventType === "WICKET" 
                            ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontSize: '32px', marginBottom: '-5px' }}>{eventWicketName} OUT!</span>
                                <span style={{ fontSize: '14px', color: '#ffcc00' }}>{getHowOutText()}</span>
                              </div>
                            : eventType === "FOUR" ? "FOUR!" : "SIX!"}
                        </div>
                      </div>
                    )}

                    {match.isSecondInnings && (runsNeeded > 0) && (remainKSP <= 30) ? (
                      <div className="ksp-target-box">
                        <div className="ksp-target-text">
                          {match.battingTeam} NEED <span className="ksp-target-highlight">{runsNeeded}</span> MORE FROM <span className="ksp-target-highlight">{remainKSP}</span> BALLS
                        </div>
                      </div>
                    ) : (
                      <div className="ksp-stats-grid">
                        <div style={{ zIndex: 2, display: 'flex', flexDirection: 'column', justifySelf: 'stretch', width: '100%' }}>
                          <div className="ksp-batter-row" style={{ color: match.player1 ? '#fff' : '#aaa' }}>
                            <div className="ksp-batter-name">
                              <span className="ksp-striker-arrow" style={{ opacity: match.player1?.onStrike ? 1 : 0, transition: 'opacity 0.2s' }}><Play size="1em" fill="currentColor" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span> {match.player1?.name || 'SELECT P1'}
                            </div>
                            <div>
                              <span className="ksp-batter-runs">{match.player1?.runs || 0}</span> <span className="ksp-batter-balls">{match.player1?.balls || 0}</span>
                            </div>
                          </div>
                          <div className="ksp-batter-row" style={{ color: match.player2 ? '#fff' : '#aaa' }}>
                            <div className="ksp-batter-name">
                              <span className="ksp-striker-arrow" style={{ opacity: match.player2?.onStrike ? 1 : 0, transition: 'opacity 0.2s' }}><Play size="1em" fill="currentColor" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span> {match.player2?.name || 'SELECT P2'}
                            </div>
                            <div>
                              <span className="ksp-batter-runs">{match.player2?.runs || 0}</span> <span className="ksp-batter-balls">{match.player2?.balls || 0}</span>
                            </div>
                          </div>
                        </div>
                        <div className="ksp-bowler-section">
                          <div className="ksp-bowler-title">BOWLING : {match.bowlingTeam}</div>
                          <div className="ksp-bowler-row">
                            <div className="ksp-bowler-name">{match.bowler?.name || 'SELECT BOWLER'}</div>
                            <div className="ksp-bowler-figs">
                              {match.bowler?.figures || '0-0 (0.0)'}
                            </div>
                          </div>
                          {match.partnership && match.partnership.runs > 0 && (
                            <div className="ksp-partnership">
                              P'SHIP: {match.partnership.runs} ({match.partnership.balls})
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Block: Bowling Logo */}
                  <div className="ksp-right">
                    <TeamLogo src={getAbsoluteUrl(match.leagueLogo)} teamName={match.bowlingTeam} className="ksp-bowling-logo" size={56} />
                  </div>
                </div>

                {/* Bottom Ball Tracker */}
                <div className="ksp-ball-tracker">
                  {/* FIX 5: Over-break chase display for 2nd innings */}
                  {showOverBreakChase && match.isSecondInnings && (() => {
                    const kspBpo = match.ballsPerOver || 6;
                    const kspLbd = match.legalBallCount ?? 0;
                    const kspTotalBalls = match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * kspBpo;
                    const kspRemain = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, kspTotalBalls - kspLbd);
                    const kspRuns = Math.max(0, (match.targetScore || 0) - (match.score || 0));
                    return kspRuns > 0 ? (
                      <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'linear-gradient(90deg, #0D47A1, #082963)',
                        border: '1px solid #FFC107',
                        borderRadius: '6px 6px 0 0',
                        padding: '4px 20px',
                        fontSize: '13px',
                        fontWeight: 800,
                        letterSpacing: '1px',
                        color: '#fff',
                        whiteSpace: 'nowrap',
                        animation: 'ksp-slide-up 0.4s ease',
                        zIndex: 20,
                      }}>
                        {match.battingTeam} NEED{' '}
                        <span style={{ color: '#FFC107', fontSize: '16px' }}>{kspRuns}</span>
                        {' '}FROM{' '}
                        <span style={{ color: '#FFC107', fontSize: '16px' }}>{kspRemain}</span>
                        {' '}BALLS
                      </div>
                    ) : null;
                  })()}
                  {Array.from({ length: Math.max(bpo, balls.length) }).map((_, i) => {
                    const b = balls[i] || '';
                    let ballClass = '';
                    if (b === '4') ballClass = 'four';
                    else if (b === '6') ballClass = 'six';
                    else if (b.includes('W')) ballClass = 'wicket';
                    else if (b.includes('WD') || b.includes('NB') || b.includes('LB') || b.includes('B')) ballClass = 'extra';
                    return (
                      <div key={i} className={`ksp-ball ${ballClass}`}>
                        {b === '•' ? '0' : b}
                      </div>
                    );
                  })}
                  <div style={{ marginLeft: '10px', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '10px', display: 'flex', alignItems: 'center', color: '#ffb900', fontSize: '12px', fontWeight: '800', letterSpacing: '1px' }}>
                    THIS OVER: {match.overRuns || 0}
                  </div>
                </div>
              </div>
            );
}
