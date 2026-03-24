import React, { useState, useEffect, useCallback } from "react";
import { db } from "../firebase";
import { ref, onValue, update } from "firebase/database";
import "./MiniAdmin.css";

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
    const [match, setMatch] = useState(null);
    const [history, setHistory] = useState([]);
    const [openSections, setOpenSections] = useState({ scoring: true });
    const [overCooldown, setOverCooldown] = useState(false);

    // ── Ticker state ──────────────────────────────────────────────
    const [tickerMsg, setTickerMsg] = useState("");
    const [tickerMode, setTickerMode] = useState("banner");
    const [tickerPreset, setTickerPreset] = useState("final");
    const [tickerVisible, setTickerVisible] = useState(false);

    // ── Firebase: live_match ──────────────────────────────────────
    useEffect(() => {
        const unsub = onValue(ref(db, "live_match"), (snap) => {
            const d = snap.val();
            if (d) setMatch(d);
        });
        return () => unsub();
    }, []);

    // ── Firebase: overlay_ticker ──────────────────────────────────
    useEffect(() => {
        const unsub = onValue(ref(db, "overlay_ticker"), (snap) => {
            const d = snap.val();
            if (d) {
                setTickerMsg(d.message || "");
                setTickerMode(d.mode || "banner");
                setTickerPreset(d.preset || "final");
                setTickerVisible(!!d.visible);
            }
        });
        return () => unsub();
    }, []);

    // ── Write helpers ─────────────────────────────────────────────
    const push = useCallback((changes) => {
        update(ref(db, "live_match"), { ...changes, eventTime: Date.now() });
    }, []);

    const pushTicker = (overrides = {}) => {
        update(ref(db, "overlay_ticker"), {
            message: overrides.message ?? tickerMsg,
            mode: overrides.mode ?? tickerMode,
            preset: overrides.preset ?? tickerPreset,
            visible: overrides.visible ?? tickerVisible,
        });
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
    const addRun = (runs) => {
        if (!match || match.overLocked) return;
        setHistory(h => [...h, match]);
        const ak = match.player1.onStrike ? "player1" : "player2";
        const { recentBalls, overRuns } = updateOverHistory(runs === 0 ? "•" : runs.toString(), match, runs);
        push({
            score: match.score + runs, totalBalls: match.totalBalls + 1,
            [ak]: { ...match[ak], runs: match[ak].runs + runs, balls: match[ak].balls + 1 },
            recentBalls, overRuns,
            eventTrigger: null,
            legalBallCount: (match.legalBallCount || 0) + 1,
        });
    };

    // Dedicated boundary handler — ONLY called by FOUR/SIX buttons
    const addBoundary = (runs) => {
        if (!match || match.overLocked) return;
        setHistory(h => [...h, match]);
        const ak = match.player1.onStrike ? "player1" : "player2";
        const { recentBalls, overRuns } = updateOverHistory(runs.toString(), match, runs);
        push({
            score: match.score + runs, totalBalls: match.totalBalls + 1,
            [ak]: { ...match[ak], runs: match[ak].runs + runs, balls: match[ak].balls + 1 },
            recentBalls, overRuns,
            eventTrigger: runs === 6 ? "SIX" : "FOUR",
            legalBallCount: (match.legalBallCount || 0) + 1,
        });
    };

    const addExtra = (type, runs = 0) => {
        if (!match || match.overLocked) return;
        setHistory(h => [...h, match]);
        const total = 1 + runs;
        const entry = runs > 0 ? `${type}+${runs}` : type;
        const { recentBalls, overRuns } = updateOverHistory(entry, match, total);
        const ak = match.player1.onStrike ? "player1" : "player2";
        const batUp = type === "NB" ? { [ak]: { ...match[ak], runs: match[ak].runs + runs, balls: match[ak].balls + 1 } } : {};
        push({ score: match.score + total, recentBalls, overRuns, ...batUp, eventTrigger: null });
    };

    const addLegBye = (runs) => {
        if (!match || match.overLocked) return;
        setHistory(h => [...h, match]);
        const ak = match.player1.onStrike ? "player1" : "player2";
        const { recentBalls, overRuns } = updateOverHistory(`LB${runs}`, match, runs);
        push({
            score: match.score + runs, totalBalls: match.totalBalls + 1,
            [ak]: { ...match[ak], balls: match[ak].balls + 1 },
            recentBalls, overRuns,
            eventTrigger: null,
            legalBallCount: (match.legalBallCount || 0) + 1,
        });
    };

    const addBye = (runs) => {
        if (!match || match.overLocked) return;
        setHistory(h => [...h, match]);
        const ak = match.player1.onStrike ? "player1" : "player2";
        const { recentBalls, overRuns } = updateOverHistory(`B${runs}`, match, runs);
        push({
            score: match.score + runs, totalBalls: match.totalBalls + 1,
            [ak]: { ...match[ak], balls: match[ak].balls + 1 },
            recentBalls, overRuns,
            eventTrigger: null,
            legalBallCount: (match.legalBallCount || 0) + 1,
        });
    };

    const handleWicket = () => {
        if (!match || match.overLocked) return;
        setHistory(h => [...h, match]);
        const outKey = match.player1.onStrike ? "player1" : "player2";
        const op = match[outKey];
        const { recentBalls, overRuns } = updateOverHistory("W", match, 0);
        push({
            wickets: match.wickets + 1, totalBalls: match.totalBalls + 1,
            recentBalls, overRuns,
            fallOfWickets: [...(match.fallOfWickets || []), { name: op.name, runs: op.runs, balls: op.balls, bowler: match.bowler?.name, fowScore: match.score, fowWicket: match.wickets + 1 }],
            eventTrigger: "WICKET",
            lastWicketName: op.name, lastWicketRuns: op.runs, lastWicketBalls: op.balls,
            [outKey]: { name: "NEW PLAYER", runs: 0, balls: 0, onStrike: true },
            legalBallCount: (match.legalBallCount || 0) + 1,
        });
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
        update(ref(db, "live_match"), prev);
    };

    // ── OVER COMPLETED ──────────────────────────────────────────
    const handleOverCompleted = () => {
        const lbc = match?.legalBallCount || 0;
        if (!match || lbc < bpo || overCooldown) return;
        setOverCooldown(true);
        setTimeout(() => setOverCooldown(false), 1000);
        setHistory(h => [...h, match]);
        push({
            recentBalls: [],
            overRuns: 0,
            legalBallCount: 0,
            currentOver: (match.currentOver || 0) + 1,
            overLocked: false,
            eventTrigger: "NEW_OVER",
            player1: { ...match.player1, onStrike: !match.player1.onStrike },
            player2: { ...match.player2, onStrike: !match.player2.onStrike },
        });
    };

    // ── Keyboard shortcuts ────────────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
            const k = e.key.toLowerCase();
            if (["0", "1", "2", "3"].includes(k)) addRun(parseInt(k));
            if (k === "4") addBoundary(4);
            if (k === "6") addBoundary(6);
            if (k === "w") handleWicket();
            if (k === "s") swapStrike();
            if (k === "u") handleUndo();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    });

    // ── Loading ───────────────────────────────────────────────────
    if (!match) return <div className="ma-root"><div className="ma-loading">Connecting…</div></div>;

    const striker = match.player1?.onStrike ? match.player1 : match.player2;
    const nonStriker = match.player1?.onStrike ? match.player2 : match.player1;
    const strikerKey = match.player1?.onStrike ? "player1" : "player2";
    const nonStrikerKey = match.player1?.onStrike ? "player2" : "player1";
    const totalMatchBalls = (match.maxOvers || 5) * bpo;
    const remainingBalls = totalMatchBalls - match.totalBalls;
    const crr = match.totalBalls > 0 ? (match.score / (match.totalBalls / bpo)).toFixed(2) : "0.00";
    const rrr = match.isSecondInnings && remainingBalls > 0
        ? ((match.targetScore - match.score) / (remainingBalls / bpo)).toFixed(2)
        : "--";
    const legalBallCount = match.legalBallCount || 0;
    const isOverReady = legalBallCount >= bpo;

    return (
        <div className="ma-root">

            {/* ═══ HEADER ═══════════════════════════════════════════════ */}
            <div className="ma-header">
                <span className="ma-logo">⚡ KS CONTROL</span>
                <span className="ma-live-pulse" />
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
            {match.isSecondInnings && (
                <div className="ma-chase-alert">Need {match.targetScore - match.score} in {remainingBalls} balls</div>
            )}

            {/* ═══ SCROLLABLE SECTIONS ═════════════════════════════════ */}
            <div className="ma-scroll-area">

                {/* ── 1. MATCH CONTROL (Blue) ──────────────────────────── */}
                <Section label="MATCH CONTROL" color="blue" icon="🎯" open={!!openSections.match} onClick={() => toggle("match")}>
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
                        <input type="number" className="ma-inp" value={match.ballsPerOver} onChange={(e) => push({ ballsPerOver: parseInt(e.target.value) || 5 })} />
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
                </Section>

                {/* ── 1.5. INNINGS & SUPER OVER ────────────────────────── */}
                <Section label="INNINGS & EXTRA" color="amber" icon="🔄" open={!!openSections.innings} onClick={() => toggle("innings")}>
                    <div className="ma-btn-row mb-2">
                        <button className={`ma-btn ${!match.isSecondInnings ? "bg-amber-600 text-white border-amber-800" : "ma-btn-blue opacity-50"}`} onClick={() => push({ isSecondInnings: false })}>1ST INN</button>
                        <button className={`ma-btn ${match.isSecondInnings ? "bg-amber-600 text-white border-amber-800" : "ma-btn-blue opacity-50"}`} onClick={() => push({ isSecondInnings: true })}>2ND INN</button>
                    </div>
                    
                    <button className="ma-btn ma-btn-wicket w-full mb-2" style={{ backgroundColor: '#ef4444', borderColor: '#991b1b' }} onClick={() => {
                        if (window.confirm("Start 2nd Innings? This will zero runs, wickets, and overs. Target score will NOT be set automatically.")) {
                            push({ score: 0, wickets: 0, totalBalls: 0, currentOver: 0, overRuns: 0, recentBalls: [], legalBallCount: 0, isSecondInnings: true, player1: { name: "", runs: 0, balls: 0, onStrike: true }, player2: { name: "", runs: 0, balls: 0, onStrike: false }, eventTrigger: "RESET_WINNER" });
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
                    <div className="ma-row">
                        <label>Striker</label>
                        <select className="ma-sel" value={striker?.name || ""} onChange={(e) => push({ [strikerKey]: { ...match[strikerKey], name: e.target.value } })}>
                            <option value="">-- SELECT --</option>
                            {(match.battingSquad || []).map((p, i) => <option key={i} value={p.name}>{p.name}</option>)}
                        </select>
                    </div>
                    <div className="ma-row">
                        <label>Non-Striker</label>
                        <select className="ma-sel" value={nonStriker?.name || ""} onChange={(e) => push({ [nonStrikerKey]: { ...match[nonStrikerKey], name: e.target.value } })}>
                            <option value="">-- SELECT --</option>
                            {(match.battingSquad || []).map((p, i) => <option key={i} value={p.name}>{p.name}</option>)}
                        </select>
                    </div>
                    <button className="ma-btn ma-btn-swap w-full" onClick={swapStrike}>↔ SWAP STRIKE (S)</button>
                    {/* Manual runs edit */}
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
                    <div className="ma-row">
                        <label>Bowler</label>
                        <select className="ma-sel" value={match.bowler?.name || ""} onChange={(e) => push({ bowler: { ...match.bowler, name: e.target.value } })}>
                            <option value="">-- SELECT --</option>
                            {(match.bowlingSquad || []).map((p, i) => <option key={i} value={p.name}>{p.name}</option>)}
                        </select>
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
                    <div className="ma-label">WIDE +</div>
                    <div className="ma-grid ma-grid-5">
                        {[0, 1, 2, 3, 4].map(r => (
                            <button key={r} className="ma-btn ma-btn-extra" onClick={() => addExtra("WD", r)}>
                                WD{r > 0 ? `+${r}` : ""}
                            </button>
                        ))}
                    </div>

                    {/* No Balls */}
                    <div className="ma-label">NO BALL +</div>
                    <div className="ma-grid ma-grid-5">
                        {[0, 1, 2, 3, 4].map(r => (
                            <button key={r} className="ma-btn ma-btn-extra" onClick={() => addExtra("NB", r)}>
                                NB{r > 0 ? `+${r}` : ""}
                            </button>
                        ))}
                    </div>

                    {/* Leg Byes */}
                    <div className="ma-label">LEG BYE</div>
                    <div className="ma-grid ma-grid-4">
                        {[1, 2, 3, 4].map(r => (
                            <button key={r} className="ma-btn ma-btn-lb" onClick={() => addLegBye(r)}>LB {r}</button>
                        ))}
                    </div>

                    {/* Byes */}
                    <div className="ma-label">BYE</div>
                    <div className="ma-grid ma-grid-4">
                        {[1, 2, 3, 4].map(r => (
                            <button key={r} className="ma-btn ma-btn-bye" onClick={() => addBye(r)}>B {r}</button>
                        ))}
                    </div>
                </Section>

                {/* ── 5. OVER CONTROL ──────────────────────────────────── */}
                <Section label="OVER CONTROL" color="amber" icon="🔧" open={!!openSections.overs} onClick={() => toggle("overs")}>
                    <div className="ma-btn-row">
                        <button className="ma-btn ma-btn-undo" onClick={handleUndo}>↶ UNDO (U)</button>
                        <button className="ma-btn ma-btn-swap" onClick={swapStrike}>↔ SWAP (S)</button>
                    </div>
                    <div className="ma-row">
                        <label>Total Balls</label>
                        <input type="number" className="ma-inp" value={match.totalBalls} onChange={(e) => push({ totalBalls: parseInt(e.target.value) || 0 })} />
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
                            <span key={i} className={`ma-ball ${b === "W" ? "ma-ball-w" : b === "•" ? "ma-ball-dot" : ""}`}>{b}</span>
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
                        <button className={`ma-btn ${tickerVisible ? "ma-btn-hide" : "ma-btn-show"}`} onClick={() => { const v = !tickerVisible; setTickerVisible(v); pushTicker({ visible: v }); }}>
                            {tickerVisible ? "🔴 HIDE" : "🟢 SHOW"}
                        </button>
                    </div>
                </Section>

            </div>

            {/* ═══ STICKY BOTTOM — QUICK SCORE BAR ═════════════════════ */}
            <div className="ma-sticky-bar">
                <button className="ma-sq ma-sq-dot" onClick={() => addRun(0)}>•</button>
                <button className="ma-sq ma-sq-run" onClick={() => addRun(1)}>1</button>
                <button className="ma-sq ma-sq-run" onClick={() => addRun(2)}>2</button>
                <button className="ma-sq ma-sq-run" onClick={() => addBoundary(4)}>4</button>
                <button className="ma-sq ma-sq-six" onClick={() => addBoundary(6)}>6</button>
                <button className="ma-sq ma-sq-wkt" onClick={handleWicket}>W</button>
                <button className="ma-sq ma-sq-wd" onClick={() => addExtra("WD")}>WD</button>
                <button className={`ma-sq ${isOverReady ? 'ma-sq-over-ready' : 'ma-sq-undo'}`} onClick={isOverReady ? handleOverCompleted : handleUndo}>{isOverReady ? '⚡' : '↶'}</button>
            </div>

            {/* Keyboard hint */}
            <div className="ma-hints">Keys: 0-4,6 = Runs · W = Wicket · S = Swap · U = Undo</div>
        </div>
    );
};

export default MiniAdmin;
