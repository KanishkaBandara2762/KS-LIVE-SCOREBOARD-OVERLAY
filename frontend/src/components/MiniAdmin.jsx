import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase';
import { ref, onValue, update } from 'firebase/database';
import './MiniAdmin.css';
import ComboboxPlayerInput from './ComboboxPlayerInput';
import LanguageSwitcher from './LanguageSwitcher';
import { useLanguage } from '../i18n/LanguageContext';
import { createMatchEvent } from '../utils/matchEvent';
import { matchesApi, tournamentsApi, getToken } from '../api';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;
// MongoDB matches have matchId like KS-XXXXXXXX
const isMongoDB = (id) => id && (/^KS-/i.test(id) || /^MATCH-/i.test(id));

/* ═══════════════════════════════════════════════════════════════
   MiniAdmin — Full-Control Compact Console
   ──────────────────────────────────────────────────────────────
   • All AdminPanel features in a ~480px accordion layout
   • Uses update() only — never set()
   • Separate overlay_ticker listener
   • Sticky quick-score bar at bottom
   ═══════════════════════════════════════════════════════════════ */

// ── Accordion Panel ─────────────────────────────────────────────
const Section = React.memo(({ label, color, icon, open, onClick, children }) => (
    <div className={`ma-section ${open ? "ma-section-open" : ""}`}>
        <button className={`ma-section-header ma-sec-${color}`} onClick={onClick}>
            <span>{icon} {label}</span>
            <span className="ma-chevron">{open ? "▾" : "▸"}</span>
        </button>
        {open && <div className="ma-section-body">{children}</div>}
    </div>
));
Section.displayName = "Section";

const MiniAdmin = () => {
    const { t } = useLanguage();
    // ── Multi-match: derive Firebase paths from URL param ──────────────────
    const { matchId } = useParams();
    const dbPath = matchId ? `matches/${matchId}/live_match` : 'live_match';
    const tickerPath = matchId ? `matches/${matchId}/overlay_ticker` : 'overlay_ticker';

    const [match, setMatch] = useState(null);
    const [history, setHistory] = useState([]);
    const [openSections, setOpenSections] = useState({ scoring: true });
    const [overCooldown, setOverCooldown] = useState(false);
    const [showNextMatch, setShowNextMatch] = useState(false);

    // ── Run Out State ─────────────────────────────────────────────
    const [showRunOutPanel, setShowRunOutPanel] = useState(false);
    const [runOutRuns, setRunOutRuns] = useState(0);
    const [runOutPlayer, setRunOutPlayer] = useState('striker');
    const [showLivePreview, setShowLivePreview] = useState(false);
    const overlayUrl = typeof window !== "undefined" ? `${window.location.origin}/overlay/${matchId}` : `/overlay/${matchId}`;

    // ── Debounce: prevents double-click duplicate entries (100ms) ─
    const debounceRef = useRef(false);
    const debounce = (fn) => {
        if (debounceRef.current) return;
        debounceRef.current = true;
        fn();
        setTimeout(() => { debounceRef.current = false; }, 100);
    };

    // ── Ticker state ──────────────────────────────────────────────
    const [tickerMsg, setTickerMsg] = useState("");
    const [tickerMode, setTickerMode] = useState("banner");
    const [tickerPreset, setTickerPreset] = useState("final");
    const [tickerVisible, setTickerVisible] = useState(false);

    // ── Match Situation state ─────────────────────────────────────
    const [msCrr, setMsCrr] = useState("");
    const [msRrr, setMsRrr] = useState("");
    const [msTarget, setMsTarget] = useState("");
    const [msOvers, setMsOvers] = useState("");
    const [msWickets, setMsWickets] = useState("");
    const [msMsg, setMsMsg] = useState("");


    // ── DUAL-MODE DATA SYNC ─────────────────────────────────────────────────
    // MongoDB matches (KS-* format): REST API + Socket.IO
    // Legacy matches: Firebase Realtime Database
    useEffect(() => {
        if (isMongoDB(matchId)) {
            // Initial load from REST
            matchesApi.get(matchId)
                .then(res => {
                    if (res.match) {
                        // Flatten overlay settings for backward compatibility
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
            // Socket.IO live updates
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
            // Legacy Firebase
            const unsub = onValue(ref(db, dbPath), (snap) => {
                const d = snap.val();
                if (d) setMatch(d);
            });
            return () => unsub();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchId]);

    const [tickerAutoRepeat, setTickerAutoRepeat] = useState(false);

    // ── Ticker sync (Firebase legacy only) ──────────────────────────────────
    useEffect(() => {
        if (isMongoDB(matchId)) return;
        const unsub = onValue(ref(db, tickerPath), (snap) => {
            const d = snap.val();
            if (d) {
                setTickerMsg(d.message || "");
                setTickerMode(d.mode || "banner");
                setTickerPreset(d.preset || "final");
                setTickerVisible(!!d.visible);
                setTickerAutoRepeat(d.autoRepeat || false);
            }
        });
        return () => unsub();
    }, [matchId, tickerPath]);

    // ── Write helpers (dual-mode) ────────────────────────────────────────────
    const push = useCallback((changes) => {
        if (isMongoDB(matchId)) {
            // Optimistic local update
            setMatch(prev => prev ? { ...prev, ...changes } : changes);
            // Split changes into player updates and generic updates
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

            if (hasPlayers) {
                matchesApi.updatePlayers(matchId, playerChanges)
                    .then(res => { if (res.match && !hasGeneric) setMatch(res.match); })
                    .catch(() => {});
            }
            if (hasGeneric) {
                matchesApi.updateMatch(matchId, genericChanges).catch(() => {});
            }
        } else {
            const payload = changes?.eventTrigger ? { ...changes, ...createMatchEvent(changes.eventTrigger) } : changes;
            update(ref(db, dbPath), payload);
        }
    }, [matchId, dbPath, match]);

    const pushEvent = useCallback((changes, eventTrigger) => {
        if (isMongoDB(matchId)) {
            // Map to delivery type for score engine
            const deliveryMap = { WICKET: 'wicket', FOUR: '4', SIX: '6', NEW_OVER: null };
            const delivery = deliveryMap[eventTrigger];
            if (delivery) {
                setMatch(prev => prev ? { ...prev, ...changes } : changes);
                matchesApi.updateScore(matchId, { delivery, extraRuns: 0 })
                    .then(res => { if (res.match) setMatch(res.match); })
                    .catch(() => {});
            } else {
                push(changes);
            }
        } else {
            update(ref(db, dbPath), { ...changes, ...createMatchEvent(eventTrigger) });
        }
    }, [matchId, dbPath, push]);

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
            preset: overrides.preset ?? tickerPreset,
            visible: overrides.visible ?? tickerVisible,
            autoRepeat: overrides.autoRepeat ?? tickerAutoRepeat,
            timestamp: overrides.timestamp || Date.now(),
        });
    };


    // ── SMART OVERRIDE SYSTEM: Auto Decrease Balls ────────────────
    const getManualBallsUpdate = () => {
        if (match && match.manualBallsOverride && match.autoDecreaseBalls !== false) {
            return { manualBallsValue: Math.max(0, (match.manualBallsValue || 0) - 1) };
        }
        return {};
    };

    // ── Toggle accordion ─────────────────────────────────────────
    const toggle = (key) => setOpenSections(p => ({ ...p, [key]: !p[key] }));

    // ── Helpers ───────────────────────────────────────────────────
    const bpo = match?.ballsPerOver || 6;
    const overs = (balls) => `${Math.floor(balls / bpo)}.${balls % bpo}`;

    const updateOverHistory = (entry, m, runsToAdd) => {
        const recent = [...(m.recentBalls || []), entry];
        return { recentBalls: recent, overRuns: (m.overRuns || 0) + runsToAdd };
    };

    // ── Scoring functions ─────────────────────────────────────────
    // All scoring fns are wrapped in debounce() at call-site to prevent double-click.

    // pushDelivery: for MongoDB uses updateScore REST API; for Firebase uses field update
    const pushDelivery = useCallback((delivery, extraRuns = 0, firebaseChanges = {}) => {
        if (isMongoDB(matchId)) {
            matchesApi.updateScore(matchId, { delivery, extraRuns })
                .then(res => { if (res.match) setMatch(res.match); })
                .catch(() => {});
        } else {
            const payload = firebaseChanges?.eventTrigger
                ? { ...firebaseChanges, ...createMatchEvent(firebaseChanges.eventTrigger) }
                : firebaseChanges;
            update(ref(db, dbPath), payload);
        }
    }, [matchId, dbPath]);

    // addRun — handles NB follow-up: if last ball was "NB", combine into "NB+N",
    // credit runs to batter, do NOT increment ball count or legalBallCount.
    const addRun = (runs) => {
        if (!match || match.overLocked) return;
        const ak = match.player1.onStrike ? "player1" : "player2";

        const balls = match.recentBalls || [];
        const lastBall = balls[balls.length - 1];
        if (lastBall === "NB" && !isMongoDB(matchId)) {
            setHistory(h => [...h, match]);
            const entry = runs === 0 ? "NB" : `NB+${runs}`;
            const newBalls = [...balls.slice(0, -1), entry];
            const batUp = runs > 0 ? { [ak]: { ...match[ak], runs: match[ak].runs + runs } } : {};
            push({
                score: match.score + runs,
                recentBalls: newBalls,
                overRuns: (match.overRuns || 0) + runs,
                ...batUp,
            });
            return;
        }

        setHistory(h => [...h, match]);
        const { recentBalls, overRuns } = updateOverHistory(runs === 0 ? "•" : runs.toString(), match, runs);
        if (isMongoDB(matchId)) {
            pushDelivery(runs === 0 ? 'dot' : String(runs), 0, {});
        } else {
            push({
                score: match.score + runs, totalBalls: match.totalBalls + 1,
                [ak]: { ...match[ak], runs: match[ak].runs + runs, balls: match[ak].balls + 1 },
                recentBalls, overRuns,
                legalBallCount: (match.legalBallCount || 0) + 1,
                ...getManualBallsUpdate(),
            });
        }
    };

    // addBoundary — handles NB+4 / NB+6: if last ball was "NB", combine and do NOT
    // increment ball count. Fires SIX/FOUR event for the animation in both cases.
    const addBoundary = (runs) => {
        if (!match || match.overLocked) return;
        const ak = match.player1.onStrike ? "player1" : "player2";

        const balls = match.recentBalls || [];
        const lastBall = balls[balls.length - 1];
        if (lastBall === "NB") {
            setHistory(h => [...h, match]);
            const entry = `NB+${runs}`;
            const newBalls = [...balls.slice(0, -1), entry];
            pushEvent({
                score: match.score + runs,
                [ak]: { ...match[ak], runs: match[ak].runs + runs },
                recentBalls: newBalls,
                overRuns: (match.overRuns || 0) + runs,
            }, runs === 6 ? "SIX" : "FOUR");
            return;
        }

        setHistory(h => [...h, match]);
        const { recentBalls, overRuns } = updateOverHistory(runs.toString(), match, runs);
        if (isMongoDB(matchId)) {
            pushDelivery(String(runs), 0, {});
        } else {
            pushEvent({
                score: match.score + runs, totalBalls: match.totalBalls + 1,
                [ak]: { ...match[ak], runs: match[ak].runs + runs, balls: match[ak].balls + 1 },
                recentBalls, overRuns,
                legalBallCount: (match.legalBallCount || 0) + 1,
                ...getManualBallsUpdate(),
            }, runs === 6 ? "SIX" : "FOUR");
        }
    };

    // addExtra — NB: adds +1 to score, records "NB" in ball history (no ball count bump).
    // Subsequent addRun/addBoundary call will collapse it into "NB+N".
    const addExtra = (type, runs = 0) => {
        if (!match || match.overLocked) return;
        setHistory(h => [...h, match]);
        const total = 1 + runs;
        const entry = runs > 0 ? `${type}+${runs}` : type;
        const { recentBalls, overRuns } = updateOverHistory(entry, match, total);
        const ak = match.player1.onStrike ? "player1" : "player2";
        // NB: credit runs to batter but do NOT increment ball count (free delivery)
        const batUp = type === "NB" ? { [ak]: { ...match[ak], runs: match[ak].runs + runs } } : {};
        if (isMongoDB(matchId)) {
            const delivType = type === 'WD' ? 'wide' : 'noball';
            pushDelivery(delivType, runs, {});
        } else {
            push({ score: match.score + total, recentBalls, overRuns, ...batUp });
        }
    };

    const addLegBye = (runs) => {
        if (!match || match.overLocked) return;
        setHistory(h => [...h, match]);
        const ak = match.player1.onStrike ? "player1" : "player2";
        const { recentBalls, overRuns } = updateOverHistory(`LB${runs}`, match, runs);
        if (isMongoDB(matchId)) {
            pushDelivery('lb', runs, {});
        } else {
            push({
                score: match.score + runs, totalBalls: match.totalBalls + 1,
                [ak]: { ...match[ak], balls: match[ak].balls + 1 },
                recentBalls, overRuns,
                legalBallCount: (match.legalBallCount || 0) + 1,
                ...getManualBallsUpdate(),
            });
        }
    };

    const addBye = (runs) => {
        if (!match || match.overLocked) return;
        setHistory(h => [...h, match]);
        const ak = match.player1.onStrike ? "player1" : "player2";
        const { recentBalls, overRuns } = updateOverHistory(`B${runs}`, match, runs);
        if (isMongoDB(matchId)) {
            pushDelivery('byes', runs, {});
        } else {
            push({
                score: match.score + runs, totalBalls: match.totalBalls + 1,
                [ak]: { ...match[ak], balls: match[ak].balls + 1 },
                recentBalls, overRuns,
                legalBallCount: (match.legalBallCount || 0) + 1,
                ...getManualBallsUpdate(),
            });
        }
    };

    const handleWicket = () => {
        if (!match || match.overLocked) return;
        setHistory(h => [...h, match]);
        const outKey = match.player1.onStrike ? "player1" : "player2";
        const op = match[outKey];
        const { recentBalls, overRuns } = updateOverHistory("W", match, 0);
        if (isMongoDB(matchId)) {
            pushDelivery('wicket', 0, {});
        } else {
            pushEvent({
                wickets: match.wickets + 1, totalBalls: match.totalBalls + 1,
                recentBalls, overRuns,
                fallOfWickets: [...(match.fallOfWickets || []), { name: op.name, runs: op.runs, balls: op.balls, bowler: match.bowler?.name, fowScore: match.score, fowWicket: match.wickets + 1 }],
                lastWicketName: op.name, lastWicketRuns: op.runs, lastWicketBalls: op.balls,
                [outKey]: { name: "NEW PLAYER", runs: 0, balls: 0, onStrike: true },
                legalBallCount: (match.legalBallCount || 0) + 1,
                ...getManualBallsUpdate(),
            }, "WICKET");
        }
    };

    const handleRunOut = () => {
        if (!match || match.overLocked) return;
        setHistory(h => [...h, match]);
        
        const strikerKey = match.player1.onStrike ? "player1" : "player2";
        const nonStrikerKey = match.player1.onStrike ? "player2" : "player1";
        const outKey = runOutPlayer === 'striker' ? strikerKey : nonStrikerKey;
        const op = match[outKey];
        
        const runString = runOutRuns > 0 ? `${runOutRuns}W` : "W";
        const { recentBalls, overRuns } = updateOverHistory(runString, match, runOutRuns);
        
        let p1Strike = match.player1.onStrike;
        let p2Strike = match.player2.onStrike;
        let p1Balls = match.player1.balls;
        let p2Balls = match.player2.balls;
        let p1Runs = match.player1.runs;
        let p2Runs = match.player2.runs;

        // Add runs and balls to original striker
        if (p1Strike) { p1Balls++; p1Runs += runOutRuns; }
        else { p2Balls++; p2Runs += runOutRuns; }

        // Rotate strike if odd runs
        if (runOutRuns % 2 !== 0) {
            p1Strike = !p1Strike;
            p2Strike = !p2Strike;
        }

        // New player inherits the strike state of the slot they are filling
        const outKeyStrikeStatus = outKey === 'player1' ? p1Strike : p2Strike;

        if (isMongoDB(matchId)) {
            // For MongoDB: use runout delivery type (counts as a wicket + optional runs)
            pushDelivery('runout', runOutRuns, {});
            // Must push player state separately
            push({
                player1: outKey === 'player1' 
                    ? { name: "NEW PLAYER", runs: 0, balls: 0, onStrike: outKeyStrikeStatus } 
                    : { ...match.player1, runs: p1Runs, balls: p1Balls, onStrike: p1Strike },
                player2: outKey === 'player2' 
                    ? { name: "NEW PLAYER", runs: 0, balls: 0, onStrike: outKeyStrikeStatus } 
                    : { ...match.player2, runs: p2Runs, balls: p2Balls, onStrike: p2Strike },
            });
        } else {
            pushEvent({
                score: match.score + runOutRuns,
                wickets: match.wickets + 1, totalBalls: match.totalBalls + 1,
                recentBalls, overRuns,
                fallOfWickets: [...(match.fallOfWickets || []), { name: op.name, runs: op.runs, balls: op.balls, bowler: match.bowler?.name, fowScore: match.score + runOutRuns, fowWicket: match.wickets + 1 }],
                lastWicketName: op.name, lastWicketRuns: op.runs, lastWicketBalls: op.balls,
                player1: outKey === 'player1' 
                    ? { name: "NEW PLAYER", runs: 0, balls: 0, onStrike: outKeyStrikeStatus } 
                    : { ...match.player1, runs: p1Runs, balls: p1Balls, onStrike: p1Strike },
                player2: outKey === 'player2' 
                    ? { name: "NEW PLAYER", runs: 0, balls: 0, onStrike: outKeyStrikeStatus } 
                    : { ...match.player2, runs: p2Runs, balls: p2Balls, onStrike: p2Strike },
                legalBallCount: (match.legalBallCount || 0) + 1,
                ...getManualBallsUpdate(),
            }, "WICKET");
        }

        setShowRunOutPanel(false);
        setRunOutRuns(0);
        setRunOutPlayer('striker');
    };

    const swapStrike = () => {
        if (!match) return;
        push({
            player1: { ...match.player1, onStrike: !match.player1.onStrike },
            player2: { ...match.player2, onStrike: !match.player2.onStrike },
        });
    };

    const handleUndo = () => {
        if (history.length === 0) return;
        const prev = history[history.length - 1];
        setHistory(h => h.slice(0, -1));
        if (isMongoDB(matchId)) {
            // For MongoDB: use manualCorrection to restore last state snapshot
            // Calculate deltas relative to current match state
            const scoreDelta = (prev.score ?? 0) - (match?.score ?? 0);
            const wicketsDelta = (prev.wickets ?? 0) - (match?.wickets ?? 0);
            const ballsDelta = (prev.legalBallCount ?? 0) - (match?.legalBallCount ?? 0);
            matchesApi.manualCorrection(matchId, {
                scoreDelta, wicketsDelta, ballsDelta,
                correctionNote: 'Undo last delivery',
            }).then(res => { if (res.match) setMatch(res.match); }).catch(() => {});
            // Optimistically restore local state
            setMatch(prev);
        } else {
            update(ref(db, dbPath), prev);
        }
    };

    // ── New Match — resets score/balls only, keeps team/tournament info ──
    const handleNewMatch = () => {
        if (!match) return;
        if (!window.confirm("Reset match data?\nTeam names and tournament info will be kept.")) return;
        setHistory([]);
        push({
            score: 0, wickets: 0, totalBalls: 0, currentOver: 0,
            overRuns: 0, recentBalls: [], legalBallCount: 0,
            isSecondInnings: false, targetScore: 0, overLocked: false,
            player1: { name: "", runs: 0, balls: 0, onStrike: true },
            player2: { name: "", runs: 0, balls: 0, onStrike: false },
            fallOfWickets: [], firstInningsScore: 0, firstInningsWickets: 0, firstInningsOvers: 0,
            eventTrigger: "RESET_WINNER",
        });
    };

    // ── New Innings — does NOT auto-set target; user sets it manually ──
    const handleNewInnings = () => {
        if (!match) return;
        if (match.isSecondInnings) {
            alert("Match is already in the 2nd innings.");
            return;
        }
        if (!window.confirm(`Start 2nd Innings?\n1st Innings Score: ${match.score}\nYou will need to set the target manually.\nThis will reset scores.`)) return;
        setHistory([]);
        push({
            firstInningsScore: match.score,
            firstInningsWickets: match.wickets,
            firstInningsOvers: match.totalBalls,
            score: 0, wickets: 0, totalBalls: 0, currentOver: 0,
            overRuns: 0, recentBalls: [], legalBallCount: 0,
            isSecondInnings: true,
            targetScore: 0,
            player1: { name: "", runs: 0, balls: 0, onStrike: true },
            player2: { name: "", runs: 0, balls: 0, onStrike: false },
            eventTrigger: "RESET_WINNER",
        });
    };

    // ── Reset Tournament — full wipe (teams + match + tournament info) ─
    const handleResetTournament = () => {
        if (!match) return;
        if (!window.confirm("FULL RESET?\nThis will clear teams, match data, and all tournament info.\nThis cannot be undone.")) return;
        setHistory([]);
        const resetPayload = {
            score: 0, wickets: 0, totalBalls: 0, currentOver: 0,
            overRuns: 0, recentBalls: [], legalBallCount: 0,
            isSecondInnings: false, targetScore: 0,
            battingTeam: "", bowlingTeam: "", matchTitle: "", bowlingPrefix: "",
            player1: { name: "", runs: 0, balls: 0, onStrike: true },
            player2: { name: "", runs: 0, balls: 0, onStrike: false },
            bowler: { name: "", figures: "" },
            fallOfWickets: [], firstInningsScore: 0, firstInningsWickets: 0, firstInningsOvers: 0,
        };
        if (isMongoDB(matchId)) {
            push(resetPayload);
        } else {
            // Legacy: use the correct per-match or root path
            update(ref(db, dbPath), resetPayload);
        }
    };

    // ── OVER COMPLETED ──────────────────────────────────────────
    const handleOverCompleted = () => {
        const lbc = match?.legalBallCount || 0;
        const isReady = isMongoDB(matchId) ? (lbc > 0 && lbc % bpo === 0) : (lbc >= bpo);
        if (!match || !isReady || overCooldown) return;
        setOverCooldown(true);
        setTimeout(() => setOverCooldown(false), 1000);
        setHistory(h => [...h, match]);

        if (isMongoDB(matchId)) {
            push({
                player1: { ...match.player1, onStrike: !match.player1.onStrike },
                player2: { ...match.player2, onStrike: !match.player2.onStrike },
                currentOver: (match.currentOver || 0) + 1,
                overLocked: false,
                eventTrigger: "NEW_OVER",
            });
        } else {
            pushEvent({
                recentBalls: [],
                overRuns: 0,
                legalBallCount: 0,
                currentOver: (match.currentOver || 0) + 1,
                overLocked: false,
                player1: { ...match.player1, onStrike: !match.player1.onStrike },
                player2: { ...match.player2, onStrike: !match.player2.onStrike },
            }, "NEW_OVER");
        }
    };

    // ── Keyboard shortcuts ─────────────────────────────────────────────
    const handlerRef = useRef(null);
    handlerRef.current = { addRun, addBoundary, handleWicket, swapStrike, handleUndo };

    useEffect(() => {
        const handler = (e) => {
            if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
            const k = e.key.toLowerCase();
            const h = handlerRef.current;
            if (["0", "1", "2", "3"].includes(k)) h.addRun(parseInt(k));
            if (k === "4") h.addBoundary(4);
            if (k === "6") h.addBoundary(6);
            if (k === "w") h.handleWicket();
            if (k === "s") h.swapStrike();
            if (k === "u") h.handleUndo();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    // ── Loading ───────────────────────────────────────────────────
    if (!match) return <div className="ma-root"><div className="ma-loading">Connecting…</div></div>;


    const striker = match.player1?.onStrike ? match.player1 : match.player2;
    const nonStriker = match.player1?.onStrike ? match.player2 : match.player1;
    const strikerKey = match.player1?.onStrike ? "player1" : "player2";
    const nonStrikerKey = match.player1?.onStrike ? "player2" : "player1";
    const totalMatchBalls = (match.maxOvers || 5) * 6;
    const legalBallCount = match.legalBallCount || 0;
    const remainingBalls = match.manualBallsOverride ? (match.manualBallsValue || 0) : (totalMatchBalls - legalBallCount);
    const crr = legalBallCount > 0 ? (match.score / (legalBallCount / 6)).toFixed(2) : "0.00";
    const rrr = match.isSecondInnings && remainingBalls > 0
        ? ((match.targetScore - match.score) / (remainingBalls / 6)).toFixed(2)
        : "--";
    const isOverReady = isMongoDB(matchId) ? (legalBallCount > 0 && legalBallCount % bpo === 0) : (legalBallCount >= bpo);

    return (
        <div className="ma-root">

            {/* ═══ HEADER ═══════════════════════════════════════════════ */}
            <div className="ma-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="ma-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <img src="/ks_logo.png" alt="KS Logo" style={{ height: '24px', width: 'auto', objectFit: 'contain' }} />
                    <span style={{ fontWeight: '900', letterSpacing: '1px' }}>KS CONTROL</span>
                </div>
                <div className="flex items-center gap-2"><LanguageSwitcher compact /><span className="ma-live-pulse" /></div>
            </div>

            {/* ═══ LIVE SCORE BAR ═══════════════════════════════════════ */}
            <div className="ma-score-bar">
                <div>
                    <div className="ma-team">{match.battingTeam || "TEAM"}</div>
                    <div className="ma-sub-info">vs {match.bowlingTeam || "OPPONENT"}</div>
                </div>
                <div className="ma-score-right">
                    <span className="ma-score-big">{match.score}-{match.wickets}</span>
                    <span className="ma-score-overs">({overs(match.totalBalls)})</span>
                </div>
            </div>

            <div className="ma-status-strip">
                <span>{t("common.innings")}: <b>{match.isSecondInnings ? "2ND" : "1ST"}</b></span>
                <span>{t("common.matchStage")}: <b>{match.matchTitle || match.bowlingPrefix || "--"}</b></span>
                <span>{t("common.matchStatus")}: <b>{match.matchStatus || t("admin.status.live")}</b></span>
            </div>

            {/* LIVE OVERLAY PREVIEW */}
            <div className="ma-preview-container" style={{ padding: '4px 12px', marginBottom: '8px' }}>
                <button 
                    onClick={() => setShowLivePreview(p => !p)} 
                    style={{ 
                        width: '100%', 
                        padding: '6px 12px', 
                        background: '#1e293b', 
                        color: '#38bdf8', 
                        border: '1px solid #334155', 
                        borderRadius: '6px', 
                        fontSize: '10px', 
                        fontWeight: '900', 
                        letterSpacing: '0.5px', 
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: showLivePreview ? '#10b981' : '#cbd5e1', animation: showLivePreview ? 'maPulse 1.5s infinite' : 'none' }} />
                    {showLivePreview ? "HIDE VISUAL OVERLAY" : "SHOW VISUAL OVERLAY MONITOR"}
                </button>
                {showLivePreview && (
                    <div style={{ 
                        marginTop: '8px', 
                        position: 'relative', 
                        width: '100%', 
                        paddingTop: '56.25%', 
                        background: '#000', 
                        borderRadius: '8px', 
                        border: '1px solid #334155', 
                        overflow: 'hidden', 
                        boxShadow: 'inset 0 0 15px rgba(0,0,0,0.8)' 
                    }}>
                        <iframe 
                            src={overlayUrl} 
                            title="Mini Overlay Preview" 
                            style={{ 
                                position: 'absolute', 
                                top: 0, left: 0, 
                                width: '100%', height: '100%', 
                                border: 'none', 
                                pointerEvents: 'none' 
                            }} 
                        />
                    </div>
                )}
            </div>

            {/* ── Action Bar: New Match / New Innings / Reset All ── */}
            <div className="ma-action-bar">
                {match.tournamentId && (
                    <button className="ma-btn" style={{ background: '#facc15', color: '#000', gridColumn: 'span 3', fontWeight: '900', animation: 'maPulse 1.5s infinite' }} onClick={() => setShowNextMatch(true)}>🚀 DEPLOY NEXT MATCH</button>
                )}
                <button className="ma-btn ma-btn-blue" onClick={handleNewMatch}>🆕 NEW MATCH</button>
                <button className="ma-btn ma-btn-innings" onClick={handleNewInnings}>🔄 NEW INNINGS</button>
                <button className="ma-btn ma-btn-reset" onClick={handleResetTournament}>💥 RESET ALL</button>
            </div>

            <div className="ma-quick-edit">
                <div className="ma-quick-edit-title">{t("common.quickEdit")}</div>
                <div className="ma-quick-edit-grid">
                    <div className="ma-quick-edit-item">
                        <label>{t("mini.quickEdit.striker")}</label>
                        <ComboboxPlayerInput
                            options={match.battingSquad}
                            className="ma-inp uppercase focus:outline-blue-500"
                            value={striker?.name || ""}
                            onChange={(e) => push({ [strikerKey]: { ...match[strikerKey], name: e.target.value } })}
                        />
                    </div>
                    <div className="ma-quick-edit-item">
                        <label>{t("mini.quickEdit.nonStriker")}</label>
                        <ComboboxPlayerInput
                            options={match.battingSquad}
                            className="ma-inp uppercase focus:outline-blue-500"
                            value={nonStriker?.name || ""}
                            onChange={(e) => push({ [nonStrikerKey]: { ...match[nonStrikerKey], name: e.target.value } })}
                        />
                    </div>
                    <div className="ma-quick-edit-item">
                        <label>{t("mini.quickEdit.bowler")}</label>
                        <ComboboxPlayerInput
                            options={match.bowlingSquad}
                            className="ma-inp uppercase focus:outline-purple-500"
                            value={match.bowler?.name || ""}
                            onChange={(e) => push({ bowler: { ...match.bowler, name: e.target.value } })}
                        />
                    </div>
                </div>
            </div>

            {/* CRR / RRR strip */}
            <div className="ma-rate-strip">
                <span>CRR: <b>{crr}</b></span>
                <span>RRR: <b>{rrr}</b></span>
                <span>Over: <b>{match.overRuns || 0}</b></span>
            </div>

            {/* Over complete alert + button */}
            {match.totalBalls > 0 && isOverReady && (
                <div className="ma-over-alert">⚠ OVER COMPLETE ({legalBallCount}/{bpo}) — Click below!</div>
            )}
            <button
                onClick={handleOverCompleted}
                disabled={!isOverReady || overCooldown}
                className={`ma-over-btn ${isOverReady && !overCooldown ? 'ma-over-btn-ready' : 'ma-over-btn-disabled'}`}
            >
                {overCooldown ? '✔ LOCKED' : isOverReady ? `⚡ OVER COMPLETED (${legalBallCount}/${bpo})` : `⏳ ${legalBallCount}/${bpo} BALLS`}
            </button>

            {/* Chase info */}
            {match.isSecondInnings && match.targetScore > 0 && (
                <div className="ma-chase-alert">Need {Math.max(0, match.targetScore - match.score)} in {remainingBalls} balls · Target: {match.targetScore}</div>
            )}

            {/* ── MANUAL TARGET ENTRY — shows when 2nd innings started but target not set ── */}
            {match.isSecondInnings && !match.targetScore && (
                <div className="ma-target-entry">
                    <div className="ma-target-entry-title">🎯 SET TARGET</div>
                    <div className="ma-target-entry-hint">1st Innings: {match.firstInningsScore || 0}-{match.firstInningsWickets ?? 0} ({overs(match.firstInningsOvers || 0)})</div>
                    <div className="ma-target-entry-row">
                        <div className="ma-target-entry-field">
                            <label>Target Runs</label>
                            <input id="ma-target-runs" type="number" className="ma-inp" placeholder={String((match.firstInningsScore || 0) + 1)} defaultValue="" />
                        </div>
                        <div className="ma-target-entry-field">
                            <label>Total Balls</label>
                            <input id="ma-target-balls" type="number" className="ma-inp" placeholder={String((match.maxOvers || 5) * 6)} defaultValue="" />
                        </div>
                    </div>
                    <button className="ma-btn ma-btn-target-update" onClick={() => {
                        const runsEl = document.getElementById('ma-target-runs');
                        const ballsEl = document.getElementById('ma-target-balls');
                        const runs = parseInt(runsEl?.value) || 0;
                        const balls = parseInt(ballsEl?.value) || ((match.maxOvers || 5) * 6);
                        if (runs <= 0) { alert('Please enter a valid target runs value.'); return; }
                        const maxOversFromBalls = Math.ceil(balls / (match.ballsPerOver || 6));
                        push({ targetScore: runs, maxOvers: maxOversFromBalls });
                    }}>✅ UPDATE TARGET</button>
                </div>
            )}

            {/* ═══ SCROLLABLE SECTIONS ═════════════════════════════════ */}
            <div className="ma-scroll-area">

                {/* ── 1. MATCH CONTROL (Blue) ──────────────────────────── */}
                <Section label="MATCH CONTROL" color="blue" icon="🎯" open={!!openSections.match} onClick={() => toggle("match")}>
                    <div className="ma-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '4px' }}>
                        <div style={{ flex: 1, minWidth: '40%' }}>
                           <label>Batting Team</label>
                           <input type="text" className="ma-inp" value={match.battingTeam || ""} onChange={(e) => push({ battingTeam: e.target.value.toUpperCase() })} />
                           <div style={{ display: 'flex', gap: '4px', marginTop: '4px', alignItems: 'center' }}>
                               <input type="file" accept="image/*" id="batLogoUpload" style={{ display: 'none' }} onChange={(e) => {
                                   if (e.target.files && e.target.files[0]) {
                                       const reader = new FileReader();
                                       reader.onload = (ev) => push({ battingLogo: ev.target.result });
                                       reader.readAsDataURL(e.target.files[0]);
                                   }
                               }} />
                               <button className="ma-btn" style={{ padding: '4px 6px', fontSize: '10px', background: '#334155', color: '#fff', border: '1px solid #475569' }} onClick={() => document.getElementById('batLogoUpload').click()}>📁 Upload</button>
                               <input type="text" className="ma-inp" placeholder="or URL" style={{ fontSize: '10px', flex: 1 }} value={match.battingLogo || ""} onChange={(e) => push({ battingLogo: e.target.value })} />
                           </div>
                        </div>
                        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end', paddingBottom: '2px' }}>
                           <button className="ma-btn ma-btn-swap" style={{ padding: '6px' }} onClick={() => push({ battingTeam: match.bowlingTeam, bowlingTeam: match.battingTeam, battingLogo: match.leagueLogo, leagueLogo: match.battingLogo })}>↔</button>
                        </div>
                        <div style={{ flex: 1, minWidth: '40%' }}>
                           <label>Bowling Team</label>
                           <input type="text" className="ma-inp" value={match.bowlingTeam || ""} onChange={(e) => push({ bowlingTeam: e.target.value.toUpperCase() })} />
                           <div style={{ display: 'flex', gap: '4px', marginTop: '4px', alignItems: 'center' }}>
                               <input type="file" accept="image/*" id="bowlLogoUpload" style={{ display: 'none' }} onChange={(e) => {
                                   if (e.target.files && e.target.files[0]) {
                                       const reader = new FileReader();
                                       reader.onload = (ev) => push({ leagueLogo: ev.target.result });
                                       reader.readAsDataURL(e.target.files[0]);
                                   }
                               }} />
                               <button className="ma-btn" style={{ padding: '4px 6px', fontSize: '10px', background: '#334155', color: '#fff', border: '1px solid #475569' }} onClick={() => document.getElementById('bowlLogoUpload').click()}>📁 Upload</button>
                               <input type="text" className="ma-inp" placeholder="or URL" style={{ fontSize: '10px', flex: 1 }} value={match.leagueLogo || ""} onChange={(e) => push({ leagueLogo: e.target.value })} />
                           </div>
                        </div>
                    </div>
                    <div className="ma-row">
                        <label>Format</label>
                        <select className="ma-sel" value={match.matchType || "T20"} onChange={(e) => push({ matchType: e.target.value })}>
                            <option value="T20">T20</option>
                            <option value="ODI">ODI</option>
                            <option value="Test">Test</option>
                            <option value="T10">T10</option>
                            <option value="Custom">Custom</option>
                        </select>
                    </div>
                    <div className="ma-row">
                        <label>Title / Stage</label>
                        <input type="text" className="ma-inp" placeholder="e.g. GRAND FINAL" value={match.matchTitle || match.bowlingPrefix || ""} onChange={(e) => push({ matchTitle: e.target.value, bowlingPrefix: e.target.value })} />
                    </div>
                    <div className="ma-row">
                        <label>Max Overs</label>
                        <input type="number" className="ma-inp" value={match.maxOvers} onChange={(e) => push({ maxOvers: parseInt(e.target.value) || 5 })} />
                    </div>
                    <div className="ma-row">
                        <label>Balls/Over</label>
                        <input type="number" className="ma-inp" value={match.ballsPerOver} onChange={(e) => push({ ballsPerOver: parseInt(e.target.value) || 6 })} />
                    </div>
                    <div className="ma-row">
                        <label>Innings</label>
                        <select className="ma-sel" value={match.isSecondInnings ? "2" : "1"} onChange={(e) => push({ isSecondInnings: e.target.value === "2" })}>
                            <option value="1">1st Innings</option>
                            <option value="2">2nd Innings</option>
                        </select>
                    </div>
                    <div className="ma-row" style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', flexWrap: 'wrap' }}>
                        <label style={{ width: '100%', marginBottom: '6px' }}>Allowed Extras</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '10px', width: '100%', color: '#ccc' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', width: 'auto', color: '#ccc' }}><input type="checkbox" checked={match.extrasConfig?.wd !== false} onChange={(e) => push({ extrasConfig: { ...match.extrasConfig, wd: e.target.checked } })} /> Wides</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', width: 'auto', color: '#ccc' }}><input type="checkbox" checked={match.extrasConfig?.nb !== false} onChange={(e) => push({ extrasConfig: { ...match.extrasConfig, nb: e.target.checked } })} /> No Balls</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', width: 'auto', color: '#ccc' }}><input type="checkbox" checked={match.extrasConfig?.b !== false} onChange={(e) => push({ extrasConfig: { ...match.extrasConfig, b: e.target.checked } })} /> Byes</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', width: 'auto', color: '#ccc' }}><input type="checkbox" checked={match.extrasConfig?.lb !== false} onChange={(e) => push({ extrasConfig: { ...match.extrasConfig, lb: e.target.checked } })} /> Leg Byes</label>
                        </div>
                    </div>
                    <div className="ma-row">
                        <label>Target</label>
                        <input type="number" className="ma-inp" value={match.targetScore} onChange={(e) => push({ targetScore: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div className="ma-row">
                        <label>Theme</label>
                        <select className="ma-sel" value={match.themeID} onChange={(e) => push({ themeID: e.target.value })}>
                            <option value="IPL_GOLD">IPL Classic</option>
                            <option value="SKY_PRO">Sky Sports</option>
                            <option value="NEON_VAVUNIYA">Neon Green</option>
                            <option value="CLASSIC_DARK">Classic Dark</option>
                            <option value="T20_NEON">T20 Neon</option>
                            <option value="WC_BLUE_PURPLE">WC Blue-Purple</option>
                            <option value="GOLD_CHAMPIONSHIP">Gold Championship</option>
                            <option value="WC2026">🏆 T20 WC 2026</option>
                            <option value="KS_SPECIAL">☆ KS Special</option>
                            <option value="SL_BROADCAST">📺 SL Broadcast</option>
                            <option value="APOGEE">🔮 APOGEE ARENA</option>
                            <option value="DC_BLUE">🟦 DC Blue Bar</option>
                            <option value="IPL_2026">🏏 IPL 2026</option>
                            <option value="NEW_IPL">🆕 NEW IPL</option>
                            <option value="KS_PREMIUM">💎 KS Premium (Broadcast)</option>
                        </select>
                    </div>
                    <div className="ma-row">
                        <label>Overlay</label>
                        <select className="ma-sel" value={match.overlayMode || "full"} onChange={(e) => push({ overlayMode: e.target.value })}>
                            <option value="full">Full</option>
                            <option value="simple">Simple</option>
                        </select>
                    </div>
                    <div className="ma-btn-row">
                        <button className="ma-btn ma-btn-blue" onClick={() => push({ showVersus: !match.showVersus })}>{match.showVersus ? "✓ " : ""}VS Tab</button>
                        <button className="ma-btn ma-btn-blue" onClick={() => push({ showSummary: !match.showSummary })}>{match.showSummary ? "✓ " : ""}Summary</button>
                    </div>
                    <button className="ma-btn w-full mt-2" style={{ backgroundColor: '#06b6d4', color: 'white', fontWeight: '900', borderBottom: '3px solid #0891b2' }} onClick={() => push({ eventTrigger: "SHOW_BANNER" })}>✨ SHOW BANNER</button>
                </Section>

                {/* ── 1.5. INNINGS & SUPER OVER ────────────────────────── */}
                <Section label="INNINGS & EXTRA" color="amber" icon="🔄" open={!!openSections.innings} onClick={() => toggle("innings")}>
                    <div className="ma-btn-row mb-2">
                        <button className={`ma-btn ${!match.isSecondInnings ? "bg-amber-600 text-white border-amber-800" : "ma-btn-blue opacity-50"}`} onClick={() => push({ isSecondInnings: false })}>1ST INN</button>
                        <button className={`ma-btn ${match.isSecondInnings ? "bg-amber-600 text-white border-amber-800" : "ma-btn-blue opacity-50"}`} onClick={() => push({ isSecondInnings: true })}>2ND INN</button>
                    </div>

                    <button className="ma-btn ma-btn-wicket w-full mb-2" style={{ backgroundColor: '#ef4444', borderColor: '#991b1b' }} onClick={() => {
                        if (match.isSecondInnings) {
                            alert("Match is already in the 2nd innings. Action ignored to protect target score.");
                            return;
                        }
                        if (window.confirm("Start 2nd Innings?\n1st Innings Score: " + match.score + "\nYou will need to set the target manually.\nThis will reset scores.")) {
                            push({
                                firstInningsScore: match.score, firstInningsWickets: match.wickets, firstInningsOvers: match.totalBalls,
                                score: 0, wickets: 0, totalBalls: 0, currentOver: 0, overRuns: 0, recentBalls: [],
                                legalBallCount: 0, isSecondInnings: true, targetScore: 0,
                                player1: { name: "", runs: 0, balls: 0, onStrike: true },
                                player2: { name: "", runs: 0, balls: 0, onStrike: false },
                                eventTrigger: "RESET_WINNER"
                            });
                        }
                    }}>⚠ RESET & START 2ND INNINGS</button>

                    <div className="ma-row" style={{ marginTop: 8, padding: 8, background: 'rgba(255, 204, 0, 0.1)', borderRadius: 4, border: '1px solid rgba(255, 204, 0, 0.3)' }}>
                        <label style={{ color: '#fbbf24', fontWeight: 'bold' }}>⚡ Super Over</label>
                        <input type="checkbox" checked={!!match.isSuperOver} onChange={(e) => push({ isSuperOver: e.target.checked })} style={{ transform: 'scale(1.5)', marginRight: 4 }} />
                    </div>
                </Section>

                {/* ── 2. BATTING CONTROL ───────────────────────────────── */}
                <Section label="BATTING" color="green" icon="🏏" open={!!openSections.batting} onClick={() => toggle("batting")}>
                    <div className="ma-bat-row ma-bat-active">
                        <span>🏏 {striker?.name}</span>
                        <span className="ma-bat-stat">{striker?.runs}({striker?.balls})</span>
                    </div>
                    <div className="ma-bat-row">
                        <span>{nonStriker?.name}</span>
                        <span className="ma-bat-stat">{nonStriker?.runs}({nonStriker?.balls})</span>
                    </div>
                    <div className="ma-row" style={{ overflow: "visible" }}>
                        <label>Striker</label>
                        <ComboboxPlayerInput
                            options={match.battingSquad}
                            className="ma-inp uppercase focus:outline-blue-500"
                            placeholder="Type or Select"
                            value={striker?.name || ""}
                            onChange={(e) => push({ [strikerKey]: { ...match[strikerKey], name: e.target.value } })}
                        />
                    </div>
                    <div className="ma-row" style={{ overflow: "visible" }}>
                        <label>Non-Striker</label>
                        <ComboboxPlayerInput
                            options={match.battingSquad}
                            className="ma-inp uppercase focus:outline-blue-500"
                            placeholder="Type or Select"
                            value={nonStriker?.name || ""}
                            onChange={(e) => push({ [nonStrikerKey]: { ...match[nonStrikerKey], name: e.target.value } })}
                        />
                    </div>
                    <button className="ma-btn ma-btn-swap w-full" onClick={swapStrike}>↔ SWAP STRIKE (S)</button>
                    <div className="ma-row" style={{ marginTop: 6 }}>
                        <label>Edit Striker Runs</label>
                        <input type="number" className="ma-inp" value={striker?.runs || 0} onChange={(e) => push({ [strikerKey]: { ...match[strikerKey], runs: parseInt(e.target.value) || 0 } })} />
                    </div>
                </Section>

                {/* ── 3. BOWLING CONTROL ───────────────────────────────── */}
                <Section label="BOWLING" color="purple" icon="🎳" open={!!openSections.bowling} onClick={() => toggle("bowling")}>
                    <div className="ma-bat-row">
                        <span>🎳 {match.bowler?.name}</span>
                        <span className="ma-bat-stat">{match.bowler?.figures}</span>
                    </div>
                    <div className="ma-row" style={{ overflow: "visible" }}>
                        <label>Bowler</label>
                        <ComboboxPlayerInput
                            options={match.bowlingSquad}
                            className="ma-inp uppercase focus:outline-purple-500"
                            placeholder="Type or Select"
                            value={match.bowler?.name || ""}
                            onChange={(e) => push({ bowler: { ...match.bowler, name: e.target.value } })}
                        />
                    </div>
                    <div className="ma-row">
                        <label>Edit Figures</label>
                        <input className="ma-inp" value={match.bowler?.figures || ""} onChange={(e) => push({ bowler: { ...match.bowler, figures: e.target.value } })} />
                    </div>
                </Section>

                {/* ── 4. SCORING ENGINE ─────────────────────────────────── */}
                <Section label="SCORING" color="green" icon="🏏" open={!!openSections.scoring} onClick={() => toggle("scoring")}>
                    {/* Runs */}
                    <div className="ma-label">RUNS</div>
                    <div className="ma-grid ma-grid-6">
                        {[0, 1, 2, 3].map(r => (
                            <button key={r} className="ma-btn ma-btn-run" onClick={() => addRun(r)}>
                                {r === 0 ? "•" : `+${r}`}
                            </button>
                        ))}
                        <button className="ma-btn ma-btn-run ma-btn-boundary" onClick={() => addBoundary(4)}>+4</button>
                        <button className="ma-btn ma-btn-run ma-btn-boundary" onClick={() => addBoundary(6)}>+6</button>
                    </div>

                    {/* Wicket */}
                    <button className="ma-btn ma-btn-wicket w-full" onClick={handleWicket}>WICKET (W)</button>

                    {/* Wides */}
                    {match.extrasConfig?.wd !== false && (
                    <>
                        <div className="ma-label">WIDE +</div>
                        <div className="ma-grid ma-grid-5">
                            {[0, 1, 2, 3, 4].map(r => (
                                <button key={r} className="ma-btn ma-btn-extra" onClick={() => addExtra("WD", r)}>
                                    WD{r > 0 ? `+${r}` : ""}
                                </button>
                            ))}
                        </div>
                    </>
                    )}

                    {/* No Balls */}
                    {match.extrasConfig?.nb !== false && (
                    <>
                        <div className="ma-label">NO BALL +</div>
                        <div className="ma-grid ma-grid-5">
                            {[0, 1, 2, 3, 4].map(r => (
                                <button key={r} className="ma-btn ma-btn-extra" onClick={() => addExtra("NB", r)}>
                                    NB{r > 0 ? `+${r}` : ""}
                                </button>
                            ))}
                        </div>
                    </>
                    )}

                    {/* Leg Byes */}
                    {match.extrasConfig?.lb !== false && (
                    <>
                        <div className="ma-label">LEG BYE</div>
                        <div className="ma-grid ma-grid-4">
                            {[1, 2, 3, 4].map(r => (
                                <button key={r} className="ma-btn ma-btn-lb" onClick={() => addLegBye(r)}>LB {r}</button>
                            ))}
                        </div>
                    </>
                    )}

                    {/* Byes */}
                    {match.extrasConfig?.b !== false && (
                    <>
                        <div className="ma-label">BYE</div>
                        <div className="ma-grid ma-grid-4">
                            {[1, 2, 3, 4].map(r => (
                                <button key={r} className="ma-btn ma-btn-bye" onClick={() => addBye(r)}>B {r}</button>
                            ))}
                        </div>
                    </>
                    )}
                </Section>

                {/* ── 5. OVER CONTROL ──────────────────────────────────── */}
                <Section label="OVER CONTROL" color="amber" icon="🔧" open={!!openSections.overs} onClick={() => toggle("overs")}>
                    <div className="ma-btn-row">
                        <button className="ma-btn ma-btn-undo" onClick={handleUndo}>↶ UNDO (U)</button>
                        <button className="ma-btn ma-btn-swap" onClick={swapStrike}>↔ SWAP (S)</button>
                    </div>
                    <div className="ma-row" style={{ flexWrap: 'wrap', gap: '4px', background: 'rgba(255, 0, 0, 0.05)', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255, 0, 0, 0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '4px' }}>
                            <label style={{ color: '#ef4444', fontWeight: 'bold' }}>Remaining Balls Input</label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {match.manualBallsOverride && (
                                    <label style={{ fontSize: '10px', color: '#a7f3d0', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={match.autoDecreaseBalls !== false} onChange={(e) => push({ autoDecreaseBalls: e.target.checked })} /> Auto Decrease
                                    </label>
                                )}
                                <label style={{ fontSize: '10px', color: '#ccc', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={!!match.manualBallsOverride} onChange={(e) => push({ manualBallsOverride: e.target.checked })} /> Use Manual Balls
                                </label>
                            </div>
                        </div>
                        <div style={{ display: 'flex', width: '100%', gap: '8px', alignItems: 'center' }}>
                            <input id="ma-manual-balls" type="number" className="ma-inp" placeholder="e.g. 16" defaultValue={match.manualBallsValue || ""} />
                            <button className="ma-btn" style={{ background: '#ef4444', color: 'white', padding: '4px 12px', flexShrink: 0, fontWeight: 'bold' }} onClick={() => {
                                const valEl = document.getElementById('ma-manual-balls');
                                const val = parseInt(valEl?.value);
                                const maxAllowed = (match.maxOvers || 5) * 6;
                                if (!isNaN(val) && val >= 0) {
                                    if (val > maxAllowed) {
                                        alert(`Maximum balls allowed for this format is ${maxAllowed}.`);
                                        valEl.value = maxAllowed;
                                        push({ manualBallsOverride: true, manualBallsValue: maxAllowed });
                                    } else {
                                        push({ manualBallsOverride: true, manualBallsValue: val });
                                    }
                                } else {
                                    alert('Please enter a valid positive number for balls.');
                                }
                            }}>UPDATE</button>
                        </div>
                        {!match.manualBallsOverride && (
                            <div style={{ display: 'flex', width: '100%', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                                <span style={{ fontSize: '10px', color: '#888' }}>Total Balls:</span>
                                <input type="number" className="ma-inp" value={match.totalBalls} onChange={(e) => push({ totalBalls: parseInt(e.target.value) || 0 })} />
                            </div>
                        )}
                    </div>
                    <div className="ma-row">
                        <label>Score Override</label>
                        <input type="number" className="ma-inp" value={match.score} onChange={(e) => push({ score: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div className="ma-row">
                        <label>Wickets Override</label>
                        <input type="number" className="ma-inp" value={match.wickets} onChange={(e) => push({ wickets: parseInt(e.target.value) || 0 })} />
                    </div>
                    {/* Recent balls display */}
                    <div className="ma-recent">
                        {(match.recentBalls || []).map((b, i) => (
                            <span key={i} className={`ma-ball ${b === "W" ? "ma-ball-w" : b === "•" ? "ma-ball-dot" : typeof b === "string" && b.startsWith("NB") ? "ma-ball-nb" : ""}`}>{b}</span>
                        ))}
                    </div>
                </Section>

                {/* ── 6. MATCH STATUS ──────────────────────────────────────── */}
                <Section label="MATCH STATUS" color="amber" icon="📡" open={!!openSections.status} onClick={() => toggle("status")}>
                    <div className="ma-grid ma-grid-2" style={{ gap: '6px' }}>
                        <button className={`ma-btn ${match.matchStatus === 'Live' || !match.matchStatus ? "bg-red-600 text-white font-black" : "ma-btn-undo"}`} onClick={() => push({ matchStatus: "Live" })}>🔴 LIVE</button>
                        <button className={`ma-btn ${match.matchStatus === 'Break' ? "bg-blue-600 text-white font-black" : "ma-btn-undo"}`} onClick={() => push({ matchStatus: "Break" })}>⏸ BREAK</button>
                        <button className={`ma-btn ${match.matchStatus === 'Innings Break' ? "bg-amber-600 text-white font-black" : "ma-btn-undo"}`} onClick={() => push({ matchStatus: "Innings Break" })}>🔄 INN BREAK</button>
                        <button className={`ma-btn ${match.matchStatus === 'Rain Delay' ? "bg-blue-900 text-cyan-300 border-blue-500 font-black" : "ma-btn-undo"}`} onClick={() => push({ matchStatus: "Rain Delay" })}>☔ RAIN</button>
                    </div>
                    <button className={`ma-btn w-full mt-2 ${match.matchStatus === 'Match Ended' ? "bg-purple-700 text-white font-black" : "ma-btn-undo"}`} onClick={() => push({ matchStatus: "Match Ended" })}>🏁 MATCH ENDED</button>
                </Section>

                {/* ── 7. TICKER ────────────────────────────────────────── */}
                <Section label="BROADCAST TICKER" color="amber" icon="📺" open={!!openSections.ticker} onClick={() => toggle("ticker")}>
                    <input
                        className="ma-inp w-full"
                        placeholder="GRAND FINAL — MATCH 3"
                        value={tickerMsg}
                        onChange={(e) => setTickerMsg(e.target.value.toUpperCase())}
                    />
                    <div className="ma-grid ma-grid-2" style={{ marginTop: 4 }}>
                        <select className="ma-sel" value={tickerMode} onChange={(e) => { setTickerMode(e.target.value); pushTicker({ mode: e.target.value }); }}>
                            <option value="banner">🏆 Tournament</option>
                            <option value="breaking">🔴 Breaking</option>
                        </select>
                        <select className="ma-sel" value={tickerPreset} onChange={(e) => { setTickerPreset(e.target.value); pushTicker({ preset: e.target.value }); }}>
                            <option value="final">🥇 Final</option>
                            <option value="semi">🔵 Semi</option>
                            <option value="custom">🟢 Custom</option>
                        </select>
                    </div>
                    <div className="ma-btn-row" style={{ marginTop: 4 }}>
                        <button className="ma-btn ma-btn-save" onClick={() => pushTicker({ message: tickerMsg })}>💾 SAVE</button>
                        <button className={`ma-btn ${tickerVisible ? "ma-btn-hide" : "ma-btn-show"}`} onClick={() => { const v = !tickerVisible; setTickerVisible(v); pushTicker({ visible: v, timestamp: Date.now() }); }}>
                            {tickerVisible ? "🔴 HIDE TICKER" : "🟢 SHOW TICKER"}
                        </button>
                    </div>
                    <div className="ma-row" style={{ marginTop: 8, padding: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4 }}>
                        <label style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', color: '#cbd5e1' }}>
                            <span>Auto Repeat (Loop)</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className={`ma-btn ${!tickerAutoRepeat ? 'bg-red-600 text-white' : 'ma-btn-undo'}`} style={{ padding: '4px 12px' }} onClick={() => pushTicker({ autoRepeat: false })}>OFF</button>
                                <button className={`ma-btn ${tickerAutoRepeat ? 'bg-green-600 text-white' : 'ma-btn-undo'}`} style={{ padding: '4px 12px' }} onClick={() => pushTicker({ autoRepeat: true })}>ON</button>
                            </div>
                        </label>
                    </div>
                </Section>

                {/* ── 8. MATCH SITUATION ───────────────────────────────── */}
                <Section label="MATCH SITUATION" color="blue" icon="📊" open={!!openSections.matchSituation} onClick={() => toggle("matchSituation")}>
                    <div className="ma-row">
                        <label>CRR</label>
                        <input type="text" className="ma-inp" placeholder="e.g. 7.25" value={msCrr} onChange={(e) => setMsCrr(e.target.value)} />
                    </div>
                    <div className="ma-row">
                        <label>RRR</label>
                        <input type="text" className="ma-inp" placeholder="e.g. 8.10" value={msRrr} onChange={(e) => setMsRrr(e.target.value)} />
                    </div>
                    <div className="ma-row">
                        <label>Target</label>
                        <input type="number" className="ma-inp" placeholder="e.g. 145" value={msTarget} onChange={(e) => setMsTarget(e.target.value)} />
                    </div>
                    <div className="ma-row">
                        <label>Overs Left</label>
                        <input type="text" className="ma-inp" placeholder="e.g. 5.0" value={msOvers} onChange={(e) => setMsOvers(e.target.value)} />
                    </div>
                    <div className="ma-row">
                        <label>Wickets</label>
                        <input type="number" className="ma-inp" placeholder="e.g. 6" value={msWickets} onChange={(e) => setMsWickets(e.target.value)} />
                    </div>
                    <div className="ma-row" style={{ alignItems: 'flex-start' }}>
                        <label style={{ paddingTop: '6px' }}>Message</label>
                        <input type="text" className="ma-inp" placeholder="Need 25 runs in 12 balls" value={msMsg} onChange={(e) => setMsMsg(e.target.value)} />
                    </div>
                    <div className="ma-btn-row" style={{ marginTop: 4 }}>
                        <button className="ma-btn ma-btn-blue" onClick={() => {
                            push({
                                showMatchSituation: true,
                                matchSituation: {
                                    crr: msCrr || null,
                                    rrr: msRrr || null,
                                    target: msTarget ? parseInt(msTarget) : null,
                                    oversRemaining: msOvers || null,
                                    wicketsInHand: msWickets ? parseInt(msWickets) : null,
                                    customMsg: msMsg || null,
                                }
                            });
                        }}>📡 UPDATE</button>
                        <button className="ma-btn ma-btn-hide" onClick={() => {
                            push({ showMatchSituation: false, matchSituation: {} });
                            setMsCrr(''); setMsRrr(''); setMsTarget(''); setMsOvers(''); setMsWickets(''); setMsMsg('');
                        }}>✖ CLEAR</button>
                    </div>
                    <div style={{ marginTop: 4, padding: '6px', background: 'rgba(96,165,250,0.05)', borderRadius: 4, fontSize: '9px', color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                        Leave fields blank to use auto-calculated values
                    </div>
                </Section>

            </div>

            {/* ═══ STICKY BOTTOM — QUICK SCORE BAR ═════════════════════ */}
            {showRunOutPanel ? (
                <div className="ma-sticky-bar" style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', background: 'linear-gradient(to top, #7f1d1d, #991b1b)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                            <label style={{ fontSize: '9px', fontWeight: 'bold', color: '#fca5a5', textTransform: 'uppercase', marginBottom: '2px' }}>Runs</label>
                            <select className="ma-inp" style={{ padding: '4px', fontSize: '11px', height: 'auto' }} value={runOutRuns} onChange={(e) => setRunOutRuns(parseInt(e.target.value))}>
                                {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 2 }}>
                            <label style={{ fontSize: '9px', fontWeight: 'bold', color: '#fca5a5', textTransform: 'uppercase', marginBottom: '2px' }}>Who is Out?</label>
                            <select className="ma-inp" style={{ padding: '4px', fontSize: '11px', height: 'auto' }} value={runOutPlayer} onChange={(e) => setRunOutPlayer(e.target.value)}>
                                <option value="striker">Striker</option>
                                <option value="non-striker">Non-Striker</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => setShowRunOutPanel(false)} style={{ flex: 1, backgroundColor: 'transparent', color: '#fca5a5', border: '1px solid #fca5a5', borderRadius: '4px', padding: '6px', fontSize: '10px', fontWeight: 'bold' }}>CANCEL</button>
                        <button onClick={() => debounce(() => handleRunOut())} style={{ flex: 2, backgroundColor: 'white', color: '#991b1b', border: 'none', borderRadius: '4px', padding: '6px', fontSize: '10px', fontWeight: 'bold' }}>SUMBIT RUN OUT</button>
                    </div>
                </div>
            ) : (
                <div className="ma-sticky-bar">
                    <button className="ma-sq ma-sq-dot" onClick={() => debounce(() => addRun(0))}>•</button>
                    <button className="ma-sq ma-sq-run" onClick={() => debounce(() => addRun(1))}>1</button>
                    <button className="ma-sq ma-sq-run" onClick={() => debounce(() => addRun(2))}>2</button>
                    <button className="ma-sq ma-sq-run" onClick={() => debounce(() => addBoundary(4))}>4</button>
                    <button className="ma-sq ma-sq-six" onClick={() => debounce(() => addBoundary(6))}>6</button>
                    <button className="ma-sq ma-sq-nb"  onClick={() => debounce(() => addExtra("NB", 0))}>NB</button>
                    <button className="ma-sq ma-sq-wkt" onClick={() => debounce(() => handleWicket())}>W</button>
                    <button className="ma-sq ma-sq-wkt" style={{ fontSize: '10px', backgroundColor: '#7f1d1d' }} onClick={() => setShowRunOutPanel(true)}>RO</button>
                    <button className={`ma-sq ${isOverReady ? 'ma-sq-over-ready' : 'ma-sq-undo'}`} onClick={() => debounce(() => isOverReady ? handleOverCompleted() : handleUndo())}>{isOverReady ? '⚡' : '↶'}</button>
                </div>
            )}

            {/* Keyboard hint */}
            <div className="ma-hints">Keys: 0-4,6 = Runs · W = Wicket · S = Swap · U = Undo · NB = No Ball</div>

            {showNextMatch && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
                    <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '16px', width: '100%', maxWidth: '380px', color: '#f8fafc', textTransform: 'uppercase' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '8px', marginBottom: '12px' }}>
                            <h3 style={{ fontSize: '12px', fontWeight: '900', color: '#eab308', margin: 0 }}>⚡ DEPLOY NEXT MATCH</h3>
                            <button onClick={() => setShowNextMatch(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '14px', cursor: 'pointer' }}>✕</button>
                        </div>
                        
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const form = e.target;
                            const body = {
                                battingTeam: form.battingTeam.value.toUpperCase(),
                                bowlingTeam: form.bowlingTeam.value.toUpperCase(),
                                maxOvers: parseInt(form.maxOvers.value) || 20,
                                ballsPerOver: parseInt(form.ballsPerOver.value) || 6,
                                matchType: form.matchType.value,
                                matchTitle: form.matchTitle.value,
                                themeID: form.themeID.value,
                                matchDate: new Date().toISOString().split('T')[0],
                            };

                            try {
                                const tId = typeof match.tournamentId === 'object' ? (match.tournamentId?.id || match.tournamentId?._id) : match.tournamentId;
                                const res = await tournamentsApi.nextMatch(tId, body);
                                setShowNextMatch(false);
                                if (res.matchId) {
                                    window.location.href = `/mini-admin/${res.matchId}`;
                                }
                            } catch (err) {
                                alert(err.message || "Failed to switch match");
                            }
                        }} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                                    <label style={{ fontSize: '9px', fontWeight: 'bold', color: '#94a3b8' }}>Batting Team</label>
                                    <input name="battingTeam" required placeholder="COLOMBIA XI" style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '4px', padding: '6px', fontSize: '11px', color: 'white' }} />
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                                    <label style={{ fontSize: '9px', fontWeight: 'bold', color: '#94a3b8' }}>Bowling Team</label>
                                    <input name="bowlingTeam" required placeholder="VAVUNIYA LIONS" style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '4px', padding: '6px', fontSize: '11px', color: 'white' }} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '6px' }}>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                                    <label style={{ fontSize: '9px', fontWeight: 'bold', color: '#94a3b8' }}>Format</label>
                                    <select name="matchType" style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '4px', padding: '6px', fontSize: '11px', color: 'white' }}>
                                        <option value="T20">T20</option>
                                        <option value="T10">T10</option>
                                        <option value="ODI">ODI</option>
                                        <option value="Test">Test</option>
                                        <option value="Custom">Custom</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                                    <label style={{ fontSize: '9px', fontWeight: 'bold', color: '#94a3b8' }}>Max Overs</label>
                                    <input name="maxOvers" type="number" defaultValue="20" style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '4px', padding: '6px', fontSize: '11px', color: 'white' }} />
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                                    <label style={{ fontSize: '9px', fontWeight: 'bold', color: '#94a3b8' }}>Balls/Over</label>
                                    <input name="ballsPerOver" type="number" defaultValue="6" style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '4px', padding: '6px', fontSize: '11px', color: 'white' }} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                                    <label style={{ fontSize: '9px', fontWeight: 'bold', color: '#94a3b8' }}>Stage / Match Title</label>
                                    <input name="matchTitle" placeholder="GRAND FINAL" style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '4px', padding: '6px', fontSize: '11px', color: 'white' }} />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                                <label style={{ fontSize: '9px', fontWeight: 'bold', color: '#94a3b8' }}>Overlay Theme</label>
                                <select name="themeID" style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '4px', padding: '6px', fontSize: '11px', color: 'white' }}>
                                    <option value="IPL_GOLD">IPL Classic</option>
                                    <option value="IPL_2026">🏏 IPL 2026</option>
                                    <option value="NEW_IPL">🆕 NEW IPL</option>
                                    <option value="WC2026">🏆 T20 WC 2026</option>
                                    <option value="SKY_PRO">Sky Sports</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #1e293b' }}>
                                <button type="button" onClick={() => setShowNextMatch(false)} style={{ backgroundColor: 'transparent', border: '1px solid #475569', color: '#cbd5e1', borderRadius: '4px', padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" style={{ backgroundColor: '#eab308', border: 'none', color: '#0f172a', borderRadius: '4px', padding: '6px 12px', fontSize: '11px', fontWeight: 'black', cursor: 'pointer' }}>🚀 Switch Match</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MiniAdmin;
