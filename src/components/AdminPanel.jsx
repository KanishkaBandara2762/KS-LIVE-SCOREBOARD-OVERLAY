import React, { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { ref, set, onValue, update } from "firebase/database";

const AdminPanel = () => {
  const initialState = {
    battingTeam: "TEAM NAME",
    bowlingTeam: "OPPONENT NAME",
    bowlingPrefix: "MATCH INFO",
    battingLogo: "https://via.placeholder.com/150/white/black?text=LOGO+A",
    leagueLogo: "https://via.placeholder.com/150/yellow/black?text=LOGO+B",
    score: 0,
    wickets: 0,
    totalBalls: 0,
    maxOvers: 5,
    ballsPerOver: 5,
    player1: { name: "SELECT P1", runs: 0, balls: 0, onStrike: true },
    player2: { name: "SELECT P2", runs: 0, balls: 0, onStrike: false },
    bowler: { name: "SELECT BOWLER", figures: "0-0 (0.0)" },
    recentBalls: [],
    overRuns: 0,
    fallOfWickets: [],
    battingSquad: [],
    bowlingSquad: [],
    ticker: "WELCOME TO THE KS LIVE BROADCAST",
    showVersus: false,
    showSummary: false,
    themeID: "IPL_GOLD",
    eventTrigger: null,
    eventTime: null,
    isSecondInnings: false,
    targetScore: 0,
    isSuperOver: false,
    lastWicketName: "",
    lastWicketRuns: 0,
    lastWicketBalls: 0,
    showMatchSituation: false,
    overlayMode: "full",
    // ── Over completion fields ──
    legalBallCount: 0,
    currentOver: 0,
    overLocked: false
  };

  const [match, setMatch] = useState(() => {
    const saved = localStorage.getItem("ks_master_record");
    return saved ? JSON.parse(saved) : initialState;
  });

  const [history, setHistory] = useState([]);
  const [customExtraType, setCustomExtraType] = useState("WD");
  const [customExtraRuns, setCustomExtraRuns] = useState(0);
  const [overCooldown, setOverCooldown] = useState(false);
  const isFromFirebase = useRef(false);

  // ── Broadcast Ticker State (separate from match) ──────────────────────
  const [tickerMsg, setTickerMsg] = useState("");
  const [tickerMode, setTickerMode] = useState("banner");    // "banner" or "breaking"
  const [tickerPreset, setTickerPreset] = useState("final");  // "final", "semi", "custom"
  const [tickerVisible, setTickerVisible] = useState(false);

  // Sync ticker state from Firebase on load
  useEffect(() => {
    const tickerRef = ref(db, "overlay_ticker");
    const unsub = onValue(tickerRef, (snap) => {
      const data = snap.val();
      if (data) {
        setTickerMsg(data.message || "");
        setTickerMode(data.mode || "banner");
        setTickerPreset(data.preset || "final");
        setTickerVisible(!!data.visible);
      }
    });
    return () => unsub();
  }, []);

  // Push ticker changes to Firebase (lightweight — only overlay_ticker node)
  const pushTicker = (overrides = {}) => {
    const payload = {
      message: overrides.message ?? tickerMsg,
      mode: overrides.mode ?? tickerMode,
      preset: overrides.preset ?? tickerPreset,
      visible: overrides.visible ?? tickerVisible,
    };
    update(ref(db, "overlay_ticker"), payload);
  };

  // --- SYNC TEAM MANAGER SQUADS & AUTO-SELECT NEW PLAYERS ---
  useEffect(() => {
    const squadRef = ref(db, 'live_match');
    const unsubscribe = onValue(squadRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        isFromFirebase.current = true;
        setMatch(prev => {
          const newBattingSquad = data.battingSquad || [];
          const newBowlingSquad = data.bowlingSquad || [];

          let p1 = prev.player1;
          let p2 = prev.player2;
          let currentBowler = prev.bowler;

          if ((p1.name === "SELECT P1" || p1.name === "NEW PLAYER") && newBattingSquad.length > 0) {
            p1 = { ...p1, name: newBattingSquad[0].name };
          }
          if ((p2.name === "SELECT P2" || p2.name === "NEW PLAYER") && newBattingSquad.length > 1) {
            p2 = { ...p2, name: newBattingSquad[1].name };
          }
          if ((currentBowler.name === "SELECT BOWLER") && newBowlingSquad.length > 0) {
            currentBowler = { ...currentBowler, name: newBowlingSquad[0].name };
          }

          return {
            ...prev,
            battingSquad: newBattingSquad,
            bowlingSquad: newBowlingSquad,
            battingTeam: data.battingTeam || prev.battingTeam,
            bowlingTeam: data.bowlingTeam || prev.bowlingTeam,
            battingLogo: data.battingLogo || prev.battingLogo,
            leagueLogo: data.leagueLogo || prev.leagueLogo,
            player1: p1,
            player2: p2,
            bowler: currentBowler
          };
        });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isFromFirebase.current) {
      isFromFirebase.current = false;
      localStorage.setItem("ks_master_record", JSON.stringify(match));
      return; // Don't write back to Firebase when the change came from Firebase
    }
    set(ref(db, 'live_match'), match);
    localStorage.setItem("ks_master_record", JSON.stringify(match));
  }, [match]);

  const handleLogoUpload = (e, team) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMatch(prev => ({
          ...prev,
          [team === 'A' ? 'battingLogo' : 'leagueLogo']: reader.result
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const key = e.key.toLowerCase();
      if (['0', '1', '2', '3', '4', '6'].includes(key)) addRun(parseInt(key));
      if (key === 'w') handleWicket();
      if (key === 's') swapStrike();
      if (key === 'u') handleUndo();
      if (key === 'm') toggleSummary();
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [match, history]);

  const totalMatchBalls = (match.maxOvers || 5) * (match.ballsPerOver || 5);
  const remainingBalls = totalMatchBalls - match.totalBalls;

  const swapStrike = () => {
    setMatch(prev => ({
      ...prev,
      player1: { ...prev.player1, onStrike: !prev.player1.onStrike },
      player2: { ...prev.player2, onStrike: !prev.player2.onStrike }
    }));
  };

  const toggleSummary = () => setMatch(prev => ({ ...prev, showSummary: !prev.showSummary }));

  const updateOverHistory = (entry, currentMatch, runsToAdd) => {
    let newRecent = [...currentMatch.recentBalls, entry];
    let newOverRuns = currentMatch.overRuns + runsToAdd;
    return { recentBalls: newRecent, overRuns: newOverRuns };
  };

  const handleNewMatch = () => {
    if (window.confirm("Start New Match?")) {
      setMatch({ ...initialState, battingTeam: match.battingTeam, bowlingTeam: match.bowlingTeam, battingLogo: match.battingLogo, leagueLogo: match.leagueLogo, legalBallCount: 0, currentOver: 0, overLocked: false });
      setHistory([]);
    }
  };

  const handleNewInnings = () => {
    if (window.confirm("Switch Innings?")) {
      setMatch(prev => ({
        ...prev,
        battingTeam: prev.bowlingTeam, bowlingTeam: prev.battingTeam, battingLogo: prev.leagueLogo, leagueLogo: prev.battingLogo,
        score: 0, wickets: 0, totalBalls: 0, recentBalls: [], overRuns: 0, fallOfWickets: [], showSummary: false,
        player1: { name: "SELECT P1", runs: 0, balls: 0, onStrike: true },
        player2: { name: "SELECT P2", runs: 0, balls: 0, onStrike: false },
        bowler: { name: "SELECT BOWLER", figures: "0-0 (0.0)" },
        isSecondInnings: true, targetScore: prev.score + 1, isSuperOver: false, eventTrigger: "RESET_WINNER",
        legalBallCount: 0, currentOver: 0, overLocked: false
      }));
      setHistory([]);
    }
  };

  const handleSuperOver = () => {
    if (window.confirm("Activate Super Over Mode?")) {
      setMatch(prev => ({
        ...prev, score: 0, wickets: 0, totalBalls: 0, maxOvers: 1, isSuperOver: true,
        recentBalls: [], overRuns: 0, ticker: "SUPER OVER - TIE BREAKER",
        player1: { name: "SELECT P1", runs: 0, balls: 0, onStrike: true },
        player2: { name: "SELECT P2", runs: 0, balls: 0, onStrike: false }
      }));
      setHistory([]);
    }
  };

  const addRun = (runs) => {
    if (match.overLocked) return;
    setHistory([...history, match]);
    const active = match.player1.onStrike ? "player1" : "player2";
    const { recentBalls, overRuns } = updateOverHistory(runs === 0 ? "•" : runs.toString(), match, runs);
    setMatch(prev => ({
      ...prev, score: prev.score + runs, totalBalls: prev.totalBalls + 1,
      [active]: { ...prev[active], runs: prev[active].runs + runs, balls: prev[active].balls + 1 },
      recentBalls, overRuns, eventTrigger: runs >= 4 ? (runs === 6 ? "SIX" : "FOUR") : null, eventTime: Date.now(),
      legalBallCount: (prev.legalBallCount || 0) + 1
    }));
  };

  const addExtra = (type, runs = 0) => {
    if (match.overLocked) return;
    setHistory([...history, match]);
    const totalExtraRuns = 1 + runs;
    const entry = runs > 0 ? `${type}+${runs}` : type;
    const { recentBalls, overRuns } = updateOverHistory(entry, match, totalExtraRuns);
    const active = match.player1.onStrike ? "player1" : "player2";
    const batsmanUpdate = type === "NB" ? { [active]: { ...match[active], runs: match[active].runs + runs, balls: match[active].balls + 1 } } : {};
    setMatch(prev => ({ ...prev, score: prev.score + totalExtraRuns, recentBalls, overRuns, ...batsmanUpdate, eventTime: Date.now() }));
  };

  const addLegBye = (runs) => {
    if (match.overLocked) return;
    setHistory([...history, match]);
    const active = match.player1.onStrike ? "player1" : "player2";
    const entry = `LB${runs}`;
    const { recentBalls, overRuns } = updateOverHistory(entry, match, runs);
    setMatch(prev => ({
      ...prev,
      score: prev.score + runs,
      totalBalls: prev.totalBalls + 1,
      [active]: { ...prev[active], balls: prev[active].balls + 1 },
      recentBalls, overRuns, eventTime: Date.now(),
      legalBallCount: (prev.legalBallCount || 0) + 1
    }));
  };

  const handleWicket = () => {
    if (match.overLocked) return;
    setHistory([...history, match]);
    const outKey = match.player1.onStrike ? "player1" : "player2";
    const outPlayer = match[outKey];
    const { recentBalls, overRuns } = updateOverHistory("W", match, 0);
    const fow = { name: outPlayer.name, runs: outPlayer.runs, balls: outPlayer.balls, bowler: match.bowler.name, fowScore: match.score, fowWicket: match.wickets + 1 };
    setMatch(prev => ({
      ...prev, wickets: prev.wickets + 1, totalBalls: prev.totalBalls + 1, recentBalls, overRuns,
      fallOfWickets: [...prev.fallOfWickets, fow], eventTrigger: "WICKET",
      lastWicketName: outPlayer.name, lastWicketRuns: outPlayer.runs, lastWicketBalls: outPlayer.balls,
      [outKey]: { name: "NEW PLAYER", runs: 0, balls: 0, onStrike: true }, eventTime: Date.now(),
      legalBallCount: (prev.legalBallCount || 0) + 1
    }));
  };

  const handleUndo = () => { if (history.length > 0) { setMatch(history[history.length - 1]); setHistory(prev => prev.slice(0, -1)); } };

  // ── OVER COMPLETED — manual over lock + reset ────────────────
  const handleOverCompleted = () => {
    const lbc = match.legalBallCount || 0;
    if (lbc < match.ballsPerOver || overCooldown) return;
    setOverCooldown(true);
    setTimeout(() => setOverCooldown(false), 1000);
    setHistory([...history, match]);
    setMatch(prev => ({
      ...prev,
      recentBalls: [],
      overRuns: 0,
      legalBallCount: 0,
      currentOver: (prev.currentOver || 0) + 1,
      overLocked: false,
      eventTrigger: "NEW_OVER",
      eventTime: Date.now(),
      // Swap strike at end of over
      player1: { ...prev.player1, onStrike: !prev.player1.onStrike },
      player2: { ...prev.player2, onStrike: !prev.player2.onStrike }
    }));
  };

  const legalBallCount = match.legalBallCount || 0;
  const isOverReady = legalBallCount >= match.ballsPerOver;

  return (
    <div className="p-8 bg-slate-100 min-h-screen font-sans text-slate-800 uppercase">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-2xl overflow-hidden border border-slate-200">

        {/* HEADER NAVIGATION */}
        <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="font-bold tracking-tighter text-yellow-400 text-xl italic">KS MASTER ADMIN</h1>
            <div className="flex gap-2 ml-4">
              <button onClick={() => window.open('/', '_blank')} className="text-[10px] bg-white/10 px-3 py-1 rounded hover:bg-white/20 font-black border border-white/10 text-white">Scorecard ↗</button>
              <button onClick={() => window.open('/teams', '_blank')} className="text-[10px] bg-blue-600 px-3 py-1 rounded hover:bg-blue-500 font-black text-white">Team Manager ↗</button>
              <button onClick={() => window.open('/mini-admin', 'KS_Mini_Admin', 'width=480,height=850,resizable=yes,scrollbars=yes')} className="text-[10px] bg-yellow-500 px-3 py-1 rounded hover:bg-yellow-400 font-black text-black">Mini ⚡</button>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleNewMatch} className="bg-blue-600 px-3 py-1 rounded text-[10px] font-black shadow-lg">Match</button>
            <button onClick={handleNewInnings} className="bg-orange-500 px-3 py-1 rounded text-[10px] font-black shadow-lg">Innings</button>
            <button onClick={handleSuperOver} className="bg-red-500 px-3 py-1 rounded text-[10px] font-black shadow-lg">Super Over</button>
            <button onClick={handleUndo} className="bg-white/10 px-4 py-1 rounded text-xs font-bold border border-white/20">Undo (U)</button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* COLUMN 1: CONFIG & LOGOS */}
          <div className="space-y-4 border-r pr-4 text-center">
            <h2 className="font-bold text-blue-600 border-b pb-1 uppercase text-xs tracking-widest">1. Setup & Logos</h2>
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded">
              <div><label className="text-[8px] font-bold">OVERS</label><input type="number" className="w-full border p-2 rounded text-center" value={match.maxOvers} onChange={(e) => setMatch({ ...match, maxOvers: parseInt(e.target.value) })} /></div>
              <div><label className="text-[8px] font-bold">BPO</label><input type="number" className="w-full border p-2 rounded text-center" value={match.ballsPerOver} onChange={(e) => setMatch({ ...match, ballsPerOver: parseInt(e.target.value) })} /></div>
            </div>

            <select className="w-full border p-2 rounded text-xs font-black bg-white uppercase shadow-sm" value={match.themeID} onChange={(e) => setMatch({ ...match, themeID: e.target.value })}>
              <option value="IPL_GOLD">IPL Classic</option><option value="SKY_PRO">Sky Sports</option><option value="NEON_VAVUNIYA">Neon Green</option>
              <option value="CLASSIC_DARK">Classic Dark</option><option value="T20_NEON">T20 Neon</option><option value="WC_BLUE_PURPLE">World Cup Blue-Purple</option><option value="GOLD_CHAMPIONSHIP">Gold Championship</option>
              <option value="WC2026">🏆 T20 World Cup 2026</option>
              <option value="KS_SPECIAL">☆ KS SPECIAL</option>
              <option value="SL_BROADCAST">📺 SL Broadcast</option>
            </select>

            <div className={`p-3 rounded border transition ${match.isSecondInnings ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Target Chase</h3>
                <input type="checkbox" checked={match.isSecondInnings} onChange={(e) => setMatch({ ...match, isSecondInnings: e.target.checked })} />
              </div>
              <input type="number" className="w-full border p-2 rounded text-sm font-black text-blue-700 text-center" value={match.targetScore} onChange={(e) => setMatch({ ...match, targetScore: parseInt(e.target.value) || 0 })} placeholder="Set Target" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMatch({ ...match, showVersus: !match.showVersus })} className={`py-2 rounded font-bold text-[10px] ${match.showVersus ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}>Versus Tab</button>
              <button onClick={toggleSummary} className={`py-2 rounded font-bold text-[10px] ${match.showSummary ? 'bg-green-600 text-white' : 'bg-slate-200'}`}>Summary (M)</button>
            </div>
            <button onClick={() => setMatch({ ...match, showMatchSituation: !match.showMatchSituation })} className={`w-full py-2 rounded font-bold text-[10px] transition ${match.showMatchSituation ? 'bg-purple-600 text-white shadow-lg' : 'bg-slate-200'}`}>Show Match Situation</button>
            <button onClick={() => setMatch({ ...match, overlayMode: match.overlayMode === 'full' ? 'simple' : 'full' })} className={`w-full py-2 rounded font-bold text-[10px] transition ${match.overlayMode === 'simple' ? 'bg-teal-600 text-white shadow-lg' : 'bg-slate-200'}`}>Switch Overlay: {match.overlayMode === 'full' ? 'FULL' : 'SIMPLE'}</button>

            {/* ── BROADCAST TICKER CONTROLS ──────────────────────── */}
            <div className="space-y-2 pt-3 border-t mt-2">
              <h3 className="text-[9px] font-black text-slate-400 tracking-widest uppercase">📺 Broadcast Ticker</h3>
              <input
                type="text"
                className="w-full border p-2 rounded text-xs font-bold bg-slate-50 uppercase"
                placeholder="SEMI FINAL — MATCH 2"
                value={tickerMsg}
                onChange={(e) => setTickerMsg(e.target.value.toUpperCase())}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="border rounded text-[10px] p-1.5 font-black bg-white uppercase"
                  value={tickerMode}
                  onChange={(e) => { setTickerMode(e.target.value); pushTicker({ mode: e.target.value }); }}
                >
                  <option value="banner">🏆 Tournament</option>
                  <option value="breaking">🔴 Breaking News</option>
                </select>
                <select
                  className="border rounded text-[10px] p-1.5 font-black bg-white uppercase"
                  value={tickerPreset}
                  onChange={(e) => { setTickerPreset(e.target.value); pushTicker({ preset: e.target.value }); }}
                >
                  <option value="final">🥇 Final (Gold)</option>
                  <option value="semi">🔵 Semi Final (Blue)</option>
                  <option value="custom">🟢 Custom (Teal)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => pushTicker({ message: tickerMsg })}
                  className="bg-slate-700 text-white py-2 rounded text-[10px] font-black hover:bg-slate-800 transition"
                >
                  💾 Save Message
                </button>
                <button
                  onClick={() => { const newVis = !tickerVisible; setTickerVisible(newVis); pushTicker({ visible: newVis }); }}
                  className={`py-2 rounded text-[10px] font-black transition ${tickerVisible
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                >
                  {tickerVisible ? '🔴 HIDE TICKER' : '🟢 SHOW TICKER'}
                </button>
              </div>
            </div>

            {/* TEAM LOGO ATTACHMENTS */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center gap-2">
                <img src={match.battingLogo} className="w-10 h-10 rounded border bg-white object-contain" alt="A" />
                <input type="file" className="text-[8px] w-full" onChange={(e) => handleLogoUpload(e, 'A')} />
              </div>
              <input className="w-full border p-2 rounded font-bold bg-blue-50 text-sm" value={match.battingTeam} onChange={(e) => setMatch({ ...match, battingTeam: e.target.value.toUpperCase() })} />

              <div className="flex items-center gap-2 pt-2">
                <img src={match.leagueLogo} className="w-10 h-10 rounded border bg-white object-contain" alt="B" />
                <input type="file" className="text-[8px] w-full" onChange={(e) => handleLogoUpload(e, 'B')} />
              </div>
              <input className="w-full border p-2 rounded font-bold bg-red-50 text-sm" value={match.bowlingTeam} onChange={(e) => setMatch({ ...match, bowlingTeam: e.target.value.toUpperCase() })} />
            </div>
          </div>

          {/* COLUMN 2: ACTIVE SQUAD */}
          <div className="space-y-4 border-r pr-4">
            <h2 className="font-bold text-blue-600 border-b pb-1 uppercase text-xs tracking-widest">2. Active Squad</h2>
            <div className="bg-slate-50 p-2 rounded border border-blue-100">
              <label className="text-[8px] font-black text-slate-400 uppercase">Striker</label>
              <select className="w-full bg-white border p-2 rounded font-black text-sm" value={match.player1.name} onChange={(e) => setMatch({ ...match, player1: { ...match.player1, name: e.target.value } })}>
                <option value="">-- SELECT PLAYER --</option>
                {match.battingSquad?.map((p, i) => <option key={i} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div className="bg-slate-50 p-2 rounded border border-blue-100">
              <label className="text-[8px] font-black text-slate-400 uppercase">Non-Striker</label>
              <select className="w-full bg-white border p-2 rounded font-black text-sm" value={match.player2.name} onChange={(e) => setMatch({ ...match, player2: { ...match.player2, name: e.target.value } })}>
                <option value="">-- SELECT PLAYER --</option>
                {match.battingSquad?.map((p, i) => <option key={i} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <button onClick={swapStrike} className="w-full py-2 bg-yellow-400 font-black text-xs rounded shadow-md border-b-4 border-yellow-600 active:translate-y-1 text-black">Swap Strike (S)</button>
            <div className="pt-4 border-t">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 text-center">Active Bowler</label>
              <select className="w-full border p-2 rounded font-black text-sm bg-slate-50 border-red-200 shadow-inner text-red-600" value={match.bowler.name} onChange={(e) => setMatch({ ...match, bowler: { ...match.bowler, name: e.target.value } })}>
                <option value="">-- SELECT BOWLER --</option>
                {match.bowlingSquad?.map((p, i) => <option key={i} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* COLUMN 3: SCORING */}
          <div className="space-y-4">
            <h2 className="font-bold text-blue-600 border-b pb-1 uppercase text-xs tracking-widest">3. Scoring</h2>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2, 3, 4, 6].map((r) => <button key={r} onClick={() => addRun(r)} className="bg-slate-800 text-white py-3 rounded font-black hover:bg-black transition text-xl shadow-md border-b-4 border-slate-950">+{r}</button>)}
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-200 text-center">
              <p className="text-[9px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Extras Engine</p>
              <div className="flex gap-2 mb-3">
                <select className="bg-white border rounded text-[10px] p-1 font-black" value={customExtraType} onChange={(e) => setCustomExtraType(e.target.value)}>
                  <option value="WD">WIDE</option><option value="NB">NO BALL</option>
                </select>
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map(num => (
                    <button key={num} onClick={() => setCustomExtraRuns(num)} className={`px-2 py-1 border rounded text-[10px] font-black transition ${customExtraRuns === num ? 'bg-blue-600 text-white' : 'bg-white'}`}>{num}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => addExtra(customExtraType, customExtraRuns)} className="w-full bg-orange-500 text-white py-2 rounded font-black text-[10px] uppercase shadow-md border-b-4 border-orange-700 active:translate-y-0.5">Add {customExtraType} + {customExtraRuns}</button>
            </div>
            <div className="p-3 bg-green-50 rounded border border-green-200 text-center">
              <p className="text-[9px] font-bold text-green-700 uppercase mb-2 tracking-widest">Leg Byes</p>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((r) => (
                  <button key={r} onClick={() => addLegBye(r)} className="bg-green-600 text-white py-2 rounded font-black text-xs shadow-md border-b-4 border-green-800 active:translate-y-0.5 hover:bg-green-700 transition">LB +{r}</button>
                ))}
              </div>
            </div>
            <button onClick={handleWicket} className="w-full bg-red-600 text-white py-3 rounded font-black shadow-md border-b-4 border-red-800 active:translate-y-1 text-lg uppercase">WKT (W)</button>

            <div className="bg-slate-900 p-4 rounded shadow-2xl border-t-4 border-yellow-400 text-white italic">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[8px] uppercase font-black tracking-widest text-slate-400">THIS OVER</p>
                  <p className="text-xl font-black text-yellow-400">{match.overRuns} Runs</p>
                </div>
                <div className="text-right">
                  <h3 className="text-4xl font-black">{match.score}-{match.wickets}</h3>
                  <p className="text-[10px] font-black uppercase text-slate-400">OVERS: {Math.floor(match.totalBalls / match.ballsPerOver)}.{match.totalBalls % match.ballsPerOver}</p>
                </div>
              </div>
              {match.isSecondInnings && (
                <div className="mt-3 p-2 bg-blue-600 rounded text-white font-black text-xs uppercase animate-pulse text-center">
                  Need {match.targetScore - match.score} in {remainingBalls} Balls
                </div>
              )}
              {match.totalBalls > 0 && isOverReady && (
                <div className="mt-3 p-2 bg-amber-500 rounded text-black font-black text-xs uppercase text-center animate-pulse border border-amber-300 shadow-lg">
                  ⚠ OVER COMPLETE ({legalBallCount}/{match.ballsPerOver}) — Click OVER COMPLETED below!
                </div>
              )}
              {/* OVER COMPLETED BUTTON */}
              <button
                onClick={handleOverCompleted}
                disabled={!isOverReady || overCooldown}
                className={`mt-3 w-full py-3 rounded font-black text-sm uppercase shadow-lg border-b-4 active:translate-y-0.5 transition-all ${isOverReady && !overCooldown
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-black border-amber-600 hover:from-amber-500 hover:to-yellow-600 cursor-pointer'
                  : 'bg-slate-700 text-slate-400 border-slate-800 cursor-not-allowed opacity-60'
                  }`}
              >
                {overCooldown ? '✔ OVER LOCKED' : isOverReady ? `⚡ OVER COMPLETED (${legalBallCount}/${match.ballsPerOver})` : `⏳ ${legalBallCount}/${match.ballsPerOver} BALLS`}
              </button>
            </div>

            {/* CRR & RRR DISPLAY */}
            <div className="bg-slate-800 p-3 rounded shadow-lg border border-slate-700 text-white">
              <div className="flex justify-between items-center">
                <div className="text-center flex-1">
                  <p className="text-[8px] uppercase font-black tracking-widest text-slate-400">CRR</p>
                  <p className="text-xl font-black text-cyan-400">
                    {match.totalBalls > 0 ? (match.score / (match.totalBalls / match.ballsPerOver)).toFixed(2) : "0.00"}
                  </p>
                </div>
                <div className="w-px h-10 bg-slate-600"></div>
                <div className="text-center flex-1">
                  <p className="text-[8px] uppercase font-black tracking-widest text-slate-400">RRR</p>
                  <p className="text-xl font-black text-orange-400">
                    {match.isSecondInnings && remainingBalls > 0
                      ? ((match.targetScore - match.score) / (remainingBalls / match.ballsPerOver)).toFixed(2)
                      : "--"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;