import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { matchesApi } from "../api";
import { db } from "../firebase";
import { ref, onValue } from "firebase/database";
import { PlayIcon } from "@heroicons/react/24/solid";
import BroadcastTicker from "./BroadcastTicker";
import "./BroadcastScreens.css";
import "./ks-premium.css";
import "./newipl.css";
import "./IPL2026Theme.css";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const isMongoDB = (id) => id && /^KS-/i.test(id);

const ScorecardDisplay = () => {
  const { matchId } = useParams();
  const dbPath = matchId ? `matches/${matchId}/live_match` : 'live_match';
  const [match, setMatch] = useState(null);
  const [showEvent, setShowEvent] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState(null);

  // ── Animation state ───────────────────────────────────────────
  const [scoreAnimClass, setScoreAnimClass] = useState("");
  const [boardAnimClass, setBoardAnimClass] = useState("");
  const [bowlerAnimClass, setBowlerAnimClass] = useState("");
  const [newOverAnim, setNewOverAnim] = useState(false);
  const [showInfoStrip, setShowInfoStrip] = useState(false);
  const prevScore = useRef(null);
  const prevWickets = useRef(null);
  const prevEventTime = useRef(null);
  const prevBannerEventTime = useRef(null);
  const prevTourneyBannerTime = useRef(null);
  const eventTimerRef = useRef(null);
  const prevCurrentOver = useRef(null);

  // Bug 10 fix: pre-generate stable particle positions keyed on eventId
  // so particles don't flicker (jump to new random positions) on every re-render.
  const particleData = useMemo(() => {
    return Array.from({ length: 8 }).map(() => ({
      left: `${10 + Math.random() * 80}%`,
      animDelay: `${Math.random() * 0.6}s`,
      animDuration: `${1.2 + Math.random() * 1}s`,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.eventId]);

  // ── Memoized static theme data (never changes, avoids re-creation) ──
  const themes = useMemo(() => ({
    IPL_GOLD: { main: "bg-slate-900", accent: "bg-yellow-400", text: "text-yellow-400", batsman: "bg-yellow-400", bowler: "from-blue-800 to-blue-950", border: "border-yellow-500", chase: "bg-blue-900", animClass: "anim-ipl-gold" },
    SKY_PRO: { main: "bg-white", accent: "bg-red-600", text: "text-red-600", batsman: "bg-slate-100", bowler: "from-red-600 to-red-800", border: "border-red-600", chase: "bg-slate-900", animClass: "anim-sky-pro" },
    NEON_VAVUNIYA: { main: "bg-black", accent: "bg-lime-500", text: "text-lime-400", batsman: "bg-zinc-900", bowler: "from-zinc-800 to-black", border: "border-lime-500", chase: "bg-zinc-800", animClass: "anim-neon-vavuniya" },
    MINIMAL_DARK: { main: "bg-zinc-950", accent: "bg-white", text: "text-white", batsman: "bg-zinc-800", bowler: "from-zinc-700 to-zinc-900", border: "border-white/20", chase: "bg-black", animClass: "anim-minimal-dark" },
    CLASSIC_DARK: { main: "theme-classic-dark", accent: "bg-gray-300", text: "text-gray-200", batsman: "theme-classic-dark-bat", bowler: "from-gray-800 to-gray-950", border: "border-gray-500", chase: "bg-gray-900", animClass: "anim-classic-dark" },
    T20_NEON: { main: "theme-t20-neon", accent: "theme-t20-neon-accent", text: "text-cyan-300", batsman: "theme-t20-neon-bat", bowler: "from-purple-900 to-fuchsia-950", border: "border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.4)]", chase: "bg-fuchsia-900", animClass: "anim-t20-neon" },
    WC_BLUE_PURPLE: { main: "theme-wc-bp", accent: "theme-wc-bp-accent", text: "text-blue-300", batsman: "theme-wc-bp-bat", bowler: "from-indigo-900 to-purple-950", border: "border-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.4)]", chase: "bg-indigo-900", animClass: "anim-wc-bp" },
    GOLD_CHAMPIONSHIP: { main: "theme-gold-champ", accent: "theme-gold-champ-accent", text: "text-amber-300", batsman: "theme-gold-champ-bat", bowler: "from-amber-900 to-yellow-950", border: "border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]", chase: "bg-amber-950", animClass: "anim-gold-champ" },
    KS_SPECIAL: { main: "theme-ks-special", accent: "theme-ks-special-accent", text: "text-teal-300", batsman: "theme-ks-special-bat", bowler: "from-gray-800 to-gray-900", border: "border-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.35)]", chase: "theme-ks-special-chase", animClass: "anim-ks-special" },
    WC2026: { main: "theme-wc2026", accent: "theme-wc2026-accent", text: "theme-wc2026-score", batsman: "theme-wc2026-bat", bowler: "theme-wc2026-bowler", border: "theme-wc2026-border", chase: "theme-wc2026-chase", isWC2026: true, animClass: "anim-wc2026" },
    SL_BROADCAST: { main: "theme-sl-broadcast", accent: "theme-sl-broadcast-accent", text: "theme-sl-broadcast-score", batsman: "theme-sl-broadcast-bat", bowler: "theme-sl-broadcast-bowler", border: "theme-sl-broadcast-border", chase: "theme-sl-broadcast-chase", animClass: "anim-sl-broadcast" },
    DC_BLUE: { main: "bg-blue-900", accent: "bg-cyan-400", text: "text-cyan-400", batsman: "bg-blue-950 text-white border-x border-blue-800", bowler: "from-blue-800 to-blue-950", border: "border-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.3)]", chase: "bg-blue-950", animClass: "anim-ipl-gold" }
  }), []);

  // ── Reusable animation trigger helper ──────────────────────────
  const triggerAnim = useCallback((setter, className, duration = 1000) => {
    setter(className);
    const t = setTimeout(() => setter(""), duration);
    return t;
  }, []);

  // ── DUAL-MODE DATA SYNC (MongoDB/Socket.IO or Legacy Firebase) ────────────────────────────
  useEffect(() => {
    // ─── Merge helper: socket payloads are often PARTIAL (only changed fields).
    // We must MERGE into existing state, not replace, to preserve themeID/teamNames etc.
    const mergeMatchState = (prev, incoming) => {
      if (!incoming) return prev;
      if (!prev) {
        // First load — flatten overlaySettings into top-level fields
        if (incoming.overlaySettings) {
          return {
            ...incoming,
            themeID: incoming.overlaySettings.themeID || 'IPL_GOLD',
            battingLogo: incoming.overlaySettings.battingLogo || incoming.battingLogo || '',
            leagueLogo: incoming.overlaySettings.leagueLogo || incoming.leagueLogo || '',
            overlayMode: incoming.overlaySettings.overlayMode || 'full',
            showVersus: !!incoming.overlaySettings.showVersus,
            showSummary: !!incoming.overlaySettings.showSummary,
            showMatchSituation: !!incoming.overlaySettings.showMatchSituation,
          };
        }
        return incoming;
      }

      // Merge: start with existing state, overlay changed fields
      const merged = { ...prev, ...incoming };

      // If the update includes overlaySettings, always extract theme fields
      if (incoming.overlaySettings) {
        merged.themeID = incoming.overlaySettings.themeID || prev.themeID || 'IPL_GOLD';
        merged.battingLogo = incoming.overlaySettings.battingLogo || prev.battingLogo || '';
        merged.leagueLogo = incoming.overlaySettings.leagueLogo || prev.leagueLogo || '';
        merged.overlayMode = incoming.overlaySettings.overlayMode || prev.overlayMode || 'full';
        merged.showVersus = incoming.overlaySettings.showVersus ?? prev.showVersus ?? false;
        merged.showSummary = incoming.overlaySettings.showSummary ?? prev.showSummary ?? false;
        merged.showMatchSituation = incoming.overlaySettings.showMatchSituation ?? prev.showMatchSituation ?? false;
      }

      // If themeID was sent directly (from updateMatch broadcasting raw updates)
      if (incoming.themeID) {
        merged.themeID = incoming.themeID;
      }

      return merged;
    };

    const handleIncomingData = (data) => {
      if (!data) return;

      setMatch(prev => {
        const merged = mergeMatchState(prev, data);

        // Check event triggers AFTER merge
        if (merged.eventTrigger === 'RESET_WINNER') {
          setWinnerInfo(null);
        }

        if (['FOUR', 'SIX', 'WICKET'].includes(merged.eventTrigger) &&
            merged.eventTime && merged.eventTime !== prevBannerEventTime.current) {
          prevBannerEventTime.current = merged.eventTime;
          if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
          setShowEvent(true);
          eventTimerRef.current = setTimeout(() => setShowEvent(false), 3000);
        }

        return merged;
      });
    };

    if (isMongoDB(matchId)) {
      console.log('[ScorecardDisplay] Initializing MongoDB mode for matchId:', matchId);
      
      // Initial full load from REST
      matchesApi.get(matchId)
        .then(res => {
          if (res.match) handleIncomingData(res.match);
        })
        .catch(e => console.error('MongoDB initial fetch failed:', e));

      // Real-time Socket.IO setup
      let socket;
      import('socket.io-client').then(({ io }) => {
        socket = io(`${API_URL}/overlay`, {
          query: { matchId },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 500,
          reconnectionDelayMax: 2000,
          timeout: 10000,
        });

        socket.on('connection:ack', ({ snapshot }) => {
          if (snapshot) handleIncomingData(snapshot);
        });

        // On reconnect, do a fresh full fetch to resync all state
        socket.on('reconnect', () => {
          console.log('[ScorecardDisplay] Socket reconnected — resyncing state...');
          matchesApi.get(matchId)
            .then(res => { if (res.match) handleIncomingData(res.match); })
            .catch(() => {});
        });

        // Live update events — all partial updates, merged into state
        socket.on('score:update', (data) => handleIncomingData(data));
        socket.on('score:correction', (data) => handleIncomingData(data));
        socket.on('players:update', (data) => handleIncomingData(data));
        socket.on('ticker:update', (data) => handleIncomingData(data));
        socket.on('match:status', (data) => handleIncomingData(data));

        socket.on('connect_error', (err) => {
          console.warn('[ScorecardDisplay] Socket connect error:', err.message);
        });

      }).catch(e => console.error('Failed to load socket client:', e));

      return () => {
        if (socket) socket.disconnect();
        if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
      };
    } else {
      // Legacy Firebase — full state on every update
      console.log('[ScorecardDisplay] Initializing Firebase Legacy mode. Path:', dbPath);
      const unsubscribe = onValue(ref(db, dbPath), (snapshot) => {
        const val = snapshot.val();
        if (val) setMatch(val);
      });
      return () => {
        unsubscribe();
        if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
      };
    }
  }, [matchId, dbPath]);

  // ── Animation detection: score / event / over changes ─────────
  useEffect(() => {
    if (!match) return;
    const timers = [];

    // Score change animation
    if (prevScore.current !== null && match.score !== prevScore.current) {
      if (match.eventTrigger === "FOUR" && match.eventTime !== prevEventTime.current) {
        timers.push(triggerAnim(setScoreAnimClass, "score-boundary-glow", 900));
        timers.push(triggerAnim(setBoardAnimClass, "score-boundary-glow", 900));
      } else if (match.eventTrigger === "SIX" && match.eventTime !== prevEventTime.current) {
        timers.push(triggerAnim(setScoreAnimClass, "score-six-burst", 1000));
        timers.push(triggerAnim(setBoardAnimClass, "score-six-burst", 1000));
      } else {
        timers.push(triggerAnim(setScoreAnimClass, "score-flash", 600));
      }
    }

    // Wicket animation
    if (prevWickets.current !== null && match.wickets !== prevWickets.current && match.eventTrigger === "WICKET" && match.eventTime !== prevEventTime.current) {
      timers.push(triggerAnim(setScoreAnimClass, "score-wicket-impact", 800));
      timers.push(triggerAnim(setBoardAnimClass, "score-wicket-impact", 800));
    }

    // New Over animation
    if (match.eventTrigger === "NEW_OVER" && match.eventTime !== prevEventTime.current) {
      timers.push(triggerAnim(setBowlerAnimClass, "over-slide-in", 700));
      setNewOverAnim(true);
      const overTimer = setTimeout(() => setNewOverAnim(false), 800);
      timers.push(overTimer);
    }

    // Update refs
    prevScore.current = match.score;
    prevWickets.current = match.wickets;
    prevEventTime.current = match.eventTime;
    prevCurrentOver.current = match.currentOver;

    return () => timers.forEach(t => clearTimeout(t));
  }, [match, triggerAnim]);

  // ── Manual & Auto-trigger for Tournament Info Strip ───────────────────────
  useEffect(() => {
    if (!match) return;
    
    // Manual trigger from Admin Panel
    if (match.eventTrigger === "SHOW_BANNER" && match.eventTime !== prevTourneyBannerTime.current) {
      prevTourneyBannerTime.current = match.eventTime;
      setShowInfoStrip(true);
      setTimeout(() => setShowInfoStrip(false), 5000);
    }
  }, [match]);

  useEffect(() => {
    // If autoShowBanner is false, early return to clear intervals
    if (!match || match.autoShowBanner === false) return;

    // Show initially after 5 seconds if enabled
    const initialTimer = setTimeout(() => {
      setShowInfoStrip(true);
      setTimeout(() => setShowInfoStrip(false), 5000);
    }, 5000);

    // Then repeated every 45 seconds
    const interval = setInterval(() => {
      setShowInfoStrip(true);
      setTimeout(() => setShowInfoStrip(false), 5000);
    }, 45000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [match?.autoShowBanner]);

  const prevWinnerTrigger = useRef(false);
  const [showWinner, setShowWinner] = useState(false);

  // ── Winner Logic (Auto-trigger) ──────────────────────────
  useEffect(() => {
    if (!match) return;
    
    // Reset winner logic on new innings or match reset
    if (match.eventTrigger === "RESET_WINNER") {
      setWinnerInfo(null);
      setShowWinner(false);
      prevWinnerTrigger.current = false;
      return;
    }

    if (match.isSecondInnings && !match.isSuperOver) {
      const totalBalls = (match.maxOvers || 5) * 6;
      const remainingBalls = totalBalls - match.totalBalls;
      
      let winnerObj = null;
      if (match.score >= (match.targetScore || 0)) {
        winnerObj = { team: match.battingTeam, logo: match.battingLogo, text: `WON BY ${10 - match.wickets} WICKETS` };
      } else if (remainingBalls <= 0 || match.wickets >= 10) {
        const resultText = match.score === (match.targetScore - 1) ? "MATCH TIED" : `WON BY ${match.targetScore - 1 - match.score} RUNS`;
        winnerObj = { team: match.bowlingTeam, logo: match.leagueLogo, text: resultText };
      }

      if (winnerObj && !prevWinnerTrigger.current) {
        prevWinnerTrigger.current = true;
        setWinnerInfo(winnerObj);
        setShowWinner(true);
        // Clean slide-out after 5 seconds
        setTimeout(() => setShowWinner(false), 5000);
      }
    } 
  }, [match]);

  // ── Memoized helpers (MUST be above early return — Rules of Hooks) ──
  const getOvers = useCallback((balls) => { const bpo = match?.ballsPerOver || 6; return `${Math.floor(balls / bpo)}.${balls % bpo}`; }, [match?.ballsPerOver]);

  const active = useMemo(() => {
    const base = themes[match?.themeID] || themes.IPL_GOLD;
    return {
      ...base,
      isKsPremium: match?.themeID === 'KS_PREMIUM',
      isNewIpl: match?.themeID === 'NEW_IPL',
      isIpl2026: match?.themeID === 'IPL_2026',
      isApogee: match?.themeID === 'APOGEE',
      isDcBlue: match?.themeID === 'DC_BLUE',
    };
  }, [match?.themeID]);

  if (!match) return (
    <div className="fixed inset-0 bg-[#071A2F] flex flex-col items-center justify-center text-white font-black italic uppercase tracking-widest gap-6">
      <img src="/ks_logo.png" className="h-24 w-24 object-contain animate-pulse" alt="KS Live logo" />
      <span className="text-lg tracking-[0.3em]">Connecting to KS Live...</span>
    </div>
  );
  const animThemeClass = active.animClass || "anim-ipl-gold";
  const totalMatchBalls = (match.maxOvers || 5) * 6;
  const remainingBalls = totalMatchBalls - match.totalBalls;
  const isMatchFinished = ["finished", "match ended"].includes(String(match.matchStatus || "").toLowerCase());
  const bannerInfo = {
    title: match.matchTitle || match.bowlingPrefix || "Live Match",
    tournament: match.tournamentName || "Cricket Scoreboard",
    venue: match.venueName || "Venue TBA",
    date: match.matchDate || "Date TBA",
    battingTeam: match.battingTeam || "TEAM A",
    bowlingTeam: match.bowlingTeam || "TEAM B",
  };
  const finalWinnerText = winnerInfo?.text || (match.isSecondInnings ? "Result Pending" : "Innings Complete");
  const finalWinnerTeam = winnerInfo?.team || (match.isSecondInnings ? (match.score >= (match.targetScore || 0) ? match.battingTeam : match.bowlingTeam) : match.battingTeam);

  return (
    <div className="fixed inset-0 font-broadcast select-none pointer-events-none text-white uppercase italic">

      {/* 1. NAVIGATION OVERLAY (Admin only, visible on hover) */}
      <div className="fixed top-4 left-4 z-[200] flex gap-2 pointer-events-auto opacity-0 hover:opacity-100 transition-opacity">
        <button onClick={() => window.open('/admin', '_blank')} className="bg-slate-800 text-white text-[10px] px-4 py-2 rounded-full font-black border border-white/20">ADMIN PANEL ↗</button>
        <button onClick={() => window.open('/teams', '_blank')} className="bg-blue-600 text-white text-[10px] px-4 py-2 rounded-full font-black">TEAM MANAGER ↗</button>
      </div>

      {/* 2. VERSUS OVERLAY — ICC-Style Cinematic */}
      {match.showVersus && !winnerInfo && (() => {
        const stage = match.bowlingPrefix?.toLowerCase().includes('final') ? 'final' : match.bowlingPrefix?.toLowerCase().includes('semi') ? 'semi' : 'league';
        return (
          <div className={`vs-screen vs-stage-${stage}`}>
            {/* Background Effects */}
            <div className="vs-bg-streaks" />
            <div className="vs-fog" />
            <div className="vs-flare" />
            <div className="vs-bottom-fade" />

            {/* 3D Rotating Light Beams */}
            <div className="vs-beam-container">
              <div className="vs-beam" />
              <div className="vs-beam" />
              <div className="vs-beam" />
              <div className="vs-beam-glow" />
            </div>

            {/* Spark Particles — Finals Only */}
            {stage === 'final' && (
              <div className="vs-sparks">
                {Array.from({ length: 12 }).map((_, i) => <div key={i} className="vs-spark" />)}
              </div>
            )}

            {/* Stage Label */}
            <div className="vs-stage-label">{match.bowlingPrefix || 'LEAGUE MATCH'}</div>

            {/* Teams + VS */}
            <div className="vs-content">
              <div className="vs-team-a">
                <img src={match.battingLogo} className="vs-logo vs-logo-a" alt="Team A" />
                <h2 className="vs-team-name">{match.battingTeam}</h2>
              </div>

              <div className="vs-text-container">
                <div className="vs-text-glow" />
                <span className="vs-text">VS</span>
              </div>

              <div className="vs-team-b">
                <img src={match.leagueLogo} className="vs-logo vs-logo-b" alt="Team B" />
                <h2 className="vs-team-name">{match.bowlingTeam}</h2>
              </div>
            </div>

            {/* Bottom Info */}
            <div className="vs-info-bar">
              <p className="vs-info-text">{match.ticker || `${match.maxOvers} OVERS MATCH`}</p>
            </div>
          </div>
        );
      })()}

      {/* 3. MATCH WINNER OVERLAY (Cinematic Broadcast Style) */}
      {!isMatchFinished && showWinner && winnerInfo && (
        <div className="winner-cinematic-strip">
          <div className="winner-cinematic-bg"></div>
          <div className="winner-cinematic-glow"></div>
          <div className="winner-cinematic-content">
            <img src={winnerInfo.logo} className="winner-cinematic-logo" alt="Winner" />
            <div className="winner-cinematic-text-wrap">
              <h1 className="winner-cinematic-team">{winnerInfo.team}</h1>
              <h2 className="winner-cinematic-text">{winnerInfo.text}</h2>
            </div>
          </div>
          <div className="winner-cinematic-sweep"></div>
        </div>
      )}

      {/* 4. SUMMARY SCREEN — Broadcast Animated */}
      {(match.showSummary || isMatchFinished) && !match.showVersus && (() => {
        const stage = match.bowlingPrefix?.toLowerCase().includes('final') ? 'final' : match.bowlingPrefix?.toLowerCase().includes('semi') ? 'semi' : 'league';
        return (
          <div className={`summary-screen summary-stage-${stage}`}>
            <div className="summary-card">
              {isMatchFinished && (
                <div className="summary-panel" style={{ marginBottom: '16px' }}>
                  <h3 className="summary-panel-header panel-gold">Final Scoreboard</h3>
                  <div className="summary-bat-row">
                    <span className="summary-bat-name">{bannerInfo.battingTeam}</span>
                    <span><span className="summary-bat-runs">{match.score}-{match.wickets}</span> <span className="summary-bat-balls">({getOvers(match.totalBalls)})</span></span>
                  </div>
                  {match.firstInningsScore !== undefined && (
                    <div className="summary-bat-row">
                      <span className="summary-bat-name">{bannerInfo.bowlingTeam}</span>
                      <span><span className="summary-bat-runs">{match.firstInningsScore}-{match.firstInningsWickets ?? 0}</span> <span className="summary-bat-balls">({getOvers(match.firstInningsOvers || 0)})</span></span>
                    </div>
                  )}
                  <div className="summary-bat-row" style={{ marginTop: '10px' }}>
                    <span className="summary-bat-name">{finalWinnerTeam || "Winner"}</span>
                    <span className="summary-bat-runs">{finalWinnerText}</span>
                  </div>
                </div>
              )}
              {/* Header */}
              <div className="summary-header">
                <div className="summary-team-info">
                  <img src={match.battingLogo} className="summary-team-logo" alt="Logo" />
                  <div>
                    <h1 className="summary-team-name">{match.battingTeam}</h1>
                    <p className="summary-label">{isMatchFinished ? `${bannerInfo.title} • ${bannerInfo.venue} • ${bannerInfo.date}` : "Match Summary"}</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <h2 className="summary-score-big">{match.score}-{match.wickets}</h2>
                  <p className="summary-overs-text">Overs: {getOvers(match.totalBalls)} / {match.maxOvers}</p>
                </div>
              </div>

              {/* Content Grid */}
              <div className="summary-grid">
                {/* Panel 1: Team Roster */}
                <div className="summary-panel">
                  <h3 className="summary-panel-header panel-blue">Team Roster</h3>
                  <div className="summary-scroll">
                    {match.battingSquad?.map((p, idx) => (
                      <div key={idx} className="summary-roster-row">
                        <img src={p.photo || 'https://via.placeholder.com/40'} className="summary-roster-photo" alt="p" />
                        <span className="summary-roster-name">{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Panel 2: Batting + Bowling */}
                <div className="summary-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <h3 className="summary-panel-header panel-gold">Currently Batting</h3>
                    {[match.player1, match.player2].map((p, i) => (
                      <div key={i} className="summary-bat-row">
                        <span className="summary-bat-name">{p.name} {p.onStrike && <span className="strike-dot">●</span>}</span>
                        <span><span className="summary-bat-runs">{p.runs}</span> <span className="summary-bat-balls">({p.balls})</span></span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h3 className="summary-panel-header panel-red">Current Bowler</h3>
                    <span className="summary-bowler-name">{match.bowler?.name}</span>
                    <span className="summary-bowler-figures">{match.bowler?.figures}</span>
                  </div>
                </div>

                {/* Panel 3: Fall of Wickets */}
                <div className="summary-panel">
                  <h3 className="summary-panel-header panel-red">Fall of Wickets</h3>
                  <div className="summary-scroll">
                    {match.fallOfWickets?.length > 0 ? (
                      match.fallOfWickets.map((w, idx) => (
                        <div key={idx} className="summary-fow-row">
                          <div>
                            <span className="summary-fow-name">{w.name}</span>
                            <span className="summary-fow-bowler">Bowler: {w.bowler}</span>
                          </div>
                          <span className="summary-fow-score">{w.runs}({w.balls})</span>
                        </div>
                      ))
                    ) : <p className="summary-empty">No wickets fallen</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}



      {/* 5.5 MATCH SITUATION OVERLAY */}
      {match.showMatchSituation && match.isSecondInnings && (match.targetScore - match.score) > 0 && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center pointer-events-none match-situation-overlay">
          <div className="match-situation-card relative px-16 py-10 rounded-2xl text-center">
            <div className="absolute inset-0 bg-black/85 backdrop-blur-xl rounded-2xl border border-white/10"></div>
            <div className="relative z-10">
              <p className="text-white/50 font-black text-[11px] uppercase tracking-[0.5em] mb-4">Chasing Target</p>
              <div className="flex items-center justify-center gap-3 mb-5">
                <div className="h-px w-12 bg-gradient-to-r from-transparent to-yellow-500/50"></div>
                <img src={match.battingLogo} className="w-14 h-14 rounded-full bg-white p-1 object-cover shadow-lg border-2 border-yellow-500/40" alt="Team" />
                <div className="h-px w-12 bg-gradient-to-l from-transparent to-yellow-500/50"></div>
              </div>
              <h1 className="text-white font-black text-3xl italic uppercase tracking-wide mb-2">
                {match.battingTeam}
              </h1>
              <p className="text-yellow-400 font-black text-2xl italic">
                need <span className="text-white text-4xl mx-1">{match.targetScore - match.score}</span> runs in <span className="text-white text-4xl mx-1">{((match.maxOvers || 5) * 6) - match.totalBalls}</span> balls
              </p>
              <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest mt-4">to win</p>
            </div>
          </div>
        </div>
      )}

      {/* 6. MAIN BOTTOM SCOREBOARD */}
      {!winnerInfo && !(match.showSummary || isMatchFinished) && !match.showVersus && (
        <div className={`absolute bottom-0 left-0 w-full flex flex-col pointer-events-none ${animThemeClass}`}>
          {/* TOURNAMENT INFO STRIP — slides in above the ticker */}
          {showInfoStrip && (
            <div className="tourney-info-strip">
              <div className="tourney-info-bg"></div>
              <div className="tourney-info-glow"></div>
              <div className="tourney-info-content">
                <h3 className="tourney-name">{bannerInfo.tournament} • {bannerInfo.title}</h3>
                <p className="tourney-venue">{bannerInfo.battingTeam} vs {bannerInfo.bowlingTeam} • {bannerInfo.venue} • {bannerInfo.date}</p>
              </div>
              <div className="tourney-info-sweep"></div>
            </div>
          )}

          
          {/* ═══════════════════════════════════════════════════════════
               KS PREMIUM THEME (Inspired by Broadcast Scoreboard)
          ═══════════════════════════════════════════════════════════ */}
          {active.isKsPremium ? (() => {
            const bpo = match.ballsPerOver || 6;
            const balls = match.recentBalls || [];
            const striker = [match.player1, match.player2].find(p => p?.onStrike);
            const nonStriker = [match.player1, match.player2].find(p => !p?.onStrike);
            const legalDeliveries = match.legalBallCount ?? match.totalBalls ?? 0;
            const totalMatchBallsKSP = (match.maxOvers || 5) * 6;
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
                    <img src={match.battingLogo} alt="Team" className="ksp-logo" />
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
                    {showEvent && ["FOUR", "SIX", "WICKET"].includes(match.eventTrigger) && (
                      <div className={`ksp-event-banner ksp-event-${match.eventTrigger.toLowerCase()}`}>
                        <div className="ksp-sweep" />
                        <div className="ksp-event-text">
                          {match.eventTrigger === "WICKET" ? "WICKET!" : match.eventTrigger === "FOUR" ? "FOUR!" : "SIX!"}
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
                          <div className="ksp-batter-row" style={{ color: striker ? '#fff' : '#aaa' }}>
                            <div className="ksp-batter-name">
                              {striker && <span className="ksp-striker-arrow">▶</span>} {striker?.name || 'BAT 1'}
                            </div>
                            <div>
                              <span className="ksp-batter-runs">{striker?.runs || 0}</span> <span className="ksp-batter-balls">{striker?.balls || 0}</span>
                            </div>
                          </div>
                          <div className="ksp-batter-row" style={{ color: nonStriker ? '#fff' : '#aaa' }}>
                            <div className="ksp-batter-name">
                              {nonStriker && <span className="ksp-striker-arrow">▶</span>} {nonStriker?.name || 'BAT 2'}
                            </div>
                            <div>
                              <span className="ksp-batter-runs">{nonStriker?.runs || 0}</span> <span className="ksp-batter-balls">{nonStriker?.balls || 0}</span>
                            </div>
                          </div>
                        </div>
                        <div className="ksp-bowler-section">
                          <div className="ksp-bowler-title">BOWLING : {match.bowlingTeam}</div>
                          <div className="ksp-bowler-row">
                            <div className="ksp-bowler-name">{match.bowler?.name || 'BOWLER'}</div>
                            <div className="ksp-bowler-figs">{match.bowler?.figures}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Block: Bowling Logo */}
                  <div className="ksp-right">
                     <img src={match.leagueLogo} alt="Bowling Logo" className="ksp-bowling-logo" />
                  </div>
                </div>

                {/* Bottom Ball Tracker */}
                <div className="ksp-ball-tracker">
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
                </div>
              </div>
            );
          })() : active.isNewIpl ? (() => {
            const bpo = match.ballsPerOver || 6;
            const balls = match.recentBalls || [];
            const striker = [match.player1, match.player2].find(p => p?.onStrike);
            const nonStriker = [match.player1, match.player2].find(p => !p?.onStrike);
            const legalDeliveries = match.legalBallCount ?? match.totalBalls ?? 0;
            const totalMatchBallsNew = (match.maxOvers || 5) * 6;
            const remainNew = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, totalMatchBallsNew - legalDeliveries);
            const rrrNew = match.isSecondInnings && remainNew > 0 ? ((match.targetScore - match.score) / (remainNew / 6)).toFixed(2) : '--';
            const runsNeeded = match.isSecondInnings ? Math.max(0, match.targetScore - match.score) : 0;
            
            return (
              <div className="newipl-wrapper">
                <div className="newipl-board">
                  {/* Event triggers (animated overlays) */}
                  {showEvent && ["FOUR", "SIX", "WICKET"].includes(match.eventTrigger) && (
                    <div className={`newipl-event-trigger newipl-event-${match.eventTrigger.toLowerCase()}`}>
                      <div className="newipl-event-text">{match.eventTrigger === "WICKET" ? "WICKET" : match.eventTrigger}</div>
                    </div>
                  )}

                  {/* Top section: League info & Live dot */}
                  <div className="newipl-top">
                    <div className="newipl-league-name">{match.tournamentName || "TATA IPL 2026"}</div>
                    <div className="newipl-live">
                      <div className="newipl-live-dot" /> LIVE
                    </div>
                  </div>

                  {/* Middle section: Score & Batters */}
                  <div className="newipl-middle">
                    {/* Team & Score */}
                    <div className="newipl-team-block">
                      <img src={match.battingLogo} alt="Team" className="newipl-team-logo" />
                      <div className="newipl-team-name">{match.battingTeam}</div>
                      <div className={`newipl-score ${scoreAnimClass ? 'newipl-score-update' : ''}`}>
                        {match.score}-{match.wickets} <span className="newipl-overs">({getOvers(match.legalBallCount ?? match.totalBalls)})</span>
                      </div>
                    </div>

                    {/* Target or Batters */}
                    <div className="newipl-stats-block">
                      {match.isSecondInnings && (runsNeeded > 0) && (remainNew <= 30) ? (
                        <div className="newipl-target-box">
                          <div className="newipl-target-label">TARGET: {match.targetScore}</div>
                          <div className="newipl-target-value">NEED {runsNeeded} FROM {remainNew}</div>
                        </div>
                      ) : (
                        <div className="newipl-batters">
                          <div className="newipl-batter-row" style={{ color: striker ? '#fff' : '#aaa' }}>
                            <div className="newipl-batter-name">
                              {striker && <span className="newipl-striker-arrow">▶</span>} {striker?.name || 'BAT 1'}
                            </div>
                            <div className="newipl-batter-score">{striker?.runs || 0}<span className="newipl-batter-balls">({striker?.balls || 0})</span></div>
                          </div>
                          <div className="newipl-batter-row" style={{ color: nonStriker ? '#fff' : '#aaa' }}>
                            <div className="newipl-batter-name">
                              {nonStriker && <span className="newipl-striker-arrow">▶</span>} {nonStriker?.name || 'BAT 2'}
                            </div>
                            <div className="newipl-batter-score">{nonStriker?.runs || 0}<span className="newipl-batter-balls">({nonStriker?.balls || 0})</span></div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bowler */}
                    <div className="newipl-bowler-block">
                      <div className="newipl-bowler-label">BOWLER</div>
                      <div className="newipl-bowler-name">{match.bowler?.name || 'BOWLER'}</div>
                      <div className="newipl-bowler-figs">{match.bowler?.figures}</div>
                    </div>
                  </div>

                  {/* Bottom section: Ball tracker & Extra stats */}
                  <div className="newipl-bottom">
                    <div className="newipl-balls">
                      {Array.from({ length: Math.max(bpo, balls.length) }).map((_, i) => {
                        const b = balls[i] || '';
                        let ballClass = '';
                        if (b === '4') ballClass = 'four';
                        else if (b === '6') ballClass = 'six';
                        else if (b.includes('W')) ballClass = 'wicket';
                        else if (b.includes('WD') || b.includes('NB') || b.includes('LB') || b.includes('B')) ballClass = 'extra';
                        return (
                          <div key={i} className={`newipl-ball ${ballClass}`}>
                            {b === '•' ? '0' : b}
                          </div>
                        );
                      })}
                    </div>
                    {match.isSecondInnings ? (
                      <div className="newipl-extras">
                        CRR: {match.currentRunRate || '0.00'} | RRR: {rrrNew}
                      </div>
                    ) : (
                      <div className="newipl-extras">
                        CRR: {match.currentRunRate || '0.00'} | PROJ: {Math.floor((match.score / (match.totalBalls > 0 ? match.totalBalls/6 : 1)) * match.maxOvers)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })() : active.isIpl2026 ? (() => {
            const bpo = match.ballsPerOver || 6;
            const balls = match.recentBalls || [];
            const legalDeliveries = match.legalBallCount ?? match.totalBalls ?? 0;
            const totalMatchBallsKSP = (match.maxOvers || 5) * 6;
            const remainIPL = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, totalMatchBallsKSP - legalDeliveries);
            const runsNeeded = match.isSecondInnings ? Math.max(0, match.targetScore - match.score) : 0;
            const bannerInfo = {
              title: match.matchTitle || match.bowlingPrefix || "Live Match",
              tournament: match.tournamentName || "Cricket Scoreboard",
            };

            return (
              <div className="ipl26-wrapper anim-ipl2026">
                <div className="ipl26-ticker">
                  <div className="ipl26-ticker-text">
                    {(typeof match.ticker === 'object' ? match.ticker?.message : match.ticker) || bannerInfo.tournament}
                  </div>
                </div>
                
                <div className="ipl26-scoreboard ipl26-glass">
                  <div className="ipl26-glow-line" />
                  <div className="ipl26-glow-line-soft" />
                  
                  <div className="ipl26-team-section">
                    <img src={match.battingLogo} className="ipl26-logo" />
                    <div className="ipl26-team-info">
                      <div className="ipl26-team-name">{match.battingTeam}</div>
                      <div className="ipl26-team-sub">{match.matchTitle || match.bowlingPrefix}</div>
                    </div>
                    <div className="ipl26-score-block">
                      <div className="ipl26-score-glow" />
                      <span className="ipl26-score">{match.score}-{match.wickets}</span>
                      <span className="ipl26-overs">({getOvers(match.legalBallCount ?? match.totalBalls)})</span>
                    </div>
                  </div>
                  
                  <div className="ipl26-divider" />
                  
                  <div className="ipl26-right-area">
                    <div className="ipl26-batsmen">
                      {[match.player1, match.player2].map((p, i) => p?.name ? (
                        <div key={i} className={`ipl26-batsman-row ${!p.onStrike ? 'non-striker' : ''}`}>
                          {p.onStrike ? <div className="ipl26-striker-dot" /> : <div className="ipl26-non-striker-placeholder" />}
                          <div className="ipl26-batsman-name">{p.name}</div>
                          <div className="ipl26-batsman-stats">{p.runs} <span className="ipl26-batsman-balls">({p.balls})</span></div>
                        </div>
                      ) : null)}
                    </div>
                    
                    <div className="ipl26-bowler">
                      <div className="ipl26-bowler-name">{match.bowler?.name || 'BOWLER'}</div>
                      <div className="ipl26-bowler-figures">{match.bowler?.figures || '0-0'}</div>
                      <div className="ipl26-balls-row">
                        {Array.from({ length: Math.max(bpo, balls.length) }).map((_, i) => {
                          const b = balls[i] || '';
                          let cls = 'empty';
                          if (b === '4') cls = 'boundary';
                          else if (b === '6') cls = 'six';
                          else if (b.includes('W')) cls = 'wicket';
                          else if (b && !b.includes('W') && b !== '•') cls = 'single';
                          else if (b.includes('WD') || b.includes('NB') || b.includes('LB') || b.includes('B')) cls = 'extra';
                          return <div key={i} className={`ipl26-ball ${cls}`}>{b === '•' ? '0' : b}</div>;
                        })}
                      </div>
                    </div>
                    
                    {match.isSecondInnings ? (
                      <div className="ipl26-target">
                        <div className="ipl26-target-label">TARGET</div>
                        <div className="ipl26-target-value">{match.targetScore}</div>
                      </div>
                    ) : (
                      <div className="ipl26-this-over">
                        <div className="ipl26-this-over-label">THIS OVER</div>
                        <div className="ipl26-this-over-value">{match.overRuns || 0}</div>
                      </div>
                    )}
                    
                    <div className="ipl26-right-logo-wrap">
                      <img src={match.leagueLogo} className="ipl26-right-logo" />
                    </div>
                  </div>
                </div>
                
                {match.isSecondInnings ? (
                  <div className="ipl26-chase-strip">
                    <div className="ipl26-chase-rates">
                      <span className="ipl26-crr">CRR <span className="ipl26-crr-value">{match.totalBalls > 0 ? (match.score / (match.totalBalls / 6)).toFixed(2) : "0.00"}</span></span>
                      <span className="ipl26-rrr">RRR <span className="ipl26-rrr-value">{remainIPL > 0 ? (runsNeeded / (remainIPL / 6)).toFixed(2) : "--"}</span></span>
                    </div>
                    <div className="ipl26-chase-need">NEED {runsNeeded} RUNS IN {remainIPL} BALLS TO WIN</div>
                  </div>
                ) : (
                  <div className="ipl26-bottom-strip">
                    <span className="ipl26-crr">CURRENT RUN RATE <span className="ipl26-crr-value">{match.totalBalls > 0 ? (match.score / (match.totalBalls / 6)).toFixed(2) : "0.00"}</span></span>
                    <div className="ipl26-welcome">{match.tournamentName || "LIVE"}</div>
                  </div>
                )}
              </div>
            );
          })() : active.isApogee ? (() => {
            const bpo = match.ballsPerOver || 6;
            const balls = match.recentBalls || [];
            const legalDeliveries = match.legalBallCount ?? match.totalBalls ?? 0;
            const totalMatchBallsKSP = (match.maxOvers || 5) * 6;
            const remainApogee = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, totalMatchBallsKSP - legalDeliveries);
            const runsNeeded = match.isSecondInnings ? Math.max(0, match.targetScore - match.score) : 0;

            return (
              <div className="apogee-bar anim-apogee apogee-open">
                <div className="apogee-bar-glow" />
                <div className="apogee-bar-glow-soft" />
                
                <div className="apogee-panel apogee-panel-left">
                  <img src={match.battingLogo} className="apogee-logo" />
                  <div className="apogee-team-block">
                    <div className="apogee-team-name">{match.battingTeam}</div>
                    <div className="apogee-team-sub">{match.matchTitle || "LIVE"} <span className="apogee-live-dot" /></div>
                  </div>
                  <div className="apogee-score-block">
                    <div className="apogee-score">{match.score}-{match.wickets}</div>
                    <div className="apogee-overs-row">
                      <span className="apogee-overs">({getOvers(match.legalBallCount ?? match.totalBalls)})</span>
                    </div>
                  </div>
                </div>
                
                <div className="apogee-panel apogee-panel-batsmen">
                  {[match.player1, match.player2].map((p, i) => p?.name ? (
                    <div key={i} className={`apogee-batsman-row ${!p.onStrike ? 'non-striker' : ''}`}>
                      {p.onStrike ? <div className="apogee-striker-arrow">▶</div> : null}
                      <div className="apogee-batsman-name">{p.name}</div>
                      <div className="apogee-batsman-stats">{p.runs} <span className="apogee-batsman-balls">({p.balls})</span></div>
                    </div>
                  ) : null)}
                </div>
                
                <div className="apogee-panel apogee-panel-bowler">
                  <div className="apogee-bowler-info">
                    <div className="apogee-bowler-name">{match.bowler?.name || 'BOWLER'}</div>
                    <div className="apogee-bowler-figures">{match.bowler?.figures || '0-0'}</div>
                  </div>
                  <div className="apogee-balls-row">
                    {Array.from({ length: Math.max(bpo, balls.length) }).map((_, i) => {
                      const b = balls[i] || '';
                      let cls = 'empty';
                      if (b === '4') cls = 'boundary';
                      else if (b === '6') cls = 'six';
                      else if (b.includes('W')) cls = 'wicket';
                      else if (b && !b.includes('W') && b !== '•') cls = 'single';
                      else if (b.includes('WD') || b.includes('NB') || b.includes('LB') || b.includes('B')) cls = 'extra';
                      return <div key={i} className={`apogee-ball ${cls}`}>{b === '•' ? '0' : b}</div>;
                    })}
                  </div>
                </div>

                {match.isSecondInnings ? (
                  <div className="apogee-panel apogee-panel-target">
                    <div className="apogee-target-label">NEED {runsNeeded} RUNS IN</div>
                    <div className="apogee-target-num">{remainApogee} BALLS</div>
                  </div>
                ) : (
                  <div className="apogee-panel apogee-panel-logo-right">
                    <img src={match.leagueLogo} className="apogee-logo-right" />
                  </div>
                )}
              </div>
            );
          })() : ( <>

          {/* BROADCAST TICKER — sits above the scoreboard bar */}
          <BroadcastTicker matchId={matchId} tickerData={match?.ticker} />
          <div className={`flex h-28 ${active.main} items-stretch relative overflow-hidden ${active.isWC2026 ? `${active.border} wc2026-open` : `border-t-2 ${active.border} scoreboard-open`} shadow-2xl ${boardAnimClass}`}>

            {/* INLINE EVENT BANNER — contained within scoreboard */}
            {showEvent && !active.isNewIpl && !active.isKsPremium && ["FOUR", "SIX", "WICKET"].includes(match.eventTrigger) && (
              <div className={`event-banner event-banner-${match.eventTrigger.toLowerCase()}`}>
                {/* Particles — lightweight, clipped to scoreboard */}
                <div className="event-banner-particles">
                  {particleData.map((p, i) => (
                    <div key={i} className="event-banner-particle" style={{
                      left: p.left,
                      animationDelay: p.animDelay,
                      animationDuration: p.animDuration
                    }} />
                  ))}
                </div>
                {/* Glow effect */}
                <div className="event-banner-glow" />
                {/* Sweep line */}
                <div className="event-banner-sweep" />
                {/* Content — slide-in from right */}
                <div className="event-banner-content">
                  <p className="event-banner-label">
                    {match.eventTrigger === "WICKET" ? "WICKET" : "BOUNDARY"}
                  </p>
                  <h1 className="event-banner-title">
                    {match.eventTrigger === "WICKET"
                      ? <>{match.lastWicketName} <span className="event-banner-stat">{match.lastWicketRuns}({match.lastWicketBalls})</span> OUT!</>
                      : match.eventTrigger === "FOUR" ? "IT'S A FOUR!" : "MASSIVE SIX!"}
                  </h1>
                  <div className="event-banner-accent" />
                </div>
              </div>
            )}

            {/* TEAM & LOGO SECTION */}
            <div className={`flex items-center w-[35%] pl-4 gap-4 ${active.main} ${active.isWC2026 ? 'wc2026-content-reveal' : 'content-reveal'}`}>
              <img src={match.battingLogo} className="h-16 w-16 rounded-full bg-white p-1 object-cover shadow-lg" alt="Team Logo" />
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                    {match.matchType || "T20"} • {match.matchTitle || match.bowlingPrefix}
                  </span>
                  {match.isSuperOver && <span className="bg-red-600 px-1 font-black rounded animate-pulse">SUPER OVER</span>}
                  {match.matchStatus && match.matchStatus !== "Live" && (
                     <span className={`px-2 py-0.5 text-[9px] font-black tracking-widest uppercase rounded shadow shadow-black/50 ${
                       match.matchStatus === 'Break' ? 'bg-blue-600 text-white' :
                       match.matchStatus === 'Innings Break' ? 'bg-amber-500 text-black' :
                       match.matchStatus === 'Rain Delay' ? 'bg-blue-900 text-cyan-300 border border-blue-500' :
                       match.matchStatus === 'Match Ended' ? 'bg-purple-700 text-white' : 'bg-gray-600 text-white'
                     }`}>
                       {match.matchStatus === 'Rain Delay' && "☔ "}{match.matchStatus}
                     </span>
                  )}
                </div>
                <div className="pt-0.5">
                  <h2 style={{ fontFamily: "'Poppins', sans-serif" }} className={`font-semibold text-[28px] leading-tight truncate max-w-[220px] uppercase tracking-wide ${active.main === 'bg-white' ? 'text-slate-900' : 'text-white'} drop-shadow-sm`}>{match.battingTeam}</h2>
                </div>
              </div>
              <div className={`flex items-baseline ml-auto pr-6 text-white text-center ${scoreAnimClass}`}>
                <span className={`${active.text} font-black text-6xl mr-3 tracking-wide text-broadcast-shadow`}>{match.score}-{match.wickets}</span>
                <span className="font-bold text-4xl italic text-broadcast-glow">({getOvers(match.totalBalls)})</span>
              </div>
            </div>

            {/* BATSMEN SECTION — WC2026 gets lightning bolt dividers */}
            {active.isWC2026 && (match.overlayMode || 'full') === 'full' && (
              <div className={`wc2026-strike wc2026-content-reveal ${showEvent && (match.eventTrigger === 'FOUR' || match.eventTrigger === 'SIX') ? 'wc2026-strike-active' : ''}`} />
            )}
            {(match.overlayMode || 'full') === 'full' && match.player1?.name && match.player2?.name && (
              <div className={`w-[30%] ${active.batsman} flex flex-col justify-center px-8 border-x border-black/10 shadow-inner overlay-section-transition ${active.isWC2026 ? '' : 'content-reveal'}`}>
                {[match.player1, match.player2].map((p, i) => (
                  <div key={i} className={`flex justify-between items-center py-0.5 ${i === 0 ? "border-b border-black/10" : "opacity-80"}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-black font-semibold text-xl italic uppercase truncate max-w-[150px] tracking-wide">{p?.name}</span>
                      {p?.onStrike && <PlayIcon className="h-4 w-4 text-black animate-pulse" />}
                    </div>
                    <span className="text-black font-bold text-2xl">{p?.runs}({p?.balls})</span>
                  </div>
                ))}
              </div>
            )}
            {active.isWC2026 && (match.overlayMode || 'full') === 'full' && (
              <div className="wc2026-strike inverse wc2026-content-reveal" />
            )}

            {/* BOWLER & OVER INFO */}
            <div className={`flex-1 ${active.isWC2026 ? `${active.bowler} wc2026-content-reveal` : `bg-gradient-to-r ${active.bowler} content-reveal`} flex items-center px-6 gap-4 ${bowlerAnimClass} ${newOverAnim ? 'over-light-sweep' : ''}`} style={{ position: 'relative' }}>
              <div className="flex-1 flex flex-col justify-center">
                {(match.overlayMode || 'full') === 'full' && match.bowler?.name && (
                  <div className={`flex justify-between items-center mb-1 font-bold italic text-white text-sm overlay-section-transition tracking-wide ${newOverAnim ? 'bowler-highlight' : ''}`}>
                    <span className="uppercase text-broadcast-glow">{match.bowler?.name}</span>
                    <span className="text-broadcast-glow">{match.bowler?.figures}</span>
                  </div>
                )}
                <div className="flex gap-1.5 flex-wrap">
                  {Array.from({ length: Math.max(match.ballsPerOver || 6, (match.recentBalls || []).length) }).map((_, i) => {
                    const ball = (match.recentBalls || [])[i] || "";
                    const isW = ball === "W";
                    const isE = ball.includes("WD") || ball.includes("NB") || ball.includes("B");
                    return <div key={i} className={`min-w-[30px] h-7 px-1 rounded shadow-inner flex items-center justify-center font-black text-[13px] border-b-2 transition-all duration-300 ${ball === "" ? "bg-black/40 border-white/5" : isW ? "bg-white text-black scale-110 shadow-md" : isE ? "bg-yellow-400 text-black border-yellow-600" : "bg-red-500 text-white border-red-700"} ${newOverAnim ? 'ball-dot-reset' : ''}`}>{ball}</div>;
                  })}
                </div>
              </div>

              <div className="flex flex-col items-center justify-center border-l border-white/20 pl-4 py-1">
                <p className="text-[8px] font-bold text-white/50 uppercase tracking-widest">This Over</p>
                <div className="bg-white/10 px-3 rounded-md border border-white/10">
                  <p className="text-3xl font-black text-white text-broadcast-glow">{match.overRuns || 0}</p>
                </div>
              </div>
            </div>

            <div className="w-24 bg-black flex items-center justify-center p-2 border-l border-gray-800">
              <img src={match.leagueLogo} className="h-16 w-16 object-contain" alt="Opponent Logo" />
            </div>
          </div>

          {/* OVER SUMMARY BAR — Promoted Runs Section */}
          {(match.recentBalls || []).length > 0 && (
            <div className="over-summary-bar">
              <span className="over-label">Over {(match.currentOver || 0) + 1}</span>
              <div className="over-divider" />
              <div className="over-balls-track">
                {Array.from({ length: Math.max(match.ballsPerOver || 6, (match.recentBalls || []).length) }).map((_, i) => {
                  const ball = (match.recentBalls || [])[i] || "";
                  const isW = ball === "W";
                  const isFour = ball === "4";
                  const isSix = ball === "6";
                  const isDot = ball === "•" || ball === "0";
                  const isExtra = ball.includes("WD") || ball.includes("NB") || ball.includes("LB") || ball.includes("B");
                  const capsuleClass = `over-ball-capsule${ball ? ' has-value' : ''}${isDot ? ' is-dot' : ''}${isFour ? ' is-boundary' : ''}${isSix ? ' is-six' : ''}${isW ? ' is-wicket' : ''}${isExtra ? ' is-extra' : ''}`;
                  return <div key={i} className={capsuleClass}>{ball || '—'}</div>;
                })}
              </div>
              <div className="over-divider" />
              <div className="over-total">{match.overRuns || 0}</div>
            </div>
          )}

          {/* BOTTOM STRIP (Target / Ticker + CRR / RRR) */}
          <div className="h-9 bg-black border-t border-gray-800 flex items-center overflow-hidden">
            {match.isSecondInnings ? (
              <div className={`flex w-full justify-between items-center ${active.chase} h-full border-t border-blue-400 shadow-inner px-4`}>
                <div className="flex gap-4">
                  <span className="text-white/70 font-bold italic text-[11px] uppercase tracking-wide">CRR: <span className="text-cyan-400">{match.totalBalls > 0 ? (match.score / (match.totalBalls / 6)).toFixed(2) : "0.00"}</span></span>
                  <span className="text-white/70 font-bold italic text-[11px] uppercase tracking-wide">RRR: <span className="text-orange-400">{remainingBalls > 0 ? ((match.targetScore - match.score) / (remainingBalls / 6)).toFixed(2) : "--"}</span></span>
                </div>
                <p className="text-white font-bold italic text-sm uppercase tracking-widest animate-pulse text-broadcast-shadow">
                  {match.targetScore - match.score > 0 ? `Need ${match.targetScore - match.score} Runs from ${remainingBalls} Balls` : "TARGET REACHED!"}
                </p>
              </div>
            ) : (
              <div className="flex w-full justify-between items-center h-full px-4">
                <span className="text-white/70 font-bold italic text-[11px] uppercase tracking-wide">CRR: <span className="text-cyan-400">{match.totalBalls > 0 ? (match.score / (match.totalBalls / 6)).toFixed(2) : "0.00"}</span></span>
                <p className="text-white font-semibold italic text-[11px] uppercase tracking-[0.4em] truncate text-center flex-1 mx-4">{(typeof match.ticker === 'object' ? match.ticker?.message : match.ticker)}</p>
                <span className="text-white/50 font-bold italic text-[11px] uppercase tracking-wide">RRR: --</span>
              </div>
            )}
          </div>
        </> )}
        </div>
      )}
    </div>
  );
};

export default ScorecardDisplay;
