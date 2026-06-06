import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { ref, onValue, update } from "firebase/database";
import { db } from "../firebase";
import { matchesApi } from "../api";
import "./ControlRoom.css";

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;
const isMongoDB = (id) => id && id.startsWith('KS-');
const createMatchEvent = (trigger) => ({ eventTrigger: trigger, timestamp: Date.now() });

export default function ControlRoom() {
    const { idOrSlug } = useParams();
    const matchId = idOrSlug;
    const dbPath = `matches/${matchId}`;
    const tickerPath = `ticker/${matchId}`;
    
    const [match, setMatch] = useState(null);
    const [history, setHistory] = useState([]);
    
    const [tickerMsg, setTickerMsg] = useState("");
    const [tickerMode, setTickerMode] = useState("banner");
    const [tickerVisible, setTickerVisible] = useState(false);
    const [tickerAutoRepeat, setTickerAutoRepeat] = useState(false);

    // ── DUAL-MODE DATA SYNC ──
    useEffect(() => {
        if (isMongoDB(matchId)) {
            matchesApi.get(matchId)
                .then(res => {
                    if (res.match) {
                        const flattenedMatch = {
                            ...res.match,
                            themeID: res.match.overlaySettings?.themeID || 'IPL_GOLD',
                            battingLogo: res.match.overlaySettings?.battingLogo || '',
                            leagueLogo: res.match.overlaySettings?.leagueLogo || '',
                            showVersus: res.match.overlaySettings?.showVersus || false,
                            showSummary: res.match.overlaySettings?.showSummary || false,
                            showMatchSituation: res.match.overlaySettings?.showMatchSituation || false
                        };
                        setMatch(flattenedMatch);
                    }
                })
                .catch(() => {});
            
            let socket;
            import('socket.io-client').then(({ io }) => {
                socket = io(`${API_URL}/admin`, {
                    query: { matchId },
                    transports: ['websocket', 'polling'],
                });
                socket.on('connection:ack', ({ snapshot }) => { if (snapshot) setMatch(prev => prev ? { ...prev, ...snapshot } : snapshot); });
                socket.on('score:update', (data) => setMatch(prev => prev ? { ...prev, ...data } : data));
                socket.on('score:correction', (data) => setMatch(prev => prev ? { ...prev, ...data } : data));
                socket.on('players:update', (data) => setMatch(prev => prev ? { ...prev, ...data } : data));
                socket.on('ticker:update', (data) => {
                    if (data.ticker) {
                        setTickerMsg(data.ticker.message || '');
                        setTickerMode(data.ticker.mode || 'banner');
                        setTickerVisible(!!data.ticker.visible);
                        setTickerAutoRepeat(data.ticker.autoRepeat || false);
                    }
                });
            }).catch(() => {});
            return () => { if (socket) socket.disconnect(); };
        } else {
            const unsub = onValue(ref(db, dbPath), (snap) => {
                const d = snap.val();
                if (d) setMatch(d);
            });
            return () => unsub();
        }
    }, [matchId, dbPath]);

    // ── TICKER SYNC (Legacy) ──
    useEffect(() => {
        if (isMongoDB(matchId)) return;
        const unsub = onValue(ref(db, tickerPath), (snap) => {
            const d = snap.val();
            if (d) {
                setTickerMsg(d.message || "");
                setTickerMode(d.mode || "banner");
                setTickerVisible(!!d.visible);
                setTickerAutoRepeat(d.autoRepeat || false);
            }
        });
        return () => unsub();
    }, [matchId, tickerPath]);

    // ── HELPERS ──
    const push = useCallback((changes) => {
        if (isMongoDB(matchId)) {
            setMatch(prev => prev ? { ...prev, ...changes } : changes);
            let hasPlayers = false;
            let hasGeneric = false;
            const playerChanges = {};
            const genericChanges = {};

            for (const key in changes) {
                if (['player1', 'player2', 'bowler', 'battingSquad', 'bowlingSquad'].includes(key)) {
                    hasPlayers = true;
                    playerChanges[key] = changes[key];
                } else {
                    hasGeneric = true;
                    genericChanges[key] = changes[key];
                }
            }

            if (hasPlayers) matchesApi.updatePlayers(matchId, playerChanges).then(res => { if (res.match && !hasGeneric) setMatch(res.match); }).catch(() => {});
            if (hasGeneric) matchesApi.updateMatch(matchId, genericChanges).catch(() => {});
        } else {
            const payload = changes?.eventTrigger ? { ...changes, ...createMatchEvent(changes.eventTrigger) } : changes;
            update(ref(db, dbPath), payload);
        }
    }, [matchId, dbPath]);

    const pushTicker = (overrides = {}) => {
        if (isMongoDB(matchId)) {
            matchesApi.toggleTicker(matchId, {
                message: overrides.message ?? tickerMsg,
                mode: overrides.mode ?? tickerMode,
                visible: overrides.visible ?? tickerVisible,
                autoRepeat: overrides.autoRepeat ?? tickerAutoRepeat,
            }).then(res => {
                if (res.ticker) {
                    setTickerMsg(res.ticker.message || '');
                    setTickerMode(res.ticker.mode || 'banner');
                    setTickerVisible(!!res.ticker.visible);
                }
            }).catch(() => {});
            return;
        }
        update(ref(db, tickerPath), {
            message: overrides.message ?? tickerMsg,
            mode: overrides.mode ?? tickerMode,
            visible: overrides.visible ?? tickerVisible,
            autoRepeat: overrides.autoRepeat ?? tickerAutoRepeat,
            updatedAt: Date.now()
        });
    };

    // ── ACTIONS ──
    const handleScore = (runs, isBoundary = false) => {
        if (!match) return;
        setHistory(h => [...h, match]);
        
        if (isMongoDB(matchId)) {
            const delivery = isBoundary ? (runs === 4 ? '4' : '6') : String(runs);
            matchesApi.updateScore(matchId, { delivery, extraRuns: 0 })
                .then(res => { if (res.match) setMatch(res.match); })
                .catch(() => alert("Failed to record score."));
        } else {
            const newScore = (match.score || 0) + runs;
            const newBalls = (match.legalBallCount || 0) + 1;
            const newTotal = (match.totalBalls || 0) + 1;
            let updatedP1 = { ...match.player1 };
            let updatedP2 = { ...match.player2 };
            let active = updatedP1.onStrike ? updatedP1 : updatedP2;
            active.runs = (active.runs || 0) + runs;
            active.balls = (active.balls || 0) + 1;
            if (runs === 4) active.fours = (active.fours || 0) + 1;
            if (runs === 6) active.sixes = (active.sixes || 0) + 1;
            if (runs % 2 !== 0) {
                updatedP1.onStrike = !updatedP1.onStrike;
                updatedP2.onStrike = !updatedP2.onStrike;
            }
            if (newBalls % 6 === 0) {
                updatedP1.onStrike = !updatedP1.onStrike;
                updatedP2.onStrike = !updatedP2.onStrike;
            }
            push({
                score: newScore, legalBallCount: newBalls, totalBalls: newTotal,
                player1: updatedP1, player2: updatedP2, eventTrigger: runs === 4 ? "FOUR" : runs === 6 ? "SIX" : `RUNS_${runs}`
            });
        }
    };

    const handleWicket = () => {
        if (!match) return;
        setHistory(h => [...h, match]);
        if (isMongoDB(matchId)) {
            matchesApi.updateScore(matchId, { delivery: 'wicket', extraRuns: 0 })
                .then(res => { if (res.match) setMatch(res.match); })
                .catch(() => alert("Failed to record wicket."));
        } else {
            const newWickets = (match.wickets || 0) + 1;
            const newBalls = (match.legalBallCount || 0) + 1;
            const newTotal = (match.totalBalls || 0) + 1;
            let updatedP1 = { ...match.player1 };
            let updatedP2 = { ...match.player2 };
            let active = updatedP1.onStrike ? updatedP1 : updatedP2;
            active.balls = (active.balls || 0) + 1;
            push({
                wickets: newWickets, legalBallCount: newBalls, totalBalls: newTotal,
                player1: updatedP1, player2: updatedP2, eventTrigger: "WICKET"
            });
        }
    };

    const handleExtra = (type) => {
        if (!match) return;
        setHistory(h => [...h, match]);
        if (isMongoDB(matchId)) {
            matchesApi.updateScore(matchId, { delivery: type, extraRuns: 0 })
                .then(res => { if (res.match) setMatch(res.match); })
                .catch(() => alert(`Failed to record ${type}.`));
        } else {
            const newScore = (match.score || 0) + 1;
            const newTotal = (match.totalBalls || 0) + 1;
            let newBalls = match.legalBallCount || 0;
            if (['byes', 'lb'].includes(type)) newBalls += 1; // legal deliveries
            
            let extras = { ...(match.extras || { wides: 0, noballs: 0, legbyes: 0, byes: 0, total: 0 }) };
            extras.total = (extras.total || 0) + 1;
            if (type === 'wide') extras.wides = (extras.wides || 0) + 1;
            if (type === 'noball') extras.noballs = (extras.noballs || 0) + 1;
            if (type === 'lb') extras.legbyes = (extras.legbyes || 0) + 1;
            if (type === 'byes') extras.byes = (extras.byes || 0) + 1;
            
            push({ score: newScore, totalBalls: newTotal, legalBallCount: newBalls, extras });
        }
    };

    const handleUndo = async () => {
        if (isMongoDB(matchId)) {
            try {
                const res = await matchesApi.undoLastBall(matchId);
                if (res.match) setMatch(res.match);
            } catch (err) {
                alert("Undo failed.");
            }
        } else {
            if (history.length === 0) return;
            const prev = history[history.length - 1];
            setHistory(h => h.slice(0, -1));
            update(ref(db, dbPath), prev);
        }
    };

    const handleToggleStrike = () => {
        if (!match) return;
        push({
            player1: { ...match.player1, onStrike: !match.player1?.onStrike },
            player2: { ...match.player2, onStrike: !match.player2?.onStrike }
        });
    };

    const getOvers = (balls) => `${Math.floor((balls || 0) / 6)}.${(balls || 0) % 6}`;

    if (!match) return <div className="cr-root" style={{alignItems:'center', justifyContent:'center'}}>Loading...</div>;

    const bpo = match.ballsPerOver || 6;
    const remainingBalls = match.isSecondInnings ? ((match.targetBalls || 120) - (match.legalBallCount || 0)) : 0;
    const crr = match.legalBallCount > 0 ? (match.score / (match.legalBallCount / bpo)).toFixed(2) : "0.00";
    const rrr = match.isSecondInnings && remainingBalls > 0 ? ((match.targetScore - match.score) / (remainingBalls / bpo)).toFixed(2) : "--";
    const striker = match.player1?.onStrike ? match.player1 : match.player2;
    const nonStriker = match.player1?.onStrike ? match.player2 : match.player1;

    return (
        <div className="cr-root">
            <div className="cr-header">
                <div>CRICKET SCORING <span style={{fontSize: '0.9rem', color: '#64748b', fontWeight: 'normal', marginLeft: '12px'}}>{match.matchTitle}</span></div>
                <button className="cr-exit-btn" onClick={() => window.close()}>EXIT DESKTOP</button>
            </div>

            <div className="cr-main-grid">
                {/* ── LEFT PANEL: SCORES & BUTTONS ── */}
                <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                    
                    {/* Score Box */}
                    <div className="cr-panel" style={{padding: '0', overflow: 'hidden'}}>
                        <div className="cr-teams-banner">
                            <div className="cr-team-a">{match.battingTeam || "TEAM A"}</div>
                            <div className="cr-team-vs">VS</div>
                            <div className="cr-team-b">{match.bowlingTeam || "TEAM B"}</div>
                        </div>
                        <div className="cr-score-details">
                            <div className="cr-score-col">
                                <span className="cr-score-label">RUNS / WKTS</span>
                                <span className="cr-score-val text-yellow">{match.score}/{match.wickets}</span>
                            </div>
                            <div className="cr-score-col">
                                <span className="cr-score-label">OVERS</span>
                                <span className="cr-score-val text-yellow">{getOvers(match.legalBallCount)}</span>
                            </div>
                            <div className="cr-score-col">
                                <span className="cr-score-label">BALLS</span>
                                <span className="cr-score-val">{match.totalBalls || 0}</span>
                            </div>
                            <div className="cr-score-col">
                                <span className="cr-score-label">TARGET</span>
                                <span className="cr-score-val">{match.isSecondInnings ? match.targetScore : "0"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Actions Box */}
                    <div className="cr-scoring-controls">
                        <div className="cr-top-actions">
                            <button className="cr-action-btn green">NEW GAME</button>
                            <button className="cr-action-btn red" onClick={handleUndo}>UNDO</button>
                            <button className="cr-action-btn">2nd Inn</button>
                        </div>

                        <div className="cr-extras-grid">
                            <button className="cr-extra-btn" style={{color: '#f87171'}} onClick={handleWicket}>W</button>
                            <button className="cr-extra-btn" onClick={() => push({ eventTrigger: 'EDIT' })}>EDIT</button>
                            <button className="cr-extra-btn" onClick={() => handleExtra('lb')}>LB</button>
                            <button className="cr-extra-btn" onClick={() => handleExtra('noball')}>NB</button>
                            <button className="cr-extra-btn" onClick={() => handleExtra('wide')}>WD</button>
                        </div>

                        <div className="cr-runs-grid">
                            {[0, 1, 2, 3, 4, 6].map(r => (
                                <button key={r} className="cr-run-btn" onClick={() => handleScore(r, [4,6].includes(r))}>
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── MIDDLE PANEL: PLAYERS ── */}
                <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                    
                    {/* Batters */}
                    <div className="cr-batters-grid">
                        <div className="cr-batter-card">
                            <div className="cr-batter-name">
                                {striker?.name || "BATSMAN A"} 
                                <span style={{color: '#facc15'}}>*</span>
                            </div>
                            <div className="cr-batter-stats">
                                <div className="cr-stat-col"><span className="cr-stat-label">Runs</span><span className="cr-stat-val">{striker?.runs || 0}</span></div>
                                <div className="cr-stat-col"><span className="cr-stat-label">Balls</span><span className="cr-stat-val">{striker?.balls || 0}</span></div>
                                <div className="cr-stat-col"><span className="cr-stat-label">4s</span><span className="cr-stat-val">{striker?.fours || 0}</span></div>
                                <div className="cr-stat-col"><span className="cr-stat-label">6s</span><span className="cr-stat-val">{striker?.sixes || 0}</span></div>
                                <div className="cr-stat-col"><span className="cr-stat-label">SR</span><span className="cr-stat-val">{striker?.balls ? ((striker.runs/striker.balls)*100).toFixed(0) : 0}</span></div>
                            </div>
                        </div>

                        <button className="cr-change-striker-btn" onClick={handleToggleStrike}>Change<br/>Striker<br/>{'< >'}</button>

                        <div className="cr-batter-card">
                            <div className="cr-batter-name">{nonStriker?.name || "BATSMAN B"}</div>
                            <div className="cr-batter-stats">
                                <div className="cr-stat-col"><span className="cr-stat-label">Runs</span><span className="cr-stat-val">{nonStriker?.runs || 0}</span></div>
                                <div className="cr-stat-col"><span className="cr-stat-label">Balls</span><span className="cr-stat-val">{nonStriker?.balls || 0}</span></div>
                                <div className="cr-stat-col"><span className="cr-stat-label">4s</span><span className="cr-stat-val">{nonStriker?.fours || 0}</span></div>
                                <div className="cr-stat-col"><span className="cr-stat-label">6s</span><span className="cr-stat-val">{nonStriker?.sixes || 0}</span></div>
                                <div className="cr-stat-col"><span className="cr-stat-label">SR</span><span className="cr-stat-val">{nonStriker?.balls ? ((nonStriker.runs/nonStriker.balls)*100).toFixed(0) : 0}</span></div>
                            </div>
                        </div>
                    </div>

                    {/* Bowler Details */}
                    <div className="cr-bowler-card">
                        <div className="cr-panel-title">Bowler Details</div>
                        <div style={{display: 'flex', gap: '16px', alignItems: 'center', marginTop: '8px'}}>
                            <div style={{flex: 1}}>
                                <input type="text" className="cr-action-btn" style={{width: '100%', textAlign: 'left', background: 'transparent'}} value={match.bowler?.name || "SELECT BOWLER"} readOnly />
                            </div>
                            <div className="cr-stat-col"><span className="cr-stat-label">Runs</span><span className="cr-stat-val">{match.bowler?.runs || 0}</span></div>
                            <div className="cr-stat-col"><span className="cr-stat-label">Wickets</span><span className="cr-stat-val">{match.bowler?.wickets || 0}</span></div>
                            <div className="cr-stat-col"><span className="cr-stat-label">Overs</span><span className="cr-stat-val">{match.bowler?.overs || "0.0"}</span></div>
                            <div className="cr-stat-col"><span className="cr-stat-label">Balls</span><span className="cr-stat-val">{match.bowler?.legalBalls || 0}</span></div>
                        </div>
                    </div>

                    {/* Switcher Controls */}
                    <div className="cr-panel">
                        <div className="cr-panel-title">Overlay Switcher</div>
                        <div className="cr-switcher-grid">
                            <button className={`cr-switch-btn ${match.showVersus ? 'active' : ''}`} onClick={() => push({ showVersus: !match.showVersus })}>FULL SCREEN VS</button>
                            <button className="cr-switch-btn">TOSS & WIN</button>
                            <button className="cr-switch-btn">BATS A SCORE</button>
                            <button className="cr-switch-btn">TEAM SCORE</button>

                            <button className="cr-switch-btn">TEAM LISTS</button>
                            <button className={`cr-switch-btn ${match.overlayMode === 'full' ? 'active' : ''}`} onClick={() => push({ overlayMode: match.overlayMode === 'full' ? 'hidden' : 'full' })}>SCOREBOARD 1</button>
                            <button className="cr-switch-btn">BATS B SCORE</button>
                            <button className={`cr-switch-btn ${match.showMatchSituation ? 'active' : ''}`} onClick={() => push({ showMatchSituation: !match.showMatchSituation })}>NEED RUNS</button>

                            <button className={`cr-switch-btn ${match.showSummary ? 'active' : ''}`} onClick={() => push({ showSummary: !match.showSummary })}>FULL SUMMARY</button>
                            <button className="cr-switch-btn">BOWLER SCORE</button>
                            <button className={`cr-switch-btn ${tickerVisible ? 'active' : ''}`} onClick={() => pushTicker({ visible: !tickerVisible })}>TICKER</button>
                            <button className="cr-switch-btn" onClick={() => window.open(`/overlay/${matchId}`, '_blank')}>STREAM / PREVIEW</button>
                        </div>
                    </div>

                </div>

                {/* ── RIGHT PANEL: MATCH INFO ── */}
                <div className="cr-panel">
                    <div className="cr-panel-title">Match Info</div>
                    <div className="cr-info-grid">
                        <span className="cr-info-label">Current Over</span>
                        <span className="cr-info-val text-yellow">{match.currentOver || 1}</span>
                        
                        <span className="cr-info-label">Remaining Balls</span>
                        <span className="cr-info-val">{remainingBalls}</span>

                        <span className="cr-info-label">Current Run Rate</span>
                        <span className="cr-info-val">{crr}</span>

                        <span className="cr-info-label">Required Run Rate</span>
                        <span className="cr-info-val">{rrr}</span>

                        <span className="cr-info-label">Projected Score</span>
                        <span className="cr-info-val">{match.legalBallCount > 0 ? Math.floor(crr * (match.maxOvers || 20)) : 0}</span>

                        <span className="cr-info-label">Total Sixes</span>
                        <span className="cr-info-val">{match.totalSixes || 0}</span>

                        <span className="cr-info-label">Total Fours</span>
                        <span className="cr-info-val">{match.totalFours || 0}</span>

                        <span className="cr-info-label">Extras</span>
                        <span className="cr-info-val">{match.extras?.total || 0}</span>
                    </div>
                </div>

            </div>
        </div>
    );
}
