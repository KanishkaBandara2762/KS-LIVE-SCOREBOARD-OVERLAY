import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase';
import { ref, onValue, update } from 'firebase/database';
import './MiniAdmin.css';
import './MiniAdminModern.css';
import ComboboxPlayerInput from './ComboboxPlayerInput';
import LanguageSwitcher from './LanguageSwitcher';
import { useLanguage } from '../i18n/LanguageContext';
import { createMatchEvent } from '../utils/matchEvent';
import { matchesApi, tournamentsApi, subscriptionsApi, getToken, ensureBroadcastLink } from '../api';
import BroadcastStatus, { isBroadcastLocked } from './BroadcastStatus';
import TossModal from './TossModal';
import LogoUpload from './LogoUpload';
import NewBatterModal from './NewBatterModal';
import NewBowlerModal from './NewBowlerModal';
import FreehitIndicator from './FreehitIndicator';
import OverthrowPanel from './OverthrowPanel';
import PenaltyRunsPanel from './PenaltyRunsPanel';
import BallByBallHistory from './BallByBallHistory';
import SuperOverPanel from './SuperOverPanel';
import MatchFormatRulesModal from './MatchFormatRulesModal';


const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);
// MongoDB matches have matchId like KS-XXXXXXXX
const isMongoDB = (id) => true;

const getAbsoluteUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
    return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

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
    const [activeTab, setActiveTab] = useState('score');
    const [overCooldown, setOverCooldown] = useState(false);
    const [showNextMatch, setShowNextMatch] = useState(false);

    // ── Run Out State ─────────────────────────────────────────────
    const [showRunOutPanel, setShowRunOutPanel] = useState(false);
    const [showMoreExtras, setShowMoreExtras] = useState(false);
    const [runOutRuns, setRunOutRuns] = useState(0);
    const [runOutPlayer, setRunOutPlayer] = useState('striker');
    const [showLivePreview, setShowLivePreview] = useState(false);
    const [obsCopied, setObsCopied] = useState(false);
    const [isObsActive, setIsObsActive] = useState(false);
    const [obsOverride, setObsOverride] = useState(null); // set right after generating a link
    const [, setObsTick] = useState(0); // forces re-render when the 24h window ends
    const [newBattingPlayer, setNewBattingPlayer] = useState("");
    const [newBowlingPlayer, setNewBowlingPlayer] = useState("");

    // ── v2.1 NEW STATE ────────────────────────────────────────────────────
    const [showTossModal, setShowTossModal] = useState(false);

    // ── Broadcast Graphics Panel State (v3.1) ───────────────────────────────
    const [bgAutoHide, setBgAutoHide] = useState('off');   // 'off' | '10s' | '20s' | '30s'
    const bgAutoHideTimer = useRef(null);
    const [bgCustomText, setBgCustomText] = useState('');
    const [bgOnAir, setBgOnAir] = useState(false);
    const [potmName, setPotmName] = useState('');
    const [potmTeam, setPotmTeam] = useState('');
    const [potmFigures, setPotmFigures] = useState('');
    const [showPotmModal, setShowPotmModal] = useState(false);
    // We use refs so pushOverlay/hideAllGraphics can be defined once and always see latest push/match/bgAutoHide
    const pushRef = useRef(null);
    const matchRef = useRef(null);
    const bgAutoHideRef = useRef('off');
    useEffect(() => { bgAutoHideRef.current = bgAutoHide; }, [bgAutoHide]);

    const pushOverlay = useCallback((patch, hideKeys = []) => {
        const pushFn = pushRef.current;
        const curMatch = matchRef.current;
        if (!pushFn) return;
        const os = { ...(curMatch?.overlaySettings || {}), ...patch };
        pushFn({ overlaySettings: os });
        if (hideKeys.length && bgAutoHideRef.current !== 'off') {
            if (bgAutoHideTimer.current) clearTimeout(bgAutoHideTimer.current);
            const ms = { '10s': 10000, '20s': 20000, '30s': 30000 }[bgAutoHideRef.current] || 0;
            if (ms > 0) {
                bgAutoHideTimer.current = setTimeout(() => {
                    const hidePatch = {};
                    hideKeys.forEach(k => { hidePatch[k] = false; });
                    pushFn({ overlaySettings: { ...(matchRef.current?.overlaySettings || {}), ...hidePatch } });
                }, ms);
            }
        }
    }, []);

    const hideAllGraphics = useCallback(() => {
        const pushFn = pushRef.current;
        const curMatch = matchRef.current;
        if (!pushFn) return;
        if (bgAutoHideTimer.current) clearTimeout(bgAutoHideTimer.current);
        pushFn({ overlaySettings: {
            ...(curMatch?.overlaySettings || {}),
            showVersus: false,
            showSummary: false,
            showMatchSituation: false,
            showToss: false,
            showPlayerOfMatch: false,
            showPartnership: false,
            showSquadList: false,
            showMatchWon: false,
            showNeedRun: false,
            showNeedRunStrip: false,
            showLastOut: false,
            showCustomText: false,
            showTournamentMostRuns: false,
            showTournamentMostWickets: false,
            showTournamentBoundaries: false,
            showPointsTable: false,
            showUpcoming: false,
            showResults: false,
        }});
    }, []);

    useEffect(() => {
        if (getToken()) {
            subscriptionsApi.getRemainingTime()
                .then(res => {
                    setIsObsActive(res && res.status === 'active' && res.total_seconds_remaining > 0);
                })
                .catch(() => setIsObsActive(false));
        }
    }, []);
    const [showNewBatterModal, setShowNewBatterModal] = useState(false);
    const [showNewBowlerModal, setShowNewBowlerModal] = useState(false);
    const [newBatterSlot, setNewBatterSlot] = useState(null); // 'player1' | 'player2'
    const [outPlayerName, setOutPlayerName] = useState('');
    const [showBowlerHistory, setShowBowlerHistory] = useState(false);
    const [showWicketPanel, setShowWicketPanel] = useState(false);
    const [wicketDismissal, setWicketDismissal] = useState('Bowled');
    const [wicketFielder, setWicketFielder] = useState('');
    const [wicketDismissedBatter, setWicketDismissedBatter] = useState('striker');
    const [wicketRunsCompleted, setWicketRunsCompleted] = useState(0);
    const [wicketDeliveryLegality, setWicketDeliveryLegality] = useState('legal');
    const [wicketStumpedWide, setWicketStumpedWide] = useState(false);
    const [showFormatModal, setShowFormatModal] = useState(false);
    const [openAdvPanels, setOpenAdvPanels] = useState({
        overthrow: false,
        penalty: false,
        history: false,
        superOver: false,
    });
    const toggleAdv = (key) => setOpenAdvPanels(p => ({ ...p, [key]: !p[key] }));

    // Always use the real hostname/IP — OBS blocks WebSockets to 'localhost'
    // so we replace it with the actual network IP the browser is currently using.
    const overlayUrl = typeof window !== "undefined" ? `${window.location.origin}/overlay/${matchId}` : `/overlay/${matchId}`;
    const obsUrl = typeof window !== "undefined"
        ? (import.meta.env.PROD
            ? `${window.location.origin}/overlay/${matchId}`
            : `${window.location.protocol}//${window.location.hostname}:${window.location.port || 5173}/overlay/${matchId}`)
        : `/overlay/${matchId}`;

    const obsExpiresAt = obsOverride ? obsOverride.expiresAt : (match?.broadcastExpiresAt ?? null);
    const obsLockedNow = obsOverride
        ? isBroadcastLocked({ broadcastLocked: obsOverride.locked, broadcastExpiresAt: obsOverride.expiresAt })
        : isBroadcastLocked({ broadcastLocked: match?.broadcastLocked, broadcastExpiresAt: match?.broadcastExpiresAt });

    const copyOBSLink = async () => {
        const res = await ensureBroadcastLink({ matchId, locked: obsLockedNow });
        if (!res) return;
        setObsOverride({ expiresAt: res.broadcastExpiresAt ?? null, locked: false });
        navigator.clipboard.writeText(obsUrl).then(() => {
            setObsCopied(true);
            setTimeout(() => setObsCopied(false), 2500);
        });
    };

    // ── Debounce: prevents double-click duplicate entries (100ms) ─
    const debounceRef = useRef(false);

    // Write sequence: a server response or poll is applied only if no newer write
    // started after it, so an old response can't roll the score back (blink).
    const writeSeqRef = useRef(0);
    const beginWrite = () => ++writeSeqRef.current;
    const applyServerMatch = (seq, serverMatch) => {
        if (!serverMatch || seq !== writeSeqRef.current) return;
        setMatch(prev => (prev ? { ...prev, ...serverMatch } : serverMatch));
    };
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
            // Initial and periodic load from REST
            const loadMatch = () => {
                const seqAtRequest = writeSeqRef.current;
                matchesApi.get(matchId)
                    .then(res => {
                        if (res.match && seqAtRequest === writeSeqRef.current) {
                            // Flatten overlay settings for backward compatibility
                            const flattenedMatch = {
                                ...res.match,
                                themeID: res.match.overlaySettings?.themeID || 'ICC_GLOBAL',
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
            };
            loadMatch();

            // Socket.IO is unavailable on Netlify Functions — poll instead.
            const useSocket =
                import.meta.env.VITE_REALTIME_MODE === 'socket' ||
                (!import.meta.env.PROD && import.meta.env.VITE_REALTIME_MODE !== 'polling');
            let socket;
            if (useSocket) {
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
            }

            const pollMs = Number(import.meta.env.VITE_LIVE_POLL_MS) || (import.meta.env.PROD ? 3000 : 30000);
            const poll = useSocket ? null : setInterval(loadMatch, pollMs);

            return () => {
                if (socket) socket.disconnect();
                if (poll) clearInterval(poll);
            };
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
                const seq = beginWrite();
                matchesApi.updatePlayers(matchId, playerChanges)
                    .then(res => { if (!hasGeneric) applyServerMatch(seq, res.match); })
                    .catch(() => {});
            }
            if (hasGeneric) {
                beginWrite();
                matchesApi.updateMatch(matchId, genericChanges).catch(() => {});
            }
        } else {
            const payload = changes?.eventTrigger ? { ...changes, ...createMatchEvent(changes.eventTrigger) } : changes;
            update(ref(db, dbPath), payload);
        }
    }, [matchId, dbPath, match]);
    // Keep pushRef in sync so pushOverlay/hideAllGraphics always have the latest push
    useEffect(() => { pushRef.current = push; }, [push]);
    // Keep matchRef in sync
    useEffect(() => { matchRef.current = match; }, [match]);

    const pushEvent = useCallback((changes, eventTrigger) => {
        if (isMongoDB(matchId)) {
            // Map to delivery type for score engine
            const deliveryMap = { WICKET: 'wicket', FOUR: '4', SIX: '6', NEW_OVER: null };
            const delivery = deliveryMap[eventTrigger];
            if (delivery) {
                setMatch(prev => prev ? { ...prev, ...changes } : changes);
                const seq = beginWrite();
                matchesApi.updateScore(matchId, { delivery, extraRuns: 0 })
                    .then(res => applyServerMatch(seq, res.match))
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
    const pushDelivery = useCallback((delivery, extraRuns = 0, firebaseChanges = {}, apiExtraPayload = {}) => {
        if (isMongoDB(matchId)) {
            const seq = beginWrite();
            matchesApi.updateScore(matchId, { delivery, extraRuns, ...apiExtraPayload })
                .then(res => applyServerMatch(seq, res.match))
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

    const handleWicket = (customOpts = {}) => {
        if (!match || match.overLocked) return;
        setHistory(h => [...h, match]);

        const type = customOpts.dismissalType || wicketDismissal || 'Bowled';
        const fielder = customOpts.fielderName !== undefined ? customOpts.fielderName : wicketFielder;
        const dismissedTarget = customOpts.dismissedBatter || wicketDismissedBatter || 'striker';
        const runsDone = customOpts.runsCompleted !== undefined ? customOpts.runsCompleted : wicketRunsCompleted;
        const isStumpWide = customOpts.isStumpingFromWide !== undefined ? customOpts.isStumpingFromWide : wicketStumpedWide;
        const delivLegality = customOpts.deliveryLegality || wicketDeliveryLegality || 'legal';

        const p1IsStriker = match.player1.onStrike;
        const strikerKey = p1IsStriker ? "player1" : "player2";
        const nonStrikerKey = p1IsStriker ? "player2" : "player1";
        const outKey = dismissedTarget === 'nonStriker' ? nonStrikerKey : strikerKey;
        const survivingKey = outKey === 'player1' ? 'player2' : 'player1';
        const op = match[outKey] || { name: 'BATTER', runs: 0, balls: 0 };

        const isRetirement = type === 'Retired Hurt' || type === 'Absent Hurt';
        const isNonBall = isRetirement || type === 'Timed Out' || type === 'Retired Out' || type === 'Run Out (Mankad)';

        // Credit bowler with wicket only for standard bowler dismissals:
        const BOWLER_CREDITED = ['Bowled', 'Caught', 'Caught Behind', 'Caught & Bowled', 'LBW', 'Stumped', 'Hit Wicket'];
        const creditsBowler = !isRetirement && BOWLER_CREDITED.includes(type);
        const effectiveFielder = type === 'Caught & Bowled' ? (match.bowler?.name || 'Bowler') : fielder;

        if (isMongoDB(matchId)) {
            let delivery = 'wicket';
            if (type === 'Timed Out') delivery = 'timedout';
            else if (type === 'Retired Out') delivery = 'retired_out';
            else if (type === 'Retired Hurt') delivery = 'retired_hurt';
            else if (type === 'Absent Hurt') delivery = 'absent_hurt';
            else if (type === 'Run Out (Mankad)') delivery = 'retired_out';
            else if (isStumpWide || (type === 'Stumped' && delivLegality === 'wide')) delivery = 'wide';
            else if (delivLegality === 'wide') delivery = 'wide';
            else if (delivLegality === 'noball') delivery = 'noball';

            pushDelivery(delivery, runsDone, {}, {
                dismissalType: type,
                fielderName: effectiveFielder,
                dismissedBatter: outKey,
                deliveryLegality: delivLegality,
                isStumpingFromWide: isStumpWide,
                runsCompleted: runsDone,
            });
        } else {
            // Local / Firebase state handling
            const ballEntry = isNonBall ? null : (isStumpWide || delivLegality === 'wide' ? 'W+WD' : (delivLegality === 'noball' ? 'W+NB' : 'W'));
            const { recentBalls, overRuns } = ballEntry ? updateOverHistory(ballEntry, match, runsDone) : { recentBalls: match.recentBalls, overRuns: match.overRuns };
            
            const newWickets = isRetirement ? match.wickets : match.wickets + 1;
            const extraPenalty = (isStumpWide || delivLegality === 'wide' || delivLegality === 'noball') ? 1 : 0;
            const newScore = match.score + runsDone + extraPenalty;

            let p1Strike = match.player1.onStrike;
            let p2Strike = match.player2.onStrike;
            if (runsDone % 2 !== 0) {
                p1Strike = !p1Strike;
                p2Strike = !p2Strike;
            }

            const outKeyStrikeStatus = outKey === 'player1' ? p1Strike : p2Strike;

            const updatedPayload = {
                score: newScore,
                wickets: newWickets,
                totalBalls: isNonBall ? match.totalBalls : match.totalBalls + 1,
                recentBalls,
                overRuns,
                lastWicketName: op.name,
                lastWicketRuns: op.runs,
                lastWicketBalls: op.balls,
                lastWicketDismissal: type,
                lastWicketFielder: effectiveFielder,
                [outKey]: { name: "NEW PLAYER", runs: 0, balls: 0, fours: 0, sixes: 0, onStrike: outKeyStrikeStatus },
                [survivingKey]: { ...match[survivingKey], onStrike: survivingKey === 'player1' ? p1Strike : p2Strike },
                legalBallCount: (isNonBall || isStumpWide || delivLegality !== 'legal') ? match.legalBallCount : (match.legalBallCount || 0) + 1,
                ...getManualBallsUpdate(),
            };

            if (!isRetirement) {
                updatedPayload.fallOfWickets = [
                    ...(match.fallOfWickets || []),
                    {
                        name: op.name,
                        runs: op.runs,
                        balls: op.balls,
                        bowler: creditsBowler ? (match.bowler?.name || '') : '',
                        fowScore: newScore,
                        fowWicket: newWickets,
                        dismissalType: type,
                        fielderName: effectiveFielder,
                    }
                ];
            }

            pushEvent(updatedPayload, isRetirement ? (type === 'Absent Hurt' ? 'ABSENT_HURT' : 'RETIRED_HURT') : "WICKET");
        }

        setShowWicketPanel(false);
        // Show new batter selection modal
        setOutPlayerName(op.name);
        setNewBatterSlot(outKey);
        setShowNewBatterModal(true);
    };

    const handleNewBatterConfirm = (playerName) => {
        setShowNewBatterModal(false);
        if (!playerName || !newBatterSlot) return;
        const isRetirement = wicketDismissal === 'Retired Hurt' || wicketDismissal === 'Absent Hurt';
        const retiredStatus = wicketDismissal === 'Absent Hurt' ? 'absent_hurt' : 'retired_hurt';
        // Update squad status
        const updatedSquad = (match.battingSquad || []).map(p => {
            const name = p.name || p;
            if (name === outPlayerName && outPlayerName !== playerName) {
                return { ...p, status: isRetirement ? retiredStatus : 'out' };
            }
            if (name === playerName) return { ...p, status: 'batting' };
            return p;
        });
        const currentSlotBatter = match[newBatterSlot];
        const isFresh = !currentSlotBatter?.runs && !currentSlotBatter?.balls;
        push({
            [newBatterSlot]: {
                name: playerName,
                runs: isFresh ? 0 : (currentSlotBatter?.runs || 0),
                balls: isFresh ? 0 : (currentSlotBatter?.balls || 0),
                fours: isFresh ? 0 : (currentSlotBatter?.fours || 0),
                sixes: isFresh ? 0 : (currentSlotBatter?.sixes || 0),
                onStrike: currentSlotBatter?.onStrike ?? true
            },
            battingSquad: updatedSquad,
        });
    };

    const handleNewBowlerConfirm = (playerName) => {
        setShowNewBowlerModal(false);
        handleChangeBowler({ name: playerName });
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

    const handleUndo = async () => {
        if (history.length === 0 && !isMongoDB(matchId)) return;
        
        if (isMongoDB(matchId)) {
            try {
                const seq = beginWrite();
                const res = await matchesApi.undoLastBall(matchId);
                applyServerMatch(seq, res.match);
            } catch (err) {
                console.error("Undo failed:", err);
                alert("Failed to undo last ball.");
            }
        } else {
            const prev = history[history.length - 1];
            setHistory(h => h.slice(0, -1));
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
            bowler: { name: "SELECT BOWLER", legalBalls: 0, overs: 0, maidens: 0, runs: 0, wickets: 0, economy: 0, figures: "0-0 (0.0)" },
            bowlerHistory: [],
            battingScorecard: [],
            fallOfWickets: [], firstInningsScore: 0, firstInningsWickets: 0, firstInningsOvers: 0,
            extras: { wides: 0, noballs: 0, byes: 0, legbyes: 0, total: 0 },
            partnership: { runs: 0, balls: 0 },
            eventTrigger: "RESET_WINNER",
        });
    };

    // ── New Innings — does NOT auto-set target; user sets it manually ──
    const handleNewInnings = async () => {
        if (!match) return;
        if (match.isSecondInnings) {
            alert("Match is already in the 2nd innings.");
            return;
        }
        if (!window.confirm(`Start 2nd Innings?\n1st Innings Score: ${match.score}\nYou will need to set the target manually.\nThis will reset scores.`)) return;
        
        if (isMongoDB(matchId)) {
            try {
                const res = await matchesApi.startSecondInnings(matchId);
                if (res.match) setMatch(res.match);
            } catch (err) {
                console.error("Failed to start second innings:", err);
                alert("Failed to start second innings.");
            }
        } else {
            setHistory([]);
            push({
                firstInningsScore: match.score,
                firstInningsWickets: match.wickets,
                firstInningsOvers: match.legalBallCount,
                score: 0, wickets: 0, totalBalls: 0, currentOver: 0,
                overRuns: 0, recentBalls: [], legalBallCount: 0,
                isSecondInnings: true,
                targetScore: 0,
                player1: { name: "", runs: 0, balls: 0, onStrike: true },
                player2: { name: "", runs: 0, balls: 0, onStrike: false },
                bowler: { name: "SELECT BOWLER", legalBalls: 0, overs: 0, maidens: 0, runs: 0, wickets: 0, economy: 0, figures: "0-0 (0.0)" },
                battingScorecard: [],
                bowlerHistory: [],
                fallOfWickets: [],
                extras: { wides: 0, noballs: 0, byes: 0, legbyes: 0, total: 0 },
                partnership: { runs: 0, balls: 0 },
                eventTrigger: "RESET_WINNER",
            });
        }
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
            // FIX: For MongoDB, the backend updateScore already flips the striker/non-striker
            // when the 6th legal delivery completes the over (result.overCompleted = true).
            // Do NOT flip here again — that would double-flip and cancel the correct swap.
            // Only increment currentOver, unlock the over, and reset the bowler slot.
            push({
                currentOver: (match.currentOver || 0) + 1,
                overLocked: false,
                bowler: { name: 'SELECT BOWLER', figures: '0-0 (0.0)' },
                eventTrigger: "NEW_OVER",
            });
            setShowNewBowlerModal(true); // FIX: Prompt for next bowler
        } else {
            pushEvent({
                recentBalls: [],
                overRuns: 0,
                legalBallCount: 0,
                currentOver: (match.currentOver || 0) + 1,
                overLocked: false,
                bowler: { name: 'SELECT BOWLER', figures: '0-0 (0.0)' },
                player1: { ...match.player1, onStrike: !match.player1.onStrike },
                player2: { ...match.player2, onStrike: !match.player2.onStrike },
            }, "NEW_OVER");
            setShowNewBowlerModal(true);
        }
    };

    // ── Keyboard shortcuts ─────────────────────────────────────────────
    const handlerRef = useRef(null);
    handlerRef.current = { addRun, addBoundary, handleWicket, swapStrike, handleUndo, setShowWicketPanel, showWicketPanel, wicketDismissal, wicketFielder };

    useEffect(() => {
        const handler = (e) => {
            const h = handlerRef.current;
            if (e.key === "Enter" && h.showWicketPanel) {
                e.preventDefault();
                h.handleWicket();
                return;
            }
            if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
            const k = e.key.toLowerCase();
            if (["0", "1", "2", "3"].includes(k)) h.addRun(parseInt(k));
            if (k === "4") h.addBoundary(4);
            if (k === "6") h.addBoundary(6);
            if (k === "w") {
                if (h.showWicketPanel) h.handleWicket();
                else h.setShowWicketPanel(true);
            }
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
    const battingSquad = Array.isArray(match.battingSquad) ? match.battingSquad : [];
    const bowlingSquad = Array.isArray(match.bowlingSquad) ? match.bowlingSquad : [];
    const normalizePlayerName = (value) => value.trim().toUpperCase();
    const addSquadPlayer = (side) => {
        const rawName = side === "batting" ? newBattingPlayer : newBowlingPlayer;
        const name = normalizePlayerName(rawName);
        if (!name) return;
        const squadKey = side === "batting" ? "battingSquad" : "bowlingSquad";
        const currentSquad = side === "batting" ? battingSquad : bowlingSquad;
        if (currentSquad.some((player) => normalizePlayerName(player.name || "") === name)) return;
        push({ [squadKey]: [...currentSquad, { id: Date.now(), name }] });
        if (side === "batting") setNewBattingPlayer("");
        if (side === "bowling") setNewBowlingPlayer("");
    };
    const removeSquadPlayer = (side, index) => {
        const squadKey = side === "batting" ? "battingSquad" : "bowlingSquad";
        const currentSquad = side === "batting" ? battingSquad : bowlingSquad;
        push({ [squadKey]: currentSquad.filter((_, itemIndex) => itemIndex !== index) });
    };
    const setBatterSlot = (slotKey, player) => {
        push({ [slotKey]: { ...match[slotKey], name: player.name } });
    };
    const handleChangeBowler = async (player) => {
        if (!player || !player.name) return;
        if (isMongoDB(matchId)) {
            try {
                const res = await matchesApi.changeBowler(matchId, { bowlerName: player.name });
                if (res.match) setMatch(res.match);
            } catch (err) {
                console.error("Failed to change bowler:", err);
            }
        } else {
            push({ bowler: { ...match.bowler, name: player.name } });
        }
    };
    const totalMatchBalls = match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * bpo;
    const legalBallCount = match.legalBallCount || 0;
    const remainingBalls = match.manualBallsOverride ? (match.manualBallsValue || 0) : (totalMatchBalls - legalBallCount);
    const crr = legalBallCount > 0 ? (match.score / (legalBallCount / 6)).toFixed(2) : "0.00";
    const rrr = match.isSecondInnings && remainingBalls > 0
        ? ((match.targetScore - match.score) / (remainingBalls / 6)).toFixed(2)
        : "--";
    const isOverReady = isMongoDB(matchId) ? (legalBallCount > 0 && legalBallCount % bpo === 0) : (legalBallCount >= bpo);
    const currentOverBalls = isMongoDB(matchId) ? (legalBallCount > 0 && legalBallCount % bpo === 0 ? bpo : legalBallCount % bpo) : legalBallCount;

    return (
        <div className="ma-root">
            {showTossModal && (
                <TossModal 
                    matchId={matchId} 
                    match={match} 
                    onClose={() => setShowTossModal(false)} 
                    onUpdate={(updatedMatch) => setMatch(updatedMatch)} 
                />
            )}
            {showNewBatterModal && (
                <NewBatterModal 
                    squad={match?.battingSquad || []}
                    outPlayerName={outPlayerName}
                    slotLabel={newBatterSlot === 'player1' ? (match?.player1?.onStrike ? 'Striker' : 'Non-Striker') : (match?.player2?.onStrike ? 'Striker' : 'Non-Striker')}
                    onConfirm={handleNewBatterConfirm}
                    onClose={() => setShowNewBatterModal(false)}
                />
            )}
            {showNewBowlerModal && (
                <NewBowlerModal 
                    squad={match?.bowlingSquad || []}
                    history={match?.bowlerHistory || []}
                    onConfirm={handleNewBowlerConfirm}
                    onClose={() => setShowNewBowlerModal(false)}
                />
            )}

            {/* ══ HEADER ══════════════════════════════════════════════ */}
            <div className="ma-header">
                <div className="ma-logo">
                    <img src="/ks_logo.png" alt="KS" style={{ height: '20px', width: 'auto', objectFit: 'contain' }} />
                    KS CONTROL
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button 
                        onClick={() => setShowFormatModal(true)}
                        style={{ background: '#eab308', color: '#000', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                        title="Configure Match Format & Rules"
                    >
                        ⚙ RULES
                    </button>
                    <button 
                        onClick={() => window.open(`/control-room/${matchId}`, '_blank')}
                        style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        DESKTOP CONTROL ROOM ↗
                    </button>
                    <LanguageSwitcher compact />
                    <BroadcastStatus expiresAt={obsExpiresAt} locked={obsLockedNow} onExpire={() => setObsTick(t => t + 1)} compact />
                    <div className="ma-live-dot" />
                </div>
            </div>

            {/* ══ SCORE BAR ════════════════════════════════════════════ */}
            <div className="ma-score-bar">
                <div className="ma-teams-col">
                    <div className="ma-team-name">{match.battingTeam || "TEAM"}</div>
                    <div className="ma-vs-line">vs {match.bowlingTeam || "OPPONENT"}</div>
                </div>
                <div className="ma-score-col">
                    <span className="ma-score-big">{match.score}-{match.wickets}</span>
                    <span className="ma-score-overs">({overs(legalBallCount)})</span>
                </div>
            </div>

            {/* ══ INFO STRIP ═══════════════════════════════════════════ */}
            <div className="ma-info-strip">
                <span>INN: <b>{match.isSecondInnings ? '2ND' : '1ST'}</b></span>
                <span>STAGE: <b>{match.matchTitle || match.bowlingPrefix || '--'}</b></span>
                <span>STATUS: <b>{match.matchStatus || 'LIVE'}</b></span>
                <span>CRR: <b>{crr}</b></span>
                {match.isSecondInnings && <span>RRR: <b>{rrr}</b></span>}
                <span>OVER: <b>{match.overRuns || 0}</b></span>
            </div>

            {/* Free Hit Banner (v3.0) */}
            {match?.freeHitActive && (
                <div style={{ margin: '6px 12px 0 12px' }}>
                    <FreehitIndicator active={match.freeHitActive} />
                </div>
            )}

            {/* ══ MAIN CONTENT (tab-based) ══════════════════════════════ */}
            <div className="ma-content">

                {/* ─── SCORE TAB ──────────────────────────────────────── */}
                {activeTab === 'score' && (
                    <div className="ma-score-tab">

                        {/* Players at crease */}
                        <div className="ma-players-card">
                            <div 
                                className="ma-player-row ma-striker-row" 
                                style={{ cursor: 'pointer' }}
                                title="Click to choose or change striker"
                                onClick={() => {
                                    setOutPlayerName(striker?.name || '');
                                    setNewBatterSlot(match.player1.onStrike ? 'player1' : 'player2');
                                    setShowNewBatterModal(true);
                                }}
                            >
                                <div className="ma-player-info">
                                    <span className="ma-player-icon">🏏</span>
                                    <span className="ma-player-name">{striker?.name || 'SELECT STRIKER'}</span>
                                    <span style={{ fontSize: '10px', color: '#facc15', opacity: 0.8, marginLeft: '6px' }}>✏️</span>
                                </div>
                                <span className="ma-player-stat">{striker?.runs ?? 0}({striker?.balls ?? 0})</span>
                            </div>
                            <div className="ma-divider" />
                            <div 
                                className="ma-player-row" 
                                style={{ cursor: 'pointer' }}
                                title="Click to choose or change non-striker"
                                onClick={() => {
                                    setOutPlayerName(nonStriker?.name || '');
                                    setNewBatterSlot(match.player1.onStrike ? 'player2' : 'player1');
                                    setShowNewBatterModal(true);
                                }}
                            >
                                <div className="ma-player-info">
                                    <span className="ma-player-icon" style={{ opacity: 0.5 }}>🏏</span>
                                    <span className="ma-player-name" style={{ color: 'rgba(255,255,255,0.7)' }}>{nonStriker?.name || 'SELECT NON-STRIKER'}</span>
                                    <span style={{ fontSize: '10px', color: '#94a3b8', opacity: 0.8, marginLeft: '6px' }}>✏️</span>
                                </div>
                                <span className="ma-player-stat">{nonStriker?.runs ?? 0}({nonStriker?.balls ?? 0})</span>
                            </div>
                            <div className="ma-divider" />
                            <div 
                                className="ma-player-row" 
                                style={{ cursor: 'pointer' }}
                                title="Click to choose or change bowler"
                                onClick={() => setShowNewBowlerModal(true)}
                            >
                                <div className="ma-player-info">
                                    <span className="ma-player-icon">🎳</span>
                                    <span className="ma-player-name" style={{ color: '#a78bfa' }}>{match.bowler?.name || 'SELECT BOWLER'}</span>
                                    <span style={{ fontSize: '10px', color: '#a78bfa', opacity: 0.8, marginLeft: '6px' }}>✏️</span>
                                </div>
                                <span className="ma-player-stat" style={{ color: '#c4b5fd' }}>{match.bowler?.figures || ''}</span>
                            </div>
                        </div>

                        {/* Over alert */}
                        {legalBallCount > 0 && isOverReady && (
                            <div className="ma-over-alert">⚠️ OVER COMPLETE — Click OVER DONE below!</div>
                        )}

                        {/* Chase alert */}
                        {match.isSecondInnings && match.targetScore > 0 && (
                            <div className="ma-chase-bar">
                                Need {Math.max(0, match.targetScore - match.score)} off {remainingBalls}b · Target: {match.targetScore}
                            </div>
                        )}

{/* Scoring pad: runs + undo on the left, wicket and extras parallel on the right */}
                        <div className="ma-section-label">SCORING</div>
                        <div className="ma-score-row">
                        <div className="ma-pad">
                            <div className="ma-pad-keys">
                                <button className="ma-big-btn ma-btn-dot" onClick={() => debounce(() => addRun(0))}>•<small className="ma-key-sub">dot ball</small></button>
                                <button className="ma-big-btn ma-btn-run" onClick={() => debounce(() => addRun(1))}>1<small className="ma-key-sub">single</small></button>
                                <button className="ma-big-btn ma-btn-run" onClick={() => debounce(() => addRun(2))}>2<small className="ma-key-sub">two runs</small></button>
                                <button className="ma-big-btn ma-btn-run" onClick={() => debounce(() => addRun(3))}>3<small className="ma-key-sub">three runs</small></button>
                                <button className="ma-big-btn ma-btn-four" onClick={() => debounce(() => addBoundary(4))}>4<small className="ma-key-sub">boundary</small></button>
                                <button className="ma-big-btn ma-btn-six" onClick={() => debounce(() => addBoundary(6))}>6<small className="ma-key-sub">maximum</small></button>
                                <button className="ma-big-btn ma-btn-undo ma-pad-undo" onClick={handleUndo}>↶ UNDO (U)<small className="ma-key-sub">remove last ball</small></button>
                            </div>
                            <div className="ma-pad-side">
                                {match.extrasConfig?.wd !== false && (
                                    <button className="ma-extra-btn ma-btn-wd" onClick={() => debounce(() => addExtra('WD', 0))}>WD<small className="ma-key-sub">wide</small></button>
                                )}
                                {match.extrasConfig?.nb !== false && (
                                    <button className="ma-extra-btn ma-btn-nb" onClick={() => debounce(() => addExtra('NB', 0))}>NB<small className="ma-key-sub">no ball</small></button>
                                )}
                                {match.extrasConfig?.lb !== false && (
                                    <button className="ma-extra-btn ma-btn-lb" onClick={() => debounce(() => addLegBye(1))}>LB<small className="ma-key-sub">leg bye</small></button>
                                )}
                                {match.extrasConfig?.b !== false && (
                                    <button className="ma-extra-btn ma-btn-bye" onClick={() => debounce(() => addBye(1))}>BYE<small className="ma-key-sub">bye</small></button>
                                )}
                            </div>
                        </div>

                        <div className="ma-score-actions">
                        {/* Full-width wicket: the strongest action on the console */}
                        <button className="ma-wicket-btn ma-wicket-full" onClick={() => debounce(() => setShowWicketPanel(true))}>
                            <span className="ma-wicket-icon" aria-hidden="true">⚡</span>
                            <span className="ma-wicket-text">WICKET</span>
                            <small className="ma-wicket-hint">batter out · W</small>
                        </button>

                        {/* More extras: expandable panel for the less common variants */}
                        <button
                            className={`ma-more-toggle${showMoreExtras ? ' is-open' : ''}`}
                            aria-expanded={showMoreExtras}
                            onClick={() => setShowMoreExtras(v => !v)}
                        >
                            <span>{showMoreExtras ? 'Hide extra runs' : 'More extra runs'}</span>
                            <span className="ma-more-toggle-chevron" aria-hidden="true">▾</span>
                        </button>
                        </div>
                        </div>
                        {showMoreExtras && (
                        <div className="ma-more-extras">
                            {match.extrasConfig?.wd !== false && (
<div className="ma-more-row">
                                    <span className="ma-more-label">WD +</span>
                                    {[1,2,3,4,5].map(r => <button key={r} className="ma-extra-btn ma-btn-wd" onClick={() => debounce(() => addExtra('WD', r))}>+{r}</button>)}
                                </div>
                            )}
                            {match.extrasConfig?.nb !== false && (
                                <div className="ma-more-row">
                                    <span className="ma-more-label">NB +</span>
                                    {[1,2,3,4,5,6].map(r => <button key={r} className="ma-extra-btn ma-btn-nb" onClick={() => debounce(() => addExtra('NB', r))}>+{r}</button>)}
                                </div>
                            )}
                            {match.extrasConfig?.lb !== false && (
                                <div className="ma-more-row">
                                    <span className="ma-more-label">LB</span>
                                    {[2,3,4].map(r => <button key={r} className="ma-extra-btn ma-btn-lb" onClick={() => debounce(() => addLegBye(r))}>{r}</button>)}
                                </div>
                            )}
                            {match.extrasConfig?.b !== false && (
                                <div className="ma-more-row">
                                    <span className="ma-more-label">BYE</span>
                                    {[2,3,4].map(r => <button key={r} className="ma-extra-btn ma-btn-bye" onClick={() => debounce(() => addBye(r))}>{r}</button>)}
                                </div>
                            )}
                        </div>
                        )}


                        {/* Control row */}
                        <div className="ma-control-row">
                            <button className="ma-ctrl-btn ma-btn-swap" onClick={swapStrike}><span aria-hidden="true">⇄</span> SWAP BATSMEN (S)</button>
                            <button className="ma-ctrl-btn ma-btn-ro" onClick={() => setShowRunOutPanel(v => !v)}><span aria-hidden="true">🏃</span> RUN OUT</button>
                        </div>

                        {/* Run Out Panel (inline) */}
                        {showRunOutPanel && (
                            <div className="ma-runout-panel">
                                <div className="ma-runout-title">🏃 RUN OUT</div>
                                <div className="ma-runout-row">
                                    <div className="ma-runout-group">
                                        <div className="ma-runout-group-label">Runs scored</div>
                                        <div className="ma-runout-btns">
                                            {[0,1,2,3].map(r => (
                                                <button
                                                    key={r}
                                                    className={`ma-ro-num-btn${runOutRuns === r ? ' selected' : ''}`}
                                                    onClick={() => setRunOutRuns(r)}
                                                >{r}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="ma-runout-group">
                                        <div className="ma-runout-group-label">Who is out?</div>
                                        <div className="ma-runout-player-btns">
                                            <button
                                                className={`ma-ro-who-btn${runOutPlayer === 'striker' ? ' selected' : ''}`}
                                                onClick={() => setRunOutPlayer('striker')}
                                            >Striker<br/><span style={{fontSize:'9px',opacity:0.7}}>{striker?.name || '--'}</span></button>
                                            <button
                                                className={`ma-ro-who-btn${runOutPlayer === 'non-striker' ? ' selected' : ''}`}
                                                onClick={() => setRunOutPlayer('non-striker')}
                                            >Non-Str<br/><span style={{fontSize:'9px',opacity:0.7}}>{nonStriker?.name || '--'}</span></button>
                                        </div>
                                    </div>
                                </div>
                                <div className="ma-runout-actions">
                                    <button className="ma-ro-cancel" onClick={() => setShowRunOutPanel(false)}>✕ CANCEL</button>
                                    <button className="ma-ro-confirm" onClick={() => { debounce(() => handleRunOut()); setShowRunOutPanel(false); }}>✅ CONFIRM RUN OUT</button>
                                </div>
                            </div>
                        )}

                        {/* Over button */}
                        <button
                            onClick={handleOverCompleted}
                            disabled={!isOverReady || overCooldown}
                            className={`ma-over-btn ${isOverReady && !overCooldown ? 'ma-over-ready' : 'ma-over-wait'}`}
                        >
                            {overCooldown ? '✔ OVER LOCKED' : isOverReady ? `⚡ OVER DONE (${currentOverBalls}/${bpo})` : `⏳ ${currentOverBalls}/${bpo} BALLS`}
                        </button>

                        {/* Recent balls */}
                        <div className="ma-balls-row">
                            {(match.recentBalls || []).length === 0 && <span style={{color:'rgba(255,255,255,0.12)',fontSize:'9px'}}>No balls bowled yet</span>}
                            {(match.recentBalls || []).map((b, i) => (
                                <span key={i} className={`ma-ball ${b === 'W' ? 'ma-ball-w' : b === '•' ? 'ma-ball-dot' : typeof b === 'string' && b.startsWith('NB') ? 'ma-ball-nb' : ''}`}>{b}</span>
                            ))}
                        </div>

                        {/* Target entry (2nd innings with no target) */}
                        {match.isSecondInnings && !match.targetScore && (
                            <div className="ma-target-card">
                                <div className="ma-target-title">🎯 SET TARGET</div>
                                <div className="ma-target-hint">1st Inn: {match.firstInningsScore || 0}-{match.firstInningsWickets ?? 0} ({overs(match.firstInningsOvers || 0)})</div>
                                <div className="ma-target-inputs">
                                    <div className="ma-target-field">
                                        <label>Target Runs</label>
                                        <input id="ma-tgt-runs" type="number" className="ma-inp" placeholder={String((match.firstInningsScore || 0) + 1)} />
                                    </div>
                                    <div className="ma-target-field">
                                        <label>Total Balls</label>
                                        <input id="ma-tgt-balls" type="number" className="ma-inp" placeholder={String((match.maxOvers || 5) * bpo)} />
                                    </div>
                                </div>
                                <button
                                    className="ma-over-btn ma-over-ready"
                                    style={{ animation: 'none' }}
                                    onClick={() => {
                                        const runs = parseInt(document.getElementById('ma-tgt-runs')?.value) || 0;
                                        const balls = parseInt(document.getElementById('ma-tgt-balls')?.value) || ((match.maxOvers || 5) * bpo);
                                        if (runs <= 0) { alert('Enter a valid target'); return; }
                                        push({ targetScore: runs, targetBalls: balls });
                                    }}
                                >✅ SET TARGET</button>
                            </div>
                        )}

                        {/* ─── v3.0 ADVANCED CRICKET CONTROLS ───────────────── */}
                        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div className="ma-section-label" style={{ opacity: 0.8, color: '#facc15' }}>
                                ADVANCED SCORING & RULES
                            </div>

                            {/* Overthrow Accordion */}
                            <Section
                                label="Overthrow (Law 19.8)"
                                color="blue"
                                icon="🎯"
                                open={openAdvPanels.overthrow}
                                onClick={() => toggleAdv('overthrow')}
                            >
                                <OverthrowPanel matchId={matchId} onConfirm={() => {}} />
                            </Section>

                            {/* Penalty Runs Accordion */}
                            <Section
                                label="Penalty Runs (5 Runs)"
                                color="orange"
                                icon="🏏"
                                open={openAdvPanels.penalty}
                                onClick={() => toggleAdv('penalty')}
                            >
                                <PenaltyRunsPanel matchId={matchId} onConfirm={() => {}} />
                            </Section>

                            {/* Ball by Ball Timeline Accordion */}
                            <Section
                                label="Ball-by-Ball Timeline"
                                color="purple"
                                icon="📋"
                                open={openAdvPanels.history}
                                onClick={() => toggleAdv('history')}
                            >
                                <BallByBallHistory matchId={matchId} />
                            </Section>

                            {/* Super Over Accordion */}
                            <Section
                                label="Super Over Tie-breaker"
                                color="pink"
                                icon="⚡"
                                open={openAdvPanels.superOver}
                                onClick={() => toggleAdv('superOver')}
                            >
                                <SuperOverPanel
                                    matchId={matchId}
                                    team1={match.battingTeam}
                                    team2={match.bowlingTeam}
                                    isSuperOverActive={match.isSuperOver}
                                    onStarted={() => {}}
                                />
                            </Section>
                        </div>

                    </div>
                )}

                {/* ─── MATCH TAB ──────────────────────────────────────── */}
                {activeTab === 'match' && (
                    <div className="ma-match-tab">

                        {/* Teams */}
                        <div className="ma-card">
                            <div className="ma-card-title">Teams</div>
                            <div className="ma-field-row">
                                <span className="ma-field-label">Batting</span>
                                <input type="text" className="ma-inp" value={match.battingTeam || ''} onChange={e => push({ battingTeam: e.target.value.toUpperCase() })} />
                            </div>
                            <div className="ma-field-row">
                                <span className="ma-field-label">Bowling</span>
                                <input type="text" className="ma-inp" value={match.bowlingTeam || ''} onChange={e => push({ bowlingTeam: e.target.value.toUpperCase() })} />
                            </div>
                            <button
                                className="ma-over-btn ma-over-wait"
                                style={{ cursor: 'pointer', color: '#60a5fa', borderColor: 'rgba(96,165,250,0.2)' }}
                                onClick={() => push({ battingTeam: match.bowlingTeam, bowlingTeam: match.battingTeam, battingLogo: match.leagueLogo, leagueLogo: match.battingLogo })}
                            >↔ SWAP TEAMS</button>
                        </div>

                        {/* Logos */}
                        <div className="ma-card">
                            <div className="ma-card-title">Team Logos</div>
                            <div className="ma-field-row">
                                <span className="ma-field-label">Bat Logo</span>
                                <div style={{flex: 1, display: 'flex', gap: '8px', alignItems: 'center'}}>
                                    {match.overlaySettings?.battingLogo && (
                                        <img src={getAbsoluteUrl(match.overlaySettings.battingLogo)} 
                                             alt="Batting Team Logo" 
                                             className="ma-logo-preview" 
                                         />
                                    )}
                                    <LogoUpload 
                                        matchId={matchId} 
                                        side="batting" 
                                        currentUrl={match.overlaySettings?.battingLogo}
                                        isMongoDB={isMongoDB(matchId)}
                                        onUploaded={(url) => push({ overlaySettings: { ...match.overlaySettings, battingLogo: url } })} 
                                    />
                                </div>
                            </div>
                            <div className="ma-field-row">
                                <span className="ma-field-label">Bowl Logo</span>
                                <div style={{flex: 1, display: 'flex', gap: '8px', alignItems: 'center'}}>
                                    {match.overlaySettings?.leagueLogo && (
                                        <img src={getAbsoluteUrl(match.overlaySettings.leagueLogo)} 
                                             alt="Bowling Team Logo" 
                                             className="ma-logo-preview" 
                                         />
                                    )}
                                    <LogoUpload 
                                        matchId={matchId} 
                                        side="bowling" 
                                        currentUrl={match.overlaySettings?.leagueLogo}
                                        isMongoDB={isMongoDB(matchId)}
                                        onUploaded={(url) => push({ overlaySettings: { ...match.overlaySettings, leagueLogo: url } })} 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Format */}
                        <div className="ma-card">
                            <div className="ma-card-title">Format & Rules</div>
                            <div className="ma-field-row">
                                <span className="ma-field-label">Format</span>
                                <select className="ma-sel" value={match.matchType || 'T20'} onChange={e => push({ matchType: e.target.value })}>
                                    <option>T20</option><option>T10</option><option>ODI</option><option>Test</option><option>Custom</option>
                                </select>
                            </div>
                            <div className="ma-field-row">
                                <span className="ma-field-label">Max Overs</span>
                                <input type="number" className="ma-inp" value={match.maxOvers || 20} onChange={e => push({ maxOvers: parseInt(e.target.value) || 20 })} />
                            </div>
                            <div className="ma-field-row">
                                <span className="ma-field-label">Balls/Over</span>
                                <input type="number" className="ma-inp" value={match.ballsPerOver || 6} onChange={e => push({ ballsPerOver: parseInt(e.target.value) || 6 })} />
                            </div>
                            <div className="ma-field-row">
                                <span className="ma-field-label">Stage</span>
                                <input type="text" className="ma-inp" placeholder="e.g. GRAND FINAL" value={match.matchTitle || match.bowlingPrefix || ''} onChange={e => push({ matchTitle: e.target.value, bowlingPrefix: e.target.value })} />
                            </div>
                            <div className="ma-field-row">
                                <span className="ma-field-label">Target</span>
                                <input type="number" className="ma-inp" value={match.targetScore || 0} onChange={e => push({ targetScore: parseInt(e.target.value) || 0 })} />
                            </div>
                        </div>

                        {/* Innings */}
                        <div className="ma-card">
                            <div className="ma-card-title">Innings</div>
                            <div className="ma-status-grid">
                                <button className={`ma-status-btn ${!match.isSecondInnings ? 'active-live' : ''}`} onClick={() => push({ isSecondInnings: false })}>1ST INNINGS</button>
                                <button className={`ma-status-btn ${match.isSecondInnings ? 'active-live' : ''}`} onClick={() => push({ isSecondInnings: true })}>2ND INNINGS</button>
                            </div>
                            <button
                                className="ma-action-btn w-full mt-2"
                                style={{ background: 'rgba(220,38,38,0.3)', color: '#fca5a5', borderColor: 'rgba(248,113,113,0.25)' }}
                                onClick={() => {
                                    if (match.isSecondInnings) { alert('Already in 2nd innings.'); return; }
                                    if (window.confirm('Start 2nd Innings? Score will reset.\n1st Inn: ' + match.score + '-' + match.wickets)) {
                                        push({
                                            firstInningsScore: match.score, firstInningsWickets: match.wickets, firstInningsOvers: match.legalBallCount,
                                            score: 0, wickets: 0, totalBalls: 0, currentOver: 0, overRuns: 0, recentBalls: [],
                                            legalBallCount: 0, isSecondInnings: true, targetScore: 0,
                                            player1: { name: '', runs: 0, balls: 0, onStrike: true },
                                            player2: { name: '', runs: 0, balls: 0, onStrike: false },
                                            eventTrigger: 'RESET_WINNER'
                                        });
                                    }
                                }}
                            >⚠ RESET & START 2ND INNINGS</button>
                            <div className="ma-field-row" style={{ marginTop: 4 }}>
                                <span className="ma-field-label">Super Over</span>
                                <input type="checkbox" checked={!!match.isSuperOver} onChange={e => push({ isSuperOver: e.target.checked })} style={{ transform: 'scale(1.8)', margin: '0 8px' }} />
                            </div>
                        </div>

                        {/* Theme & Overlay */}
                        <div className="ma-card">
                            <div className="ma-card-title">Overlay Theme</div>
                            <select className="ma-sel" value={match.themeID || 'ICC_GLOBAL'} onChange={e => push({ themeID: e.target.value })}>
                                <optgroup label="🌟 International Broadcast">
                                    <option value="ICC_GLOBAL">🏆 ICC T20 Global Apex</option>
                                    <option value="SKY_HYPERION">⚡ Sky Sports Hyperion</option>
                                    <option value="JIO_TITAN">👑 Jio Premier Titan</option>
                                    <option value="FOX_STRIKE">🔥 Fox Cricket BBL Strike</option>
                                    <option value="SUPERSPORT_AURA">💎 SuperSport Aura Glass</option>
                                    <option value="APEX">📺 Apex</option>
                                    <option value="DIAMOND">💎 Diamond</option>
                                    <option value="VOLT">⚡ Volt</option>
                                    <option value="THUNDER">🌩️ Thunder</option>
                                    <option value="BLITZ">🔵 Blitz</option>
                                    <option value="ELITE">🥂 Elite</option>
                                    <option value="FRANCHISE">🏏 Franchise</option>
                                    <option value="SHAKTI">🔥 Shakti</option>
                                </optgroup>
                                <optgroup label="✨ Premier Modern Themes">
                                    <option value="NEW_KS_COLOR">🌿 Emerald Cricket Pro</option>
                                    <option value="NEW_IPL">🏏 Tata IPL Modern</option>
                                    <option value="IPL_2026">🏟️ IPL 2026 Stadium Capsule</option>
                                    <option value="KS_PREMIUM">⭐ KS Premium Broadcast</option>
                                    <option value="WC2026">🌐 T20 World Cup 2026</option>
                                    <option value="APOGEE">🔮 Apogee Arena Pro</option>
                                    <option value="GOLD_CHAMPIONSHIP">🥇 Gold Championship</option>
                                </optgroup>
                            </select>
                            <div className="ma-grid-2">
                                <button className={`ma-status-btn ${match.showVersus ? 'active-break' : ''}`} onClick={() => push({ showVersus: !match.showVersus })}>VS Tab</button>
                                <button className={`ma-status-btn ${match.showSummary ? 'active-break' : ''}`} onClick={() => push({ showSummary: !match.showSummary })}>Summary</button>
                                <button className={`ma-status-btn ${match.showToss ? 'active-break' : ''}`} onClick={() => push({ showToss: !match.showToss })} style={match.showToss ? { background: 'rgba(245,158,11,0.3)', color: '#fcd34d', borderColor: 'rgba(252,211,77,0.25)' } : {}}>Toss Result</button>
                                <button className={`ma-status-btn ${match.showMatchSituation ? 'active-break' : ''}`} onClick={() => push({ showMatchSituation: !match.showMatchSituation })}>Situation</button>
                            </div>
                            <button
                                className="ma-over-btn ma-over-wait"
                                style={{ cursor: 'pointer', color: '#22d3ee', borderColor: 'rgba(34,211,238,0.25)' }}
                                onClick={() => push({ eventTrigger: 'SHOW_BANNER' })}
                            >✨ SHOW BANNER</button>
                        </div>

                        {/* Extras config */}
                        <div className="ma-card">
                            <div className="ma-card-title">Allowed Extras</div>
                            <div className="ma-status-grid">
                                <label style={{ display:'flex', alignItems:'center', gap:8, color:'#fb923c', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                                    <input type="checkbox" checked={match.extrasConfig?.wd !== false} onChange={e => push({ extrasConfig: { ...match.extrasConfig, wd: e.target.checked } })} style={{ transform:'scale(1.5)' }} /> Wides
                                </label>
                                <label style={{ display:'flex', alignItems:'center', gap:8, color:'#fdba74', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                                    <input type="checkbox" checked={match.extrasConfig?.nb !== false} onChange={e => push({ extrasConfig: { ...match.extrasConfig, nb: e.target.checked } })} style={{ transform:'scale(1.5)' }} /> No Balls
                                </label>
                                <label style={{ display:'flex', alignItems:'center', gap:8, color:'#a78bfa', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                                    <input type="checkbox" checked={match.extrasConfig?.lb !== false} onChange={e => push({ extrasConfig: { ...match.extrasConfig, lb: e.target.checked } })} style={{ transform:'scale(1.5)' }} /> Leg Byes
                                </label>
                                <label style={{ display:'flex', alignItems:'center', gap:8, color:'#67e8f9', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                                    <input type="checkbox" checked={match.extrasConfig?.b !== false} onChange={e => push({ extrasConfig: { ...match.extrasConfig, b: e.target.checked } })} style={{ transform:'scale(1.5)' }} /> Byes
                                </label>
                            </div>
                        </div>

                        {/* Match status */}
                        <div className="ma-card">
                            <div className="ma-card-title">Match Status</div>
                            <div className="ma-status-grid">
                                <button className={`ma-status-btn ${(!match.matchStatus || match.matchStatus === 'Live') ? 'active-live' : ''}`} onClick={() => push({ matchStatus: 'Live' })}>🔴 LIVE</button>
                                <button className={`ma-status-btn ${match.matchStatus === 'Break' ? 'active-break' : ''}`} onClick={() => push({ matchStatus: 'Break' })}>⏸ BREAK</button>
                                <button className={`ma-status-btn ${match.matchStatus === 'Innings Break' ? 'active-inn' : ''}`} onClick={() => push({ matchStatus: 'Innings Break' })}>🔄 INN BREAK</button>
                                <button className={`ma-status-btn ${match.matchStatus === 'Rain Delay' ? 'active-rain' : ''}`} onClick={() => push({ matchStatus: 'Rain Delay' })}>☔ RAIN</button>
                            </div>
                            <button className={`ma-status-btn w-full mt-2 ${match.matchStatus === 'Match Ended' ? 'active-ended' : ''}`} style={{ width:'100%' }} onClick={() => push({ matchStatus: 'Match Ended' })}>🏁 MATCH ENDED</button>
                        </div>

                        {/* Score override */}
                        <div className="ma-card">
                            <div className="ma-card-title">Score Override</div>
                            <div className="ma-field-row">
                                <span className="ma-field-label">Score</span>
                                <input type="number" className="ma-inp" value={match.score || 0} onChange={e => push({ score: parseInt(e.target.value) || 0 })} />
                            </div>
                            <div className="ma-field-row">
                                <span className="ma-field-label">Wickets</span>
                                <input type="number" className="ma-inp" value={match.wickets || 0} onChange={e => push({ wickets: parseInt(e.target.value) || 0 })} />
                            </div>
                            <div className="ma-field-row">
                                <span className="ma-field-label">Legal Balls</span>
                                <input type="number" className="ma-inp" value={match.legalBallCount || 0} onChange={e => push({ totalBalls: parseInt(e.target.value) || 0, legalBallCount: parseInt(e.target.value) || 0 })} />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="ma-card">
                            <div className="ma-card-title">Match Actions</div>
                            {match.tournamentId && (
                                <button className="ma-btn-deploy" onClick={() => setShowNextMatch(true)}>🚀 DEPLOY NEXT MATCH</button>
                            )}
                            <div className="ma-action-grid">
                                <button className="ma-action-btn ma-btn-new" onClick={() => setShowTossModal(true)}>🪙 TOSS</button>
                                <button className="ma-action-btn ma-btn-new" onClick={handleNewMatch}>🆕 NEW MATCH</button>
                                <button className="ma-action-btn ma-btn-inn" onClick={handleNewInnings}>🔄 NEW INNINGS</button>
                                <button className="ma-action-btn ma-btn-reset" onClick={handleResetTournament}>💥 RESET ALL</button>
                            </div>
                        </div>

                    </div>
                )}

                {/* ─── BROADCAST GRAPHICS TAB ───────────────────────────────── */}
                {activeTab === 'graphics' && (
                    <div className="ma-graphics-tab">

                        {/* ─ Header Bar ─ */}
                        <div className="ma-gfx-topbar">
                            <div className={`ma-gfx-onair ${bgOnAir ? 'on' : 'off'}`} onClick={() => setBgOnAir(p => !p)}>
                                <span className="ma-gfx-onair-dot" />
                                {bgOnAir ? 'ON AIR' : 'OFF AIR'}
                            </div>
                            <button className="ma-gfx-back" onClick={() => { hideAllGraphics(); }}>↩ Back to Scorebug</button>
                            <button className="ma-gfx-hideall" onClick={hideAllGraphics}>Hide All</button>
                            <button className="ma-gfx-close" onClick={() => setActiveTab('score')}>✕</button>
                        </div>

                        {/* ─ SCOREBUG Section ─ */}
                        <div className="ma-gfx-section ma-gfx-scorebug">
                            <div className="ma-gfx-section-title">SCOREBUG</div>
                            <div className="ma-gfx-btn-row">
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.scoreboardOnly ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ scoreboardOnly: !match?.overlaySettings?.scoreboardOnly })}
                                >Scorebug</button>
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.showNeedRunStrip ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showNeedRunStrip: !match?.overlaySettings?.showNeedRunStrip })}
                                >Need Run strip</button>
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.showLastOut ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showLastOut: !match?.overlaySettings?.showLastOut })}
                                >Last Out</button>
                            </div>
                            <div className="ma-gfx-custom-row">
                                <input
                                    className="ma-gfx-custom-inp"
                                    placeholder="Custom text…"
                                    value={bgCustomText}
                                    onChange={e => setBgCustomText(e.target.value.toUpperCase())}
                                    onKeyDown={e => { if (e.key === 'Enter') pushOverlay({ customText: bgCustomText, showCustomText: true }); }}
                                />
                                <button className="ma-gfx-show-btn" onClick={() => pushOverlay({ customText: bgCustomText, showCustomText: true })}>Show Text</button>
                                {match?.overlaySettings?.showCustomText && <button className="ma-gfx-hide-btn" onClick={() => pushOverlay({ showCustomText: false })}>✕</button>}
                            </div>
                        </div>

                        {/* ─ FULL SCREEN Section ─ */}
                        <div className="ma-gfx-section ma-gfx-fullscreen">
                            <div className="ma-gfx-section-header">
                                <span className="ma-gfx-section-title">FULL SCREEN</span>
                                <div className="ma-gfx-autohide-row">
                                    <span className="ma-gfx-autohide-label">Auto-hide</span>
                                    {['off', '10s', '20s', '30s'].map(v => (
                                        <button
                                            key={v}
                                            className={`ma-gfx-autohide-pill ${bgAutoHide === v ? 'active' : ''}`}
                                            onClick={() => setBgAutoHide(v)}
                                        >{v}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="ma-gfx-btn-grid">
                                <button
                                    className={`ma-gfx-btn ${match?.showToss || match?.overlaySettings?.showToss ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showToss: !match?.overlaySettings?.showToss }, ['showToss'])}
                                >Toss</button>
                                <button
                                    className={`ma-gfx-btn ${match?.showVersus || match?.overlaySettings?.showVersus ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showVersus: !match?.overlaySettings?.showVersus }, ['showVersus'])}
                                >Team vs Team</button>
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.showPartnership ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showPartnership: !match?.overlaySettings?.showPartnership }, ['showPartnership'])}
                                >Partnership</button>
                                <button
                                    className={`ma-gfx-btn ${match?.showSummary || match?.overlaySettings?.showSummary ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showSummary: !match?.overlaySettings?.showSummary }, ['showSummary'])}
                                >Summary</button>
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.showMatchSituation ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showMatchSituation: !match?.overlaySettings?.showMatchSituation }, ['showMatchSituation'])}
                                >Chase Target</button>
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.showNeedRun ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showNeedRun: !match?.overlaySettings?.showNeedRun }, ['showNeedRun'])}
                                >Need Run</button>
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.showMatchWon ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showMatchWon: !match?.overlaySettings?.showMatchWon }, ['showMatchWon'])}
                                >Match Won</button>
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.showSquadList && match?.overlaySettings?.squadListTeam !== 'team2' ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showSquadList: !match?.overlaySettings?.showSquadList, squadListTeam: 'team1' }, ['showSquadList'])}
                                >Squad List</button>
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.showSquadList && match?.overlaySettings?.squadListTeam === 'team2' ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showSquadList: !match?.overlaySettings?.showSquadList, squadListTeam: 'team2' }, ['showSquadList'])}
                                >Squad Photo JP</button>
                                <button
                                    className="ma-gfx-btn ma-gfx-btn-gold"
                                    onClick={() => setShowPotmModal(true)}
                                >👑 Player of Match</button>
                            </div>
                        </div>

                        {/* ─ TOURNAMENT · FULL SCREEN Section ─ */}
                        <div className="ma-gfx-section ma-gfx-tournament">
                            <div className="ma-gfx-section-title">TOURNAMENT · FULL SCREEN</div>
                            <div className="ma-gfx-btn-grid">
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.showTournamentMostRuns ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showTournamentMostRuns: !match?.overlaySettings?.showTournamentMostRuns }, ['showTournamentMostRuns'])}
                                >Most Runs</button>
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.showTournamentMostWickets ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showTournamentMostWickets: !match?.overlaySettings?.showTournamentMostWickets }, ['showTournamentMostWickets'])}
                                >Most Wickets</button>
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.showTournamentBoundaries ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showTournamentBoundaries: !match?.overlaySettings?.showTournamentBoundaries }, ['showTournamentBoundaries'])}
                                >Boundaries</button>
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.showPointsTable ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showPointsTable: !match?.overlaySettings?.showPointsTable }, ['showPointsTable'])}
                                >Points Table</button>
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.showUpcoming ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showUpcoming: !match?.overlaySettings?.showUpcoming }, ['showUpcoming'])}
                                >Upcoming</button>
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.showResults ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ showResults: !match?.overlaySettings?.showResults }, ['showResults'])}
                                >Results</button>
                            </div>
                        </div>

                        {/* ─ OTHER Section ─ */}
                        <div className="ma-gfx-section ma-gfx-other">
                            <div className="ma-gfx-section-title">OTHER</div>
                            <div className="ma-gfx-btn-row">
                                <input className="ma-gfx-sponsor-inp" placeholder="Sponsor (none)" defaultValue={match?.overlaySettings?.sponsorText || ''} onBlur={e => pushOverlay({ sponsorText: e.target.value })} />
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.show4or6Animation !== false ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ show4or6Animation: match?.overlaySettings?.show4or6Animation === false })}
                                >• 4/6 Animation</button>
                                <button
                                    className={`ma-gfx-btn ${match?.overlaySettings?.scoreboardOnly ? 'active' : ''}`}
                                    onClick={() => pushOverlay({ scoreboardOnly: !match?.overlaySettings?.scoreboardOnly })}
                                >Scorebug Only</button>
                            </div>
                        </div>

                        {/* ─ Player of Match Modal ─ */}
                        {showPotmModal && (
                            <div className="ma-modal-overlay" style={{ zIndex: 100010 }}>
                                <div className="ma-modal-card" style={{ maxWidth: 400, width: '95%' }}>
                                    <div className="ma-modal-header">
                                        <span className="ma-modal-title">👑 Player of the Match</span>
                                        <button className="ma-modal-close" onClick={() => setShowPotmModal(false)}>✕</button>
                                    </div>
                                    <div className="ma-modal-form" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <label className="ma-modal-label">Player Name</label>
                                        <input className="ma-modal-inp" placeholder="e.g. VIRAT KOHLI" value={potmName} onChange={e => setPotmName(e.target.value.toUpperCase())} />
                                        <label className="ma-modal-label">Team</label>
                                        <select className="ma-modal-inp" value={potmTeam} onChange={e => setPotmTeam(e.target.value)}>
                                            <option value="">Select Team…</option>
                                            <option value={match?.battingTeam || 'Team A'}>{match?.battingTeam || 'Team A'}</option>
                                            <option value={match?.bowlingTeam || 'Team B'}>{match?.bowlingTeam || 'Team B'}</option>
                                        </select>
                                        <label className="ma-modal-label">Performance Figures</label>
                                        <input className="ma-modal-inp" placeholder="e.g. 78 (42) & 2/18" value={potmFigures} onChange={e => setPotmFigures(e.target.value)} />
                                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                                            <button
                                                className="ma-btn-action"
                                                style={{ flex: 1, background: '#d97706', color: '#fff', borderRadius: 8, padding: '10px 0', fontWeight: 900, fontSize: 13, border: 'none', cursor: 'pointer' }}
                                                onClick={() => {
                                                    pushOverlay({ showPlayerOfMatch: true, potmName, potmTeam, potmFigures }, ['showPlayerOfMatch']);
                                                    setShowPotmModal(false);
                                                }}
                                            >👑 SHOW ON OBS</button>
                                            <button
                                                className="ma-btn-action"
                                                style={{ flex: 1, background: '#374151', color: '#fff', borderRadius: 8, padding: '10px 0', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }}
                                                onClick={() => { pushOverlay({ showPlayerOfMatch: false }); setShowPotmModal(false); }}
                                            >HIDE</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                )}

                {/* ─── MORE TAB ──────────────────────────────────────── */}
                {activeTab === 'more' && (
                    <div className="ma-more-tab">

                        {/* OBS Link */}
                        <div className="ma-card">
                            <div className="ma-card-title">OBS Browser Source</div>
                            <div className="ma-obs-row">
                                <div className="ma-obs-url">{obsUrl}</div>
                                <button
                                    className="ma-obs-copy"
                                    style={{ background: obsCopied ? '#10b981' : '#0ea5e9', color: '#fff' }}
                                    onClick={copyOBSLink}
                                >{obsCopied ? '✔ COPIED!' : '📋 COPY'}</button>
                                <BroadcastStatus expiresAt={obsExpiresAt} locked={obsLockedNow} onExpire={() => setObsTick(t => t + 1)} />
                            </div>
                            <button className="ma-preview-toggle" onClick={() => setShowLivePreview(p => !p)}>
                                <div className="ma-preview-dot" style={{ background: showLivePreview ? '#10b981' : '#475569', animation: showLivePreview ? 'pulse 1.5s infinite' : 'none' }} />
                                {showLivePreview ? 'HIDE OVERLAY PREVIEW' : 'SHOW OVERLAY PREVIEW'}
                            </button>
                            {showLivePreview && (
                                <div style={{ position:'relative', width:'100%', paddingTop:'56.25%', background:'#000', borderRadius:8, border:'1px solid #334155', overflow:'hidden', marginTop:6 }}>
                                    <iframe src={overlayUrl} title="Overlay Preview" style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', border:'none', pointerEvents:'none' }} />
                                </div>
                            )}
                        </div>

                        {/* Broadcast Ticker */}
                        <div className="ma-card">
                            <div className="ma-card-title">Broadcast Ticker</div>
                            <input className="ma-inp" placeholder="GRAND FINAL — MATCH 3" value={tickerMsg} onChange={e => setTickerMsg(e.target.value.toUpperCase())} />
                            <div className="ma-grid-2">
                                <select className="ma-sel" value={tickerMode} onChange={e => { setTickerMode(e.target.value); pushTicker({ mode: e.target.value }); }}>
                                    <option value="banner">🏆 Tournament</option>
                                    <option value="breaking">🔴 Breaking</option>
                                </select>
                                <select className="ma-sel" value={tickerPreset} onChange={e => { setTickerPreset(e.target.value); pushTicker({ preset: e.target.value }); }}>
                                    <option value="final">🥇 Final</option>
                                    <option value="semi">🔵 Semi</option>
                                    <option value="custom">🟢 Custom</option>
                                </select>
                            </div>
                            <div className="ma-btn-row-2">
                                <button className="ma-ticker-btn ma-ticker-save" onClick={() => pushTicker({ message: tickerMsg })}>💾 SAVE</button>
                                <button
                                    className={`ma-ticker-btn ${tickerVisible ? 'ma-ticker-hide' : 'ma-ticker-show'}`}
                                    onClick={() => { const v = !tickerVisible; setTickerVisible(v); pushTicker({ visible: v, timestamp: Date.now() }); }}
                                >{tickerVisible ? '🔴 HIDE TICKER' : '🟢 SHOW TICKER'}</button>
                            </div>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px', background:'rgba(255,255,255,0.03)', borderRadius:6 }}>
                                <span style={{ fontSize:10, color:'rgba(255,255,255,0.4)', fontWeight:700 }}>AUTO REPEAT</span>
                                <div style={{ display:'flex', gap:4 }}>
                                    <button className={`ma-ticker-btn ${!tickerAutoRepeat ? 'ma-ticker-hide' : ''}`} style={{ padding:'6px 12px' }} onClick={() => pushTicker({ autoRepeat: false })}>OFF</button>
                                    <button className={`ma-ticker-btn ${tickerAutoRepeat ? 'ma-ticker-show' : ''}`} style={{ padding:'6px 12px' }} onClick={() => pushTicker({ autoRepeat: true })}>ON</button>
                                </div>
                            </div>
                        </div>


                        {/* Match Situation */}
                        <div className="ma-card">
                            <div className="ma-card-title">Match Situation Panel</div>
                            <div className="ma-field-row"><span className="ma-field-label">CRR</span><input type="text" className="ma-inp" placeholder="7.25" value={msCrr} onChange={e => setMsCrr(e.target.value)} /></div>
                            <div className="ma-field-row"><span className="ma-field-label">RRR</span><input type="text" className="ma-inp" placeholder="8.10" value={msRrr} onChange={e => setMsRrr(e.target.value)} /></div>
                            <div className="ma-field-row"><span className="ma-field-label">Target</span><input type="number" className="ma-inp" placeholder="145" value={msTarget} onChange={e => setMsTarget(e.target.value)} /></div>
                            <div className="ma-field-row"><span className="ma-field-label">Overs Left</span><input type="text" className="ma-inp" placeholder="5.0" value={msOvers} onChange={e => setMsOvers(e.target.value)} /></div>
                            <div className="ma-field-row"><span className="ma-field-label">Wkts Left</span><input type="number" className="ma-inp" placeholder="6" value={msWickets} onChange={e => setMsWickets(e.target.value)} /></div>
                            <div className="ma-field-row"><span className="ma-field-label">Message</span><input type="text" className="ma-inp" placeholder="Need 25 in 12 balls" value={msMsg} onChange={e => setMsMsg(e.target.value)} /></div>
                            <div className="ma-btn-row-2">
                                <button className="ma-ticker-btn ma-sit-update" onClick={() => push({ showMatchSituation: true, matchSituation: { crr: msCrr || null, rrr: msRrr || null, target: msTarget ? parseInt(msTarget) : null, oversRemaining: msOvers || null, wicketsInHand: msWickets ? parseInt(msWickets) : null, customMsg: msMsg || null } })}>📡 UPDATE</button>
                                <button className="ma-ticker-btn ma-sit-clear" onClick={() => { push({ showMatchSituation: false, matchSituation: {} }); setMsCrr(''); setMsRrr(''); setMsTarget(''); setMsOvers(''); setMsWickets(''); setMsMsg(''); }}>✖ CLEAR</button>
                            </div>
                        </div>

                        {/* Manual balls override */}
                        <div className="ma-card">
                            <div className="ma-card-title">Remaining Balls (Manual)</div>
                            <div className="ma-field-row">
                                <span className="ma-field-label">Balls Left</span>
                                <input id="ma-manual-balls" type="number" className="ma-inp" placeholder="e.g. 16" defaultValue={match.manualBallsValue || ''} />
                            </div>
                            <div className="ma-grid-2">
                                <button className="ma-ticker-btn ma-sit-update" onClick={() => {
                                    const val = parseInt(document.getElementById('ma-manual-balls')?.value);
                                    const max = match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * bpo;
                                    if (!isNaN(val) && val >= 0) push({ manualBallsOverride: true, manualBallsValue: Math.min(val, max) });
                                    else alert('Enter a valid number');
                                }}>SET</button>
                                <button className="ma-ticker-btn" style={{ background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.08)' }} onClick={() => push({ manualBallsOverride: false, manualBallsValue: 0 })}>AUTO</button>
                            </div>
                        </div>

                        {/* Manual target override (only in 2nd innings) */}
                        {match.isSecondInnings && (
                            <div className="ma-card">
                                <div className="ma-card-title">Target Score (Manual)</div>
                                <div className="ma-field-row">
                                    <span className="ma-field-label">Target Runs</span>
                                    <input id="ma-manual-target" type="number" className="ma-inp" placeholder="e.g. 145" defaultValue={match.manualTargetValue || ''} />
                                </div>
                                <div className="ma-grid-2">
                                    <button className="ma-ticker-btn ma-sit-update" onClick={() => {
                                        const val = parseInt(document.getElementById('ma-manual-target')?.value);
                                        if (!isNaN(val) && val >= 0) push({ manualTargetOverride: true, manualTargetValue: val });
                                        else alert('Enter a valid target score');
                                    }}>SET</button>
                                    <button className="ma-ticker-btn" style={{ background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.08)' }} onClick={() => push({ manualTargetOverride: false, manualTargetValue: 0 })}>AUTO</button>
                                </div>
                            </div>
                        )}

                    </div>
                )}

            </div>{/* end ma-content */}

            {/* ══ TAB BAR ════════════════════════════════════════════ */}
            <div className="ma-tab-bar">
                <button className={`ma-tab ${activeTab === 'score' ? 'active' : ''}`} onClick={() => setActiveTab('score')}>
                    <span className="ma-tab-icon">🏏</span>SCORE
                </button>
                <button className={`ma-tab ${activeTab === 'match' ? 'active' : ''}`} onClick={() => setActiveTab('match')}>
                    <span className="ma-tab-icon">⚙️</span>MATCH
                </button>
                <button className={`ma-tab ${activeTab === 'graphics' ? 'active' : ''}`} onClick={() => setActiveTab('graphics')}>
                    <span className="ma-tab-icon">🎬</span>GRAPHICS
                </button>
                <button className={`ma-tab ${activeTab === 'more' ? 'active' : ''}`} onClick={() => setActiveTab('more')}>
                    <span className="ma-tab-icon">📺</span>MORE
                </button>
            </div>

            {/* keyboard hint */}
            <div className="ma-kb-hints">Keys: 0–4,6 = Runs &nbsp;|&nbsp; W = Wicket &nbsp;|&nbsp; S = Swap &nbsp;|&nbsp; U = Undo</div>

            
            {/* ══ WICKET / DISMISSAL DETAILS MODAL ════════════════════════════ */}
            {showWicketPanel && (
                <div className="ma-modal-overlay" style={{ zIndex: 100000 }}>
                    <div className="ma-modal-card" style={{ maxWidth: 440, width: '92%' }}>
                        <div className="ma-modal-header">
                            <span className="ma-modal-title">
                                {wicketDismissal === 'Retired Hurt' || wicketDismissal === 'Absent Hurt' ? '🏥 BATTER RETIREMENT' : '🔥 WICKET / DISMISSAL'}
                            </span>
                            <button className="ma-modal-close" onClick={() => setShowWicketPanel(false)}>✕</button>
                        </div>
                        <div className="ma-modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
                            <div className="ma-modal-field">
                                <label className="ma-modal-label">How Out / Dismissal Type</label>
                                <select 
                                    className="ma-modal-inp" 
                                    value={wicketDismissal} 
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setWicketDismissal(val);
                                        if (val === 'Caught & Bowled') {
                                            setWicketFielder(match?.bowler?.name || 'Bowler');
                                        } else if (val === 'Run Out (Mankad)') {
                                            setWicketDismissedBatter('nonStriker');
                                        } else {
                                            setWicketDismissedBatter('striker');
                                        }
                                    }}
                                >
                                    <optgroup label="BOWLED / CAUGHT">
                                        <option value="Bowled">Bowled</option>
                                        <option value="Caught">Caught</option>
                                        <option value="Caught Behind">Caught Behind</option>
                                        <option value="Caught & Bowled">Caught & Bowled</option>
                                    </optgroup>
                                    <optgroup label="OTHER DISMISSALS">
                                        <option value="LBW">LBW</option>
                                        <option value="Stumped">Stumped</option>
                                        <option value="Hit Wicket">Hit Wicket</option>
                                        <option value="Run Out">Run Out</option>
                                        <option value="Run Out (Mankad)">Run Out (Mankad)</option>
                                        <option value="Hit the Ball Twice">Hit the Ball Twice</option>
                                        <option value="Obstructing the Field">Obstructing the Field</option>
                                        <option value="Timed Out">Timed Out (No ball counted)</option>
                                        <option value="Retired Out">Retired Out (No ball counted)</option>
                                    </optgroup>
                                    <optgroup label="NON-DISMISSAL EVENTS (NOT OUT)">
                                        <option value="Retired Hurt">Retired Hurt (Not Out)</option>
                                        <option value="Absent Hurt">Absent Hurt (Not Out)</option>
                                    </optgroup>
                                </select>
                            </div>

                            {/* Dismissed Batter Selection (for Run Out, Mankad, Obstruction, Timed Out, Retirements) */}
                            {['Run Out', 'Run Out (Mankad)', 'Obstructing the Field', 'Timed Out', 'Retired Out', 'Retired Hurt', 'Absent Hurt'].includes(wicketDismissal) && (
                                <div className="ma-modal-field">
                                    <label className="ma-modal-label">
                                        {wicketDismissal === 'Retired Hurt' || wicketDismissal === 'Absent Hurt' ? 'Retiring Batter' : 'Dismissed Batter'}
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setWicketDismissedBatter('striker')}
                                            style={{
                                                padding: '9px 10px',
                                                borderRadius: 8,
                                                border: wicketDismissedBatter === 'striker' ? '2px solid #ef4444' : '1px solid #475569',
                                                background: wicketDismissedBatter === 'striker' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)',
                                                color: '#fff',
                                                fontSize: 12,
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                            }}
                                        >
                                            🏏 {match?.player1?.onStrike ? match?.player1?.name : match?.player2?.name}
                                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>(Striker)</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setWicketDismissedBatter('nonStriker')}
                                            style={{
                                                padding: '9px 10px',
                                                borderRadius: 8,
                                                border: wicketDismissedBatter === 'nonStriker' ? '2px solid #ef4444' : '1px solid #475569',
                                                background: wicketDismissedBatter === 'nonStriker' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)',
                                                color: '#fff',
                                                fontSize: 12,
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                            }}
                                        >
                                            🏃 {match?.player1?.onStrike ? match?.player2?.name : match?.player1?.name}
                                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>(Non-Striker)</div>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Caught & Bowled auto-catcher notice */}
                            {wicketDismissal === 'Caught & Bowled' && (
                                <div style={{ padding: '8px 12px', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, fontSize: 12, color: '#93c5fd' }}>
                                    🎯 Catcher automatically credited to bowler: <b>{match?.bowler?.name || 'Current Bowler'}</b>
                                </div>
                            )}

                            {/* Fielder Name (Caught, Caught Behind, Stumped, Run Out) */}
                            {['Caught', 'Caught Behind', 'Stumped', 'Run Out'].includes(wicketDismissal) && (
                                <div className="ma-modal-field">
                                    <label className="ma-modal-label">
                                        {wicketDismissal === 'Caught Behind' ? 'Wicketkeeper / Fielder' : wicketDismissal === 'Stumped' ? 'Wicketkeeper' : wicketDismissal === 'Run Out' ? 'Fielder (Thrower / Direct Hit)' : 'Fielder (Catcher)'}
                                    </label>
                                    <input 
                                        list="ma-bowling-squad-list"
                                        type="text" 
                                        placeholder={wicketDismissal === 'Caught Behind' || wicketDismissal === 'Stumped' ? "Select or type wicketkeeper..." : "Select or type fielder..."}
                                        className="ma-modal-inp" 
                                        value={wicketFielder} 
                                        onChange={(e) => setWicketFielder(e.target.value)} 
                                    />
                                    <datalist id="ma-bowling-squad-list">
                                        {(match?.bowlingSquad || []).map((player, idx) => (
                                            <option key={idx} value={player.name} />
                                        ))}
                                    </datalist>
                                </div>
                            )}

                            {/* Stumping from Wide Checkbox */}
                            {wicketDismissal === 'Stumped' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
                                    <input 
                                        type="checkbox" 
                                        id="stumped-wide-check" 
                                        checked={wicketStumpedWide} 
                                        onChange={(e) => setWicketStumpedWide(e.target.checked)} 
                                        style={{ width: 16, height: 16, accentColor: '#ef4444', cursor: 'pointer' }}
                                    />
                                    <label htmlFor="stumped-wide-check" style={{ color: '#facc15', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                        Stumped from Wide Delivery (+1 Extra, No legal ball counted)
                                    </label>
                                </div>
                            )}

                            {/* Run Out Extras & Delivery Legality */}
                            {wicketDismissal === 'Run Out' && (
                                <>
                                    <div className="ma-modal-field">
                                        <label className="ma-modal-label">Delivery Legality</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                                            {[
                                                { id: 'legal', label: 'Legal Ball' },
                                                { id: 'wide', label: 'Wide (+1 WD)' },
                                                { id: 'noball', label: 'No-Ball (+1 NB)' },
                                            ].map((dl) => (
                                                <button
                                                    key={dl.id}
                                                    type="button"
                                                    onClick={() => setWicketDeliveryLegality(dl.id)}
                                                    style={{
                                                        padding: '8px 4px',
                                                        borderRadius: 6,
                                                        border: wicketDeliveryLegality === dl.id ? '2px solid #3b82f6' : '1px solid #475569',
                                                        background: wicketDeliveryLegality === dl.id ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.04)',
                                                        color: '#fff',
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {dl.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="ma-modal-field">
                                        <label className="ma-modal-label">Runs Completed Before Run Out</label>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            {[0, 1, 2, 3, 4].map(num => (
                                                <button
                                                    key={num}
                                                    type="button"
                                                    onClick={() => setWicketRunsCompleted(num)}
                                                    style={{
                                                        flex: 1,
                                                        padding: '8px 0',
                                                        borderRadius: 6,
                                                        border: wicketRunsCompleted === num ? '2px solid #22c55e' : '1px solid #475569',
                                                        background: wicketRunsCompleted === num ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.04)',
                                                        color: '#fff',
                                                        fontSize: 13,
                                                        fontWeight: 800,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {num}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Non-ball event explanation */}
                            {['Timed Out', 'Retired Out', 'Retired Hurt', 'Absent Hurt', 'Run Out (Mankad)'].includes(wicketDismissal) && (
                                <div style={{ padding: '8px 12px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: 11, color: '#fcd34d' }}>
                                    ℹ️ <b>No ball consumed:</b> Occurs between balls / before delivery. Legal balls count and over will not increment.
                                    {wicketDismissal === 'Retired Hurt' || wicketDismissal === 'Absent Hurt' ? ' Total team wickets will NOT increase (Not Out).' : ' Bowler receives 0 wicket credit.'}
                                </div>
                            )}

                            <div className="ma-modal-footer">
                                <button 
                                    type="button" 
                                    onClick={() => setShowWicketPanel(false)} 
                                    style={{ background:'transparent', border:'1px solid #475569', color:'#cbd5e1', borderRadius:6, padding:'8px 14px', fontWeight:'bold', cursor:'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => handleWicket()} 
                                    style={{ 
                                        background: wicketDismissal === 'Retired Hurt' || wicketDismissal === 'Absent Hurt' ? '#3b82f6' : '#ef4444', 
                                        border:'none', 
                                        color:'#fff', 
                                        borderRadius:6, 
                                        padding:'8px 16px', 
                                        fontWeight:900, 
                                        cursor:'pointer' 
                                    }}
                                >
                                    {wicketDismissal === 'Retired Hurt' || wicketDismissal === 'Absent Hurt' ? '🏥 Confirm Retirement (Not Out)' : '🔥 Confirm Wicket'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ DEPLOY NEXT MATCH MODAL ════════════════════════════ */}
            {showNextMatch && (
                <div className="ma-modal-overlay">
                    <div className="ma-modal-card">
                        <div className="ma-modal-header">
                            <span className="ma-modal-title">⚡ DEPLOY NEXT MATCH</span>
                            <button className="ma-modal-close" onClick={() => setShowNextMatch(false)}>✕</button>
                        </div>
                        <form className="ma-modal-form" onSubmit={async e => {
                            e.preventDefault();
                            const f = e.target;
                            const body = {
                                battingTeam: f.battingTeam.value.toUpperCase(),
                                bowlingTeam: f.bowlingTeam.value.toUpperCase(),
                                maxOvers: parseInt(f.maxOvers.value) || 20,
                                ballsPerOver: parseInt(f.ballsPerOver.value) || 6,
                                matchType: f.matchType.value,
                                matchTitle: f.matchTitle.value,
                                themeID: f.themeID.value,
                                matchDate: new Date().toISOString().split('T')[0],
                            };
                            try {
                                const tId = typeof match.tournamentId === 'object' ? (match.tournamentId?.id || match.tournamentId?._id) : match.tournamentId;
                                const res = await tournamentsApi.nextMatch(tId, body);
                                setShowNextMatch(false);
                                if (res.matchId) window.location.href = `/mini-admin/${res.matchId}`;
                            } catch (err) { alert(err.message || 'Failed to switch match'); }
                        }}>
                            <div className="ma-modal-row">
                                <div className="ma-modal-field"><label className="ma-modal-label">Batting Team</label><input name="battingTeam" required className="ma-modal-inp" placeholder="COLOMBO XI" /></div>
                                <div className="ma-modal-field"><label className="ma-modal-label">Bowling Team</label><input name="bowlingTeam" required className="ma-modal-inp" placeholder="VAVUNIYA" /></div>
                            </div>
                            <div className="ma-modal-row">
                                <div className="ma-modal-field"><label className="ma-modal-label">Format</label><select name="matchType" className="ma-modal-inp"><option>T20</option><option>T10</option><option>ODI</option></select></div>
                                <div className="ma-modal-field"><label className="ma-modal-label">Max Overs</label><input name="maxOvers" type="number" defaultValue={20} className="ma-modal-inp" /></div>
                                <div className="ma-modal-field"><label className="ma-modal-label">Balls/Over</label><input name="ballsPerOver" type="number" defaultValue={6} className="ma-modal-inp" /></div>
                            </div>
                            <div className="ma-modal-field"><label className="ma-modal-label">Stage / Title</label><input name="matchTitle" className="ma-modal-inp" placeholder="GRAND FINAL" /></div>
                            <div className="ma-modal-field"><label className="ma-modal-label">Theme</label>
                                <select name="themeID" className="ma-modal-inp">
                                    <option value="ICC_GLOBAL">🏆 ICC T20 Global Apex</option>
                                    <option value="SKY_HYPERION">⚡ Sky Sports Hyperion</option>
                                    <option value="JIO_TITAN">👑 Jio Premier Titan</option>
                                    <option value="FOX_STRIKE">🔥 Fox Cricket BBL Strike</option>
                                    <option value="SUPERSPORT_AURA">💎 SuperSport Aura Glass</option>
                                    <option value="APEX">📺 Apex</option>
                                    <option value="DIAMOND">💎 Diamond</option>
                                    <option value="VOLT">⚡ Volt</option>
                                    <option value="THUNDER">🌩️ Thunder</option>
                                    <option value="BLITZ">🔵 Blitz</option>
                                    <option value="ELITE">🥂 Elite</option>
                                    <option value="FRANCHISE">🏏 Franchise</option>
                                    <option value="SHAKTI">🔥 Shakti</option>
                                    <option value="NEW_KS_COLOR">🌿 Emerald Cricket Pro</option>
                                    <option value="NEW_IPL">🏏 Tata IPL Modern</option>
                                    <option value="IPL_2026">🏟️ IPL 2026 Stadium</option>
                                    <option value="KS_PREMIUM">⭐ KS Premium</option>
                                    <option value="WC2026">🌐 T20 World Cup 2026</option>
                                </select>
                            </div>
                            <div className="ma-modal-footer">
                                <button type="button" onClick={() => setShowNextMatch(false)} style={{ background:'transparent', border:'1px solid #475569', color:'#cbd5e1', borderRadius:6, padding:'8px 14px', fontWeight:'bold', cursor:'pointer' }}>Cancel</button>
                                <button type="submit" style={{ background:'#eab308', border:'none', color:'#0f172a', borderRadius:6, padding:'8px 16px', fontWeight:900, cursor:'pointer' }}>🚀 Switch Match</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ══ MATCH FORMAT & RULES MODAL (v3.0) ═════════════════ */}
            {showFormatModal && (
                <MatchFormatRulesModal
                    matchId={matchId}
                    currentFormat={match.matchFormat || match.matchType}
                    isOpen={showFormatModal}
                    onClose={() => setShowFormatModal(false)}
                    onUpdated={(res) => {
                        if (res.match) setMatch(prev => ({ ...prev, ...res.match }));
                    }}
                />
            )}

        </div>
    );
};

export default MiniAdmin;
