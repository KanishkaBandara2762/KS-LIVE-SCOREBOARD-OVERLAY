import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { db } from "../firebase";
import { ref, onValue } from "firebase/database";
import { PlayIcon } from "@heroicons/react/24/solid";
import BroadcastTicker from "./BroadcastTicker";
import "./BroadcastScreens.css";

const ScorecardDisplay = () => {
  const [match, setMatch] = useState(null);
  const [showEvent, setShowEvent] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState(null);

  // ── Animation state ───────────────────────────────────────────
  const [scoreAnimClass, setScoreAnimClass] = useState("");
  const [boardAnimClass, setBoardAnimClass] = useState("");
  const [bowlerAnimClass, setBowlerAnimClass] = useState("");
  const [newOverAnim, setNewOverAnim] = useState(false);
  const prevScore = useRef(null);
  const prevWickets = useRef(null);
  const prevEventTime = useRef(null);
  const prevBannerEventTime = useRef(null);
  const eventTimerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const prevCurrentOver = useRef(null);

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
    SL_BROADCAST: { main: "theme-sl-broadcast", accent: "theme-sl-broadcast-accent", text: "theme-sl-broadcast-score", batsman: "theme-sl-broadcast-bat", bowler: "theme-sl-broadcast-bowler", border: "theme-sl-broadcast-border", chase: "theme-sl-broadcast-chase", animClass: "anim-sl-broadcast" }
  }), []);

  // ── Reusable animation trigger helper ──────────────────────────
  const triggerAnim = useCallback((setter, className, duration = 1000) => {
    setter(className);
    const t = setTimeout(() => setter(""), duration);
    return t;
  }, []);

  // ── Debounced Firebase listener (reduces bandwidth + re-renders) ────
  useEffect(() => {
    const unsubscribe = onValue(ref(db, 'live_match'), (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // Debounce: only process the latest snapshot after 150ms of quiet
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        setMatch(data);
        if (data.eventTrigger === "RESET_WINNER") {
          setWinnerInfo(null);
        }
        if (["FOUR", "SIX", "WICKET"].includes(data.eventTrigger)
            && data.eventTime && data.eventTime !== prevBannerEventTime.current) {
          prevBannerEventTime.current = data.eventTime;
          // Clear previous event timer to prevent orphaned timeouts
          if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
          setShowEvent(true);
          eventTimerRef.current = setTimeout(() => setShowEvent(false), 2500);
        }
      }, 150);
    });
    return () => {
      unsubscribe();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
    };
  }, []);

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

  useEffect(() => {
    if (!match) return;
    if (match.isSecondInnings && !match.isSuperOver) {
      const totalBalls = (match.maxOvers || 5) * (match.ballsPerOver || 6);
      const remainingBalls = totalBalls - match.totalBalls;
      if (match.score >= (match.targetScore || 0)) {
        setWinnerInfo({ team: match.battingTeam, logo: match.battingLogo, text: `WON BY ${10 - match.wickets} WICKETS` });
      } else if (remainingBalls <= 0 || match.wickets >= 10) {
        const resultText = match.score === (match.targetScore - 1) ? "MATCH TIED" : `WON BY ${match.targetScore - 1 - match.score} RUNS`;
        setWinnerInfo({ team: match.bowlingTeam, logo: match.leagueLogo, text: resultText });
      }
    } else { setWinnerInfo(null); }
  }, [match]);

  // ── Memoized helpers (MUST be above early return — Rules of Hooks) ──
  const getOvers = useCallback((balls) => { const bpo = match?.ballsPerOver || 6; return `${Math.floor(balls / bpo)}.${balls % bpo}`; }, [match?.ballsPerOver]);

  if (!match) return <div className="fixed inset-0 bg-black flex items-center justify-center text-white font-black italic uppercase tracking-widest">Connecting to KS Live...</div>;

  const active = themes[match.themeID] || themes.IPL_GOLD;
  const animThemeClass = active.animClass || "anim-ipl-gold";
  const totalMatchBalls = (match.maxOvers || 5) * (match.ballsPerOver || 6);
  const remainingBalls = totalMatchBalls - match.totalBalls;

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

      {/* 3. MATCH WINNER OVERLAY */}
      {winnerInfo && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 animate-fadeIn text-center">
          <img src={winnerInfo.logo} className="w-40 h-40 rounded-full border-4 border-yellow-500 bg-white mb-6 p-2 shadow-2xl" alt="Winner" />
          <h1 className="text-6xl font-black italic uppercase text-yellow-400 drop-shadow-2xl">{winnerInfo.team}</h1>
          <div className="mt-6 bg-yellow-500 text-black text-4xl font-black px-12 py-3 skew-x-[-15deg]">{winnerInfo.text}</div>
        </div>
      )}

      {/* 4. SUMMARY SCREEN — Broadcast Animated */}
      {match.showSummary && !winnerInfo && !match.showVersus && (() => {
        const stage = match.bowlingPrefix?.toLowerCase().includes('final') ? 'final' : match.bowlingPrefix?.toLowerCase().includes('semi') ? 'semi' : 'league';
        return (
          <div className={`summary-screen summary-stage-${stage}`}>
            <div className="summary-card">
              {/* Header */}
              <div className="summary-header">
                <div className="summary-team-info">
                  <img src={match.battingLogo} className="summary-team-logo" alt="Logo" />
                  <div>
                    <h1 className="summary-team-name">{match.battingTeam}</h1>
                    <p className="summary-label">Match Summary</p>
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
                need <span className="text-white text-4xl mx-1">{match.targetScore - match.score}</span> runs in <span className="text-white text-4xl mx-1">{((match.maxOvers || 5) * (match.ballsPerOver || 6)) - match.totalBalls}</span> balls
              </p>
              <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest mt-4">to win</p>
            </div>
          </div>
        </div>
      )}

      {/* 6. MAIN BOTTOM SCOREBOARD */}
      {!winnerInfo && !match.showSummary && !match.showVersus && (
        <div className={`absolute bottom-0 left-0 w-full flex flex-col pointer-events-none ${animThemeClass}`}>
          {/* BROADCAST TICKER — sits above the scoreboard bar */}
          <BroadcastTicker />
          <div className={`flex h-28 ${active.main} items-stretch relative overflow-hidden ${active.isWC2026 ? `${active.border} wc2026-open` : `border-t-2 ${active.border} scoreboard-open`} shadow-2xl ${boardAnimClass}`}>

            {/* INLINE EVENT BANNER — contained within scoreboard */}
            {showEvent && ["FOUR", "SIX", "WICKET"].includes(match.eventTrigger) && (
              <div className={`event-banner event-banner-${match.eventTrigger.toLowerCase()}`}>
                {/* Particles — lightweight, clipped to scoreboard */}
                <div className="event-banner-particles">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="event-banner-particle" style={{
                      left: `${10 + Math.random() * 80}%`,
                      animationDelay: `${Math.random() * 0.6}s`,
                      animationDuration: `${1.2 + Math.random() * 1}s`
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
                <div className={`${active.accent} -skew-x-12 px-5 py-1.5 shadow-lg`}>
                  <h2 className="text-black font-semibold text-2xl skew-x-12 truncate max-w-[180px] uppercase tracking-wide text-broadcast-shadow">{match.battingTeam}</h2>
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
                  <span className="text-white/70 font-bold italic text-[11px] uppercase tracking-wide">CRR: <span className="text-cyan-400">{match.totalBalls > 0 ? (match.score / (match.totalBalls / (match.ballsPerOver || 6))).toFixed(2) : "0.00"}</span></span>
                  <span className="text-white/70 font-bold italic text-[11px] uppercase tracking-wide">RRR: <span className="text-orange-400">{remainingBalls > 0 ? ((match.targetScore - match.score) / (remainingBalls / (match.ballsPerOver || 6))).toFixed(2) : "--"}</span></span>
                </div>
                <p className="text-white font-bold italic text-sm uppercase tracking-widest animate-pulse text-broadcast-shadow">
                  {match.targetScore - match.score > 0 ? `Need ${match.targetScore - match.score} Runs from ${remainingBalls} Balls` : "TARGET REACHED!"}
                </p>
              </div>
            ) : (
              <div className="flex w-full justify-between items-center h-full px-4">
                <span className="text-white/70 font-bold italic text-[11px] uppercase tracking-wide">CRR: <span className="text-cyan-400">{match.totalBalls > 0 ? (match.score / (match.totalBalls / (match.ballsPerOver || 6))).toFixed(2) : "0.00"}</span></span>
                <p className="text-white font-semibold italic text-[11px] uppercase tracking-[0.4em] truncate text-center flex-1 mx-4">{match.ticker}</p>
                <span className="text-white/50 font-bold italic text-[11px] uppercase tracking-wide">RRR: --</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScorecardDisplay;