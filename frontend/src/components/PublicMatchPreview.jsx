import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { matchesApi } from "../api";

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;

export default function PublicMatchPreview() {
  const { idOrSlug } = useParams();
  const [match, setMatch] = useState(null);
  const [overlaySettings, setOverlaySettings] = useState(null);
  const [commentary, setCommentary] = useState([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("live");
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Animation triggers
  const [livePulse, setLivePulse] = useState(false);
  const prevScore = useRef(null);

  const mergeMatchState = (prev, incoming) => {
    if (!incoming) return prev;
    if (!prev) return incoming;
    return { ...prev, ...incoming };
  };

  const fetchMatchDetails = () => {
    matchesApi.getPublicMatch(idOrSlug)
      .then((res) => {
        if (res.success) {
          if (res.isPrivate) {
            setIsPrivate(true);
            setMatch({
              matchTitle: res.matchTitle,
              battingTeam: res.battingTeam,
              bowlingTeam: res.bowlingTeam,
              matchStatus: "Private Match"
            });
          } else {
            setMatch(res.match);
            setOverlaySettings(res.overlaySettings);
            setCommentary(res.commentary || []);
          }
        } else {
          setError("Match not found or has been removed.");
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading match", err);
        setError("Error connecting to live server. Try again.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMatchDetails();
  }, [idOrSlug]);

  // Real-time Socket.IO sync
  useEffect(() => {
    if (!match || !match.matchId || isPrivate) return;

    let socket;
    import("socket.io-client").then(({ io }) => {
      socket = io(`${API_URL}/overlay`, {
        query: { matchId: match.matchId },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 500,
        reconnectionDelayMax: 2000,
      });

      socket.on("connection:ack", ({ snapshot }) => {
        if (snapshot) {
          setMatch((prev) => mergeMatchState(prev, snapshot));
        }
      });

      socket.on("score:update", (data) => {
        if (data) {
          setMatch((prev) => mergeMatchState(prev, data));
          // If score changed, trigger micro-pulse animation
          if (data.score !== undefined && prevScore.current !== null && data.score !== prevScore.current) {
            setLivePulse(true);
            setTimeout(() => setLivePulse(false), 800);
          }
          if (data.score !== undefined) prevScore.current = data.score;
          // Refresh events in background to get new commentary logs
          matchesApi.getPublicMatch(idOrSlug).then((r) => {
            if (r.success && r.commentary) setCommentary(r.commentary);
          });
        }
      });

      socket.on("score:correction", (data) => {
        if (data) {
          setMatch((prev) => mergeMatchState(prev, data));
          matchesApi.getPublicMatch(idOrSlug).then((r) => {
            if (r.success && r.commentary) setCommentary(r.commentary);
          });
        }
      });

      socket.on("players:update", (data) => {
        if (data) {
          setMatch((prev) => mergeMatchState(prev, data));
        }
      });

      socket.on("ticker:update", (data) => {
        if (data && data.ticker) {
          setMatch((prev) => ({ ...prev, ticker: data.ticker }));
        }
      });

      socket.on("match:status", (data) => {
        if (data) {
          setMatch((prev) => mergeMatchState(prev, data));
        }
      });
    }).catch((e) => console.error("Failed to load socket client", e));

    return () => {
      if (socket) socket.disconnect();
    };
  }, [match?.matchId, isPrivate]);

  // Track initial score for animations
  useEffect(() => {
    if (match && match.score !== undefined && prevScore.current === null) {
      prevScore.current = match.score;
    }
  }, [match]);

  const getTeamInitials = (name) => {
    if (!name) return "";
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 3);
  };

  const getOvers = (totalBalls) => {
    const overs = Math.floor(totalBalls / 6);
    const balls = totalBalls % 6;
    return `${overs}.${balls}`;
  };

  // Compile detailed scorecards dynamically
  const compiledScorecard = useMemo(() => {
    if (!match || isPrivate) return { batsmen: [], bowlers: [], extras: { wd: 0, nb: 0, lb: 0, b: 0, total: 0 }, fow: [] };

    const batsmen = {};
    const bowlers = {};
    let extras = { wd: 0, nb: 0, lb: 0, b: 0, total: 0 };
    let fow = [...(match.fallOfWickets || [])];

    // Sort commentary chronologically for scorecard processing
    const sortedEvents = [...commentary].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );

    sortedEvents.forEach((ev) => {
      // 1. Batsman calculations
      const bName = ev.batsmanName;
      if (bName && bName.trim() !== "" && !bName.toUpperCase().includes("SELECT")) {
        if (!batsmen[bName]) {
          batsmen[bName] = { name: bName, runs: 0, balls: 0, fours: 0, sixes: 0, howOut: "not out" };
        }

        if (ev.delivery !== "wide") {
          batsmen[bName].balls += 1;
        }

        if (ev.delivery === "4") {
          batsmen[bName].runs += 4;
          batsmen[bName].fours += 1;
        } else if (ev.delivery === "6") {
          batsmen[bName].runs += 6;
          batsmen[bName].sixes += 1;
        } else if (["1", "2", "3", "5"].includes(ev.delivery)) {
          batsmen[bName].runs += parseInt(ev.delivery);
        } else if (ev.delivery === "noball") {
          const batRuns = ev.runsScored > 0 ? ev.runsScored - 1 : 0;
          batsmen[bName].runs += batRuns;
          if (batRuns === 4) batsmen[bName].fours += 1;
          if (batRuns === 6) batsmen[bName].sixes += 1;
        }

        if (ev.isWicket) {
          if (ev.delivery === "runout") {
            batsmen[bName].howOut = "run out";
          } else {
            batsmen[bName].howOut = `c & b ${ev.bowlerName || "Bowler"}`;
          }
        }
      }

      // 2. Bowler calculations
      const boName = ev.bowlerName;
      if (boName && boName.trim() !== "" && !boName.toUpperCase().includes("SELECT")) {
        if (!bowlers[boName]) {
          bowlers[boName] = { name: boName, balls: 0, maidens: 0, runs: 0, wickets: 0 };
        }

        if (ev.isLegalDelivery) {
          bowlers[boName].balls += 1;
        }

        let chargedRuns = 0;
        if (ev.delivery === "wide" || ev.delivery === "noball") {
          chargedRuns = ev.runsScored || 0;
        } else if (ev.delivery !== "lb" && ev.delivery !== "byes") {
          chargedRuns = ev.runsScored || 0;
        }
        bowlers[boName].runs += chargedRuns;

        if (ev.isWicket && ev.delivery !== "runout") {
          bowlers[boName].wickets += 1;
        }
      }

      // 3. Extras calculations
      if (ev.delivery === "wide") {
        const wRuns = ev.runsScored || 1;
        extras.wd += wRuns;
        extras.total += wRuns;
      } else if (ev.delivery === "noball") {
        extras.nb += 1;
        extras.total += 1;
      } else if (ev.delivery === "lb") {
        const lbRuns = ev.runsScored || 1;
        extras.lb += lbRuns;
        extras.total += lbRuns;
      } else if (ev.delivery === "byes") {
        const bRuns = ev.runsScored || 1;
        extras.b += bRuns;
        extras.total += bRuns;
      }
    });

    // Merge active striker & non-striker live stats
    [match.player1, match.player2].forEach((p) => {
      if (p && p.name && p.name.trim() !== "" && !p.name.toUpperCase().includes("SELECT")) {
        if (!batsmen[p.name]) {
          batsmen[p.name] = { name: p.name, runs: p.runs || 0, balls: p.balls || 0, fours: p.fours || 0, sixes: p.sixes || 0, howOut: "not out" };
        } else if (batsmen[p.name].howOut === "not out") {
          batsmen[p.name].runs = Math.max(batsmen[p.name].runs, p.runs || 0);
          batsmen[p.name].balls = Math.max(batsmen[p.name].balls, p.balls || 0);
          batsmen[p.name].fours = Math.max(batsmen[p.name].fours, p.fours || 0);
          batsmen[p.name].sixes = Math.max(batsmen[p.name].sixes, p.sixes || 0);
        }
      }
    });

    // Merge active bowler live stats
    const b = match.bowler;
    if (b && b.name && b.name.trim() !== "" && !b.name.toUpperCase().includes("SELECT")) {
      if (!bowlers[b.name]) {
        const oVal = b.overs || 0;
        const bCount = Math.floor(oVal) * 6 + Math.round((oVal % 1) * 10);
        bowlers[b.name] = { name: b.name, balls: bCount, maidens: b.maidens || 0, runs: b.runs || 0, wickets: b.wickets || 0 };
      } else {
        const oVal = b.overs || 0;
        const liveBalls = Math.floor(oVal) * 6 + Math.round((oVal % 1) * 10);
        bowlers[b.name].balls = Math.max(bowlers[b.name].balls, liveBalls);
        bowlers[b.name].runs = Math.max(bowlers[b.name].runs, b.runs || 0);
        bowlers[b.name].wickets = Math.max(bowlers[b.name].wickets, b.wickets || 0);
        bowlers[b.name].maidens = Math.max(bowlers[b.name].maidens, b.maidens || 0);
      }
    }

    return {
      batsmen: Object.values(batsmen),
      bowlers: Object.values(bowlers),
      extras,
      fow
    };
  }, [match, commentary, isPrivate]);

  // Generate automated commentary strings
  const getCommentaryText = (ev) => {
    const batsman = ev.batsmanName || "Batsman";
    const bowler = ev.bowlerName || "Bowler";
    const runs = ev.runsScored || 0;

    if (ev.isWicket) {
      if (ev.delivery === "runout") {
        return `${bowler} to ${batsman}, **OUT**, run out! Sensational piece of fielding! Direct hit from the deep and the batsman is caught short of the crease.`;
      }
      return `${bowler} to ${batsman}, **OUT**, wicket falls! A classic dismissal as ${batsman} mistimes the shot completely and walks back.`;
    }

    if (ev.delivery === "wide") {
      return `${bowler} to ${batsman}, **WIDE**, strayed down leg side. Extra run added to the scoreboard.`;
    }

    if (ev.delivery === "noball") {
      return `${bowler} to ${batsman}, **NO BALL**, overstepped! A penalty run awarded and a free hit coming up next.`;
    }

    if (ev.delivery === "4") {
      return `${bowler} to ${batsman}, **FOUR!** Cracking shot! Cut away beautifully past point, boundaries flowing now.`;
    }

    if (ev.delivery === "6") {
      return `${bowler} to ${batsman}, **SIX!** Out of the park! Clean bat swing, lofted miles high over deep mid-wicket. Fantastic strike!`;
    }

    if (runs === 0) {
      return `${bowler} to ${batsman}, no run, length delivery, blocked back to the bowler.`;
    }

    if (runs === 1) {
      return `${bowler} to ${batsman}, 1 run, pushed soft to cover to rotate strike.`;
    }

    return `${bowler} to ${batsman}, ${runs} runs, tucked off the pads nicely into the mid-wicket gap. Good running.`;
  };

  // Compile commentary list with over breaks
  const commentaryListWithOvers = useMemo(() => {
    const list = [];
    const sorted = [...commentary].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      list.push({ type: "ball", event: ev });

      const isLegal = ev.isLegalDelivery;
      const overNumber = Math.floor((ev.snapshotLegalBalls || 0) / 6);
      const ballInOver = (ev.snapshotLegalBalls || 0) % 6;

      const isOverEnd = isLegal && ballInOver === 0 && ev.snapshotLegalBalls > 0;

      if (isOverEnd) {
        // Calculate runs in this completed over
        const runsInOver = sorted
          .filter((e) => {
            const evOver = Math.floor((e.snapshotLegalBalls - 1) / 6);
            return evOver === overNumber - 1;
          })
          .reduce((sum, e) => sum + (e.runsScored || 0), 0);

        list.push({
          type: "overBreak",
          overNumber,
          scoreSnapshot: `${ev.snapshotScore}/${ev.snapshotWickets}`,
          bowler: ev.bowlerName || "Bowler",
          runsInOver,
          id: `over-${overNumber}-${ev.createdAt}`
        });
      }
    }

    return list.reverse(); // Reverse chronological for stream layout
  }, [commentary]);

  // Social sharing handlers
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getShareText = () => {
    if (!match) return "";
    return `Watch the live score of ${match.matchTitle || "the cricket match"} between ${match.battingTeam} and ${match.bowlingTeam} live on KS Live! Currently ${match.score}/${match.wickets} (${getOvers(match.legalBallCount || 0)} ov). Link: `;
  };

  const handleFBShare = () => {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank");
  };

  const handleWAShare = () => {
    const text = encodeURIComponent(getShareText() + window.location.href);
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin"></div>
        <p className="text-slate-400 text-sm animate-pulse">Syncing live scoreboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6 text-center">
        <span className="text-5xl">🏏</span>
        <h2 className="text-2xl font-bold mt-4 text-red-400">Match Unavailable</h2>
        <p className="text-slate-400 text-sm max-w-md mt-2">{error}</p>
        <Link to="/live" className="mt-6 px-6 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl shadow-lg transition-colors">
          Browse Live Matches
        </Link>
      </div>
    );
  }

  if (isPrivate) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-zinc-950 text-white flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl mb-6 shadow-inner animate-pulse">
          🔒
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
          Private Match Scorecard
        </h2>
        <p className="text-slate-400 text-sm max-w-md mt-3 leading-relaxed">
          The broadcaster has disabled public scoring preview for{" "}
          <strong className="text-white">
            {match.battingTeam} vs {match.bowlingTeam}
          </strong>
          . Score updates are locked.
        </p>
        <Link to="/live" className="mt-8 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5 font-bold rounded-xl transition-all shadow-md">
          ← Back to Match Portal
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white font-sans selection:bg-teal-500 selection:text-black">
      {/* Sticky Score Bar */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <Link to="/live" className="flex items-center gap-2 text-teal-400 hover:text-teal-300 font-bold text-sm transition-colors">
          <span>←</span> <span className="hidden sm:inline">Back to Matches</span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/25 px-2.5 py-0.5 rounded-full text-xs font-bold text-red-500 uppercase tracking-widest animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            {match.matchStatus || "LIVE"}
          </div>

          <button
            onClick={() => setShareOpen(!shareOpen)}
            className="p-2 bg-slate-900 border border-white/10 rounded-lg hover:bg-slate-800 transition-colors"
            title="Share Match"
          >
            <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186l.943.502m-1.885-.502a2.25 2.25 0 110-2.186m0 2.186l.943-.502m-1.885.502l.943.502m3.893 3.486l.943-.502m-1.885.502a2.25 2.25 0 100-2.186m0 2.186l.943-.502m-1.885.502l.943.502m3.893-3.486a2.25 2.25 0 110-2.186m0 2.186l.943-.502" />
            </svg>
          </button>
        </div>
      </header>

      {/* Share Drawer */}
      {shareOpen && (
        <div className="bg-slate-950 border-b border-white/10 py-4 px-6 flex flex-wrap items-center justify-center gap-4 transition-all">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Share Live Scorecard:</span>
          <button
            onClick={handleFBShare}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold transition-colors"
          >
            Facebook
          </button>
          <button
            onClick={handleWAShare}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold transition-colors"
          >
            WhatsApp
          </button>
          <button
            onClick={handleCopyLink}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold border transition-colors ${copied ? "bg-teal-500 border-teal-500 text-slate-950" : "bg-slate-900 border-white/10 hover:bg-slate-800"}`}
          >
            {copied ? "Copied Link!" : "Copy Link"}
          </button>
        </div>
      )}

      {/* Match Overview Hero Card */}
      <section className="max-w-6xl mx-auto px-6 pt-6">
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 h-2 w-1/4 bg-gradient-to-r from-teal-400 to-emerald-400 rounded-bl-2xl"></div>

          {/* Tournament, Format, Title info */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-white/5 pb-4">
            <div>
              <span className="text-xs font-extrabold uppercase text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded border border-teal-500/20 mr-2 tracking-wide">
                {match.matchType || "T20"}
              </span>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                {match.tournamentName || "Tournament League"}
              </span>
              {match.matchTitle && (
                <h2 className="text-lg font-bold text-slate-200 mt-2 truncate">{match.matchTitle}</h2>
              )}
            </div>
            <div className="text-left md:text-right">
              <span className="text-xs text-slate-500 block">Venue: {match.venueName || "TBD Stadium"}</span>
              <span className="text-xs text-slate-500 block">Date: {match.matchDate || "TBD Date"}</span>
            </div>
          </div>

          {/* Scores Area */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 py-2">
            {/* Team Names and Large score details */}
            <div className="flex-1 space-y-4">
              <div className={`flex items-center justify-between md:justify-start md:gap-6 transition-all duration-300 ${livePulse ? "scale-[1.02]" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-sm text-teal-400 shadow-inner uppercase">
                    {getTeamInitials(match.battingTeam)}
                  </div>
                  <h3 className="text-xl md:text-2xl font-extrabold text-slate-100 uppercase tracking-wide">
                    {match.battingTeam}
                  </h3>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl md:text-4xl font-extrabold text-teal-400">
                    {match.score}/{match.wickets}
                  </span>
                  <span className="text-sm font-semibold text-slate-400">
                    ({getOvers(match.legalBallCount || 0)}/{match.maxOvers} ov)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 justify-between md:justify-start md:gap-6 opacity-60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-800/40 border border-white/5 flex items-center justify-center font-bold text-sm text-slate-400 uppercase">
                    {getTeamInitials(match.bowlingTeam)}
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-slate-400 uppercase tracking-wide">
                    {match.bowlingTeam}
                  </h3>
                </div>
                {match.isSecondInnings && match.targetScore > 0 && (
                  <span className="text-sm font-bold text-slate-400">
                    Target: {match.targetScore}
                  </span>
                )}
              </div>
            </div>

            {/* Situation Situation Box */}
            <div className="bg-slate-950/50 border border-white/5 rounded-2xl p-4 md:p-6 text-center md:text-right shrink-0 md:min-w-[240px]">
              <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block mb-1">
                Match Situation
              </span>
              <p className="font-extrabold text-teal-400 text-base leading-tight italic">
                {match.isSecondInnings && match.targetScore > 0 ? (
                  match.score >= match.targetScore ? (
                    `${match.battingTeam} won!`
                  ) : match.legalBallCount >= (match.targetBalls || 120) || match.wickets >= 10 ? (
                    `${match.bowlingTeam} won!`
                  ) : (
                    `Need ${match.targetScore - match.score} runs in ${Math.max(0, (match.targetBalls || 120) - match.legalBallCount)} balls`
                  )
                ) : match.toss && match.toss.winner ? (
                  `${match.toss.winner} won toss & elected to ${match.toss.decision === "bat" ? "bat" : "bowl"}`
                ) : (
                  "Live Scoring in progress"
                )}
              </p>
              <div className="flex items-center justify-center md:justify-end gap-4 mt-3 pt-3 border-t border-white/5 text-xs text-slate-500 font-semibold">
                <span>CRR: {match.currentRunRate || "0.00"}</span>
                {match.isSecondInnings && match.requiredRunRate > 0 && (
                  <span className="text-amber-400">RRR: {match.requiredRunRate}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Result Banner */}
      {match.matchStatus === 'completed' && match.matchResult && (
        <section className="max-w-6xl mx-auto px-6 mt-8">
          <div className="bg-gradient-to-r from-teal-600 to-teal-400 rounded-xl p-4 text-center shadow-lg border border-teal-300 shadow-teal-500/20">
            <h3 className="text-white text-lg font-extrabold uppercase tracking-wide">
              {match.matchResult}
            </h3>
          </div>
        </section>
      )}

      {/* Tabs list */}
      <section className="max-w-6xl mx-auto px-6 mt-8">
        <div className="flex border-b border-white/10 gap-2 md:gap-4 overflow-x-auto pb-px">
          {["live", "scorecard", "commentary", "info"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-xs md:text-sm font-bold uppercase tracking-wider whitespace-nowrap transition-all border-b-2 ${activeTab === tab ? "border-teal-400 text-teal-400 font-extrabold bg-teal-500/5 rounded-t-lg" : "border-transparent text-slate-400 hover:text-white"}`}
            >
              {tab === "info" ? "Match Info" : tab}
            </button>
          ))}
        </div>

        {/* TAB CONTENTS */}
        <div className="py-8">
          {/* 1. LIVE TAB */}
          {activeTab === "live" && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left 2 Cols: Active Batsmen & Bowlers */}
              <div className="lg:col-span-2 space-y-6">
                {/* Active Batsmen Card */}
                <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-md overflow-x-auto">
                  <h4 className="font-extrabold text-sm text-slate-300 uppercase tracking-wider mb-4">
                    Active Batsmen
                  </h4>
                  <table className="w-full text-left min-w-[500px]">
                    <thead>
                      <tr className="text-xs text-slate-500 font-bold border-b border-white/5 pb-2 uppercase">
                        <th className="py-2">Batsman</th>
                        <th className="py-2 text-center">Runs</th>
                        <th className="py-2 text-center">Balls</th>
                        <th className="py-2 text-center">4s</th>
                        <th className="py-2 text-center">6s</th>
                        <th className="py-2 text-right">SR</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm font-semibold text-slate-200">
                      {[match.player1, match.player2].filter(Boolean).map((p, idx) => (
                        <tr key={idx} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                          <td className="py-3 flex items-center gap-2">
                            <span>{p.name || "SELECT PLAYER"}</span>
                            {p.onStrike && (
                              <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" title="On strike"></span>
                            )}
                          </td>
                          <td className="py-3 text-center text-teal-300 font-extrabold">{p.runs || 0}</td>
                          <td className="py-3 text-center text-slate-400">{p.balls || 0}</td>
                          <td className="py-3 text-center text-slate-400">{p.fours || 0}</td>
                          <td className="py-3 text-center text-slate-400">{p.sixes || 0}</td>
                          <td className="py-3 text-right text-slate-400">
                            {p.balls ? ((p.runs / p.balls) * 100).toFixed(1) : "0.0"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Active Bowler Card */}
                <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-md overflow-x-auto">
                  <h4 className="font-extrabold text-sm text-slate-300 uppercase tracking-wider mb-4">
                    Active Bowler
                  </h4>
                  {match.bowler && match.bowler.name && match.bowler.name !== "SELECT BOWLER" ? (
                    <table className="w-full text-left min-w-[500px]">
                      <thead>
                        <tr className="text-xs text-slate-500 font-bold border-b border-white/5 pb-2 uppercase">
                          <th className="py-2">Bowler</th>
                          <th className="py-2 text-center">Overs</th>
                          <th className="py-2 text-center">Maidens</th>
                          <th className="py-2 text-center">Runs</th>
                          <th className="py-2 text-center">Wickets</th>
                          <th className="py-2 text-right">Econ</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm font-semibold text-slate-200">
                        <tr className="hover:bg-white/5 transition-colors">
                          <td className="py-3">{match.bowler.name}</td>
                          <td className="py-3 text-center text-teal-300 font-extrabold">
                            {match.bowler.overs || "0.0"}
                          </td>
                          <td className="py-3 text-center text-slate-400">{match.bowler.maidens || 0}</td>
                          <td className="py-3 text-center text-slate-400">{match.bowler.runs || 0}</td>
                          <td className="py-3 text-center text-red-400 font-bold">{match.bowler.wickets || 0}</td>
                          <td className="py-3 text-right text-slate-400">
                            {match.bowler.overs
                              ? (
                                  match.bowler.runs /
                                  (Math.floor(match.bowler.overs) + (match.bowler.overs % 1) * 1.666)
                                ).toFixed(2)
                              : "0.00"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-slate-500 text-sm">No bowler currently selected.</p>
                  )}
                </div>
              </div>

              {/* Right 1 Col: Recent Over tracker & Last Wicket */}
              <div className="space-y-6">
                {/* Ball tracker card */}
                <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-md">
                  <h4 className="font-extrabold text-sm text-slate-300 uppercase tracking-wider mb-4">
                    Recent Balls (Current Over)
                  </h4>
                  {match.recentBalls && match.recentBalls.length > 0 ? (
                    <div className="flex flex-wrap gap-3 py-2 items-center">
                      {match.recentBalls.map((ball, idx) => {
                        let bg = "bg-slate-800 text-slate-300 border border-white/5";
                        if (ball === "4") bg = "bg-amber-500 text-slate-950 font-extrabold border-amber-600";
                        else if (ball === "6") bg = "bg-fuchsia-600 text-white font-extrabold shadow-[0_0_8px_rgba(192,38,211,0.5)] border-fuchsia-700";
                        else if (ball === "W" || ball.includes("W") || ball.includes("Wicket")) bg = "bg-red-500 text-white font-bold border-red-600";
                        return (
                          <span
                            key={idx}
                            className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${bg}`}
                          >
                            {ball}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm italic">New over starting...</p>
                  )}
                </div>

                {/* Fall of Wickets */}
                <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-md">
                  <h4 className="font-extrabold text-sm text-slate-300 uppercase tracking-wider mb-4 flex justify-between">
                    <span>Fall of Wickets</span>
                    <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">Total: {match.fallOfWickets?.length || 0}</span>
                  </h4>
                  {match.fallOfWickets && match.fallOfWickets.length > 0 ? (
                    <div className="space-y-3">
                      <div className="max-h-48 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                        {[...match.fallOfWickets].reverse().map((fow, idx) => (
                          <div key={idx} className="flex justify-between items-center text-sm border-b border-white/5 pb-2 last:border-0 last:pb-0">
                            <div className="flex flex-col">
                              <span className="text-white font-bold">{fow.score}-{fow.wicket}</span>
                              <span className="text-[10px] text-slate-500">{fow.playerName}</span>
                            </div>
                            <span className="text-slate-400 font-semibold">{fow.overAtFall} ov</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm italic">No wickets fallen yet.</p>
                  )}
                </div>

                {/* Powerplay Status */}
                <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-md text-slate-300">
                  <h4 className="font-extrabold text-sm text-slate-300 uppercase tracking-wider mb-2">Powerplay</h4>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${match.powerplay?.active ? 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-slate-700'}`}></div>
                    <span className="font-bold text-white">{match.powerplay?.active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 italic">Automatically tracked based on over count.</p>
                </div>
              </div>
            </div>
            
            {/* Charts Section */}
            {match.perOverRuns && match.perOverRuns.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                {/* Manhattan Chart (Runs per over) */}
                <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-md flex flex-col">
                  <h4 className="font-extrabold text-sm text-slate-300 uppercase tracking-wider mb-6">Runs Per Over (Manhattan)</h4>
                  <div className="flex-1 flex items-end gap-1 h-48 border-b border-white/10 pb-1 px-2 overflow-x-auto">
                    {match.perOverRuns.map((runs, idx) => {
                      const heightPercent = Math.min(100, Math.max(5, (runs / 24) * 100)); // Cap at ~24 runs per over
                      const isHigh = runs >= 10;
                      return (
                        <div key={idx} className="flex flex-col items-center flex-1 min-w-[20px] group">
                          <div className="text-[9px] text-slate-500 font-bold mb-1 opacity-0 group-hover:opacity-100 transition-opacity">{runs}</div>
                          <div 
                            className={`w-full rounded-t-sm transition-all duration-500 ${isHigh ? 'bg-teal-400' : 'bg-slate-600 group-hover:bg-teal-500/50'}`}
                            style={{ height: `${heightPercent}%` }}
                          ></div>
                          <div className="text-[9px] text-slate-600 mt-2 font-semibold">{idx + 1}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Worm Chart (Cumulative Runs) */}
                <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-md flex flex-col">
                  <h4 className="font-extrabold text-sm text-slate-300 uppercase tracking-wider mb-6">Cumulative Score (Worm)</h4>
                  <div className="flex-1 h-48 border-b border-l border-white/10 relative px-2 py-4">
                    <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                      {(() => {
                        const maxOvers = match.perOverRuns.length;
                        const maxScore = match.score || 1;
                        let currentScore = 0;
                        const points = match.perOverRuns.map((runs, idx) => {
                          currentScore += runs;
                          const x = ((idx + 1) / maxOvers) * 100;
                          const y = 100 - ((currentScore / maxScore) * 100);
                          return `${x}%,${y}%`;
                        });
                        const fowPoints = (match.fallOfWickets || []).map(fow => {
                          const overNum = parseFloat(fow.overAtFall);
                          const x = (overNum / maxOvers) * 100;
                          const y = 100 - ((fow.score / maxScore) * 100);
                          return { x, y, ...fow };
                        }).filter(p => p.x <= 100);
                        
                        return (
                          <>
                            <polyline
                              points={`0,100% ${points.join(' ')}`}
                              fill="none"
                              stroke="#2dd4bf"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]"
                            />
                            {fowPoints.map((p, i) => (
                              <circle key={i} cx={`${p.x}%`} cy={`${p.y}%`} r="4" fill="#ef4444" stroke="#1e293b" strokeWidth="2" />
                            ))}
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                </div>
              </div>
            )}
            </div>
          )}

          {/* 2. SCORECARD TAB */}
          {activeTab === "scorecard" && (
            <div className="space-y-8 max-w-5xl mx-auto">
              {/* Batting Card */}
              {match.isSecondInnings && (
                <div className="bg-slate-900 border border-teal-500/30 rounded-2xl p-4 shadow-md flex justify-between items-center text-sm font-bold text-slate-300">
                  <span>1st Innings: {match.bowlingTeam}</span>
                  <span className="text-teal-400 text-lg">{match.firstInningsScore || match.targetScore - 1}/{match.firstInningsWickets || 10} <span className="text-xs text-slate-500">({match.firstInningsOvers || '20.0'} ov)</span></span>
                </div>
              )}
              <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-md overflow-x-auto">
                <h4 className="font-extrabold text-sm bg-gradient-to-r from-teal-400 to-teal-200 bg-clip-text text-transparent uppercase tracking-wider mb-4">
                  Batting Scorecard ({match.battingTeam})
                </h4>
                <table className="w-full text-left min-w-[600px]">
                  <thead>
                    <tr className="text-xs text-slate-500 font-bold border-b border-white/5 pb-2 uppercase">
                      <th className="py-2">Batsman</th>
                      <th className="py-2">Dismissal</th>
                      <th className="py-2 text-center">Runs</th>
                      <th className="py-2 text-center">Balls</th>
                      <th className="py-2 text-center">4s</th>
                      <th className="py-2 text-center">6s</th>
                      <th className="py-2 text-right">SR</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-semibold text-slate-200">
                    {compiledScorecard.batsmen.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="py-4 text-center text-slate-500 text-xs italic">
                          No batting records logged yet.
                        </td>
                      </tr>
                    ) : (
                      compiledScorecard.batsmen.map((b, idx) => (
                        <tr key={idx} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                          <td className="py-3 font-bold text-slate-200">{b.name}</td>
                          <td className="py-3 text-slate-400 text-xs italic font-medium">
                            {b.howOut === "not out" ? (
                              <span className="text-teal-400 font-bold uppercase tracking-wider">not out</span>
                            ) : (
                              b.howOut
                            )}
                          </td>
                          <td className="py-3 text-center text-teal-300 font-extrabold">{b.runs}</td>
                          <td className="py-3 text-center text-slate-400">{b.balls}</td>
                          <td className="py-3 text-center text-slate-400">{b.fours}</td>
                          <td className="py-3 text-center text-slate-400">{b.sixes}</td>
                          <td className="py-3 text-right text-slate-400 font-mono text-xs">
                            {b.balls ? ((b.runs / b.balls) * 100).toFixed(1) : "0.0"}
                          </td>
                        </tr>
                      ))
                    )}

                    {/* Extras Row */}
                    <tr className="bg-slate-950/20 border-t border-white/10 font-bold text-slate-400">
                      <td className="py-3.5 pl-2 text-xs uppercase" colSpan="2">
                        Extras
                      </td>
                      <td className="py-3.5 text-center text-amber-400 font-extrabold">
                        {match.extras?.total || compiledScorecard.extras.total}
                      </td>
                      <td className="py-3.5 text-xs font-medium text-slate-500 pl-4" colSpan="4">
                        (wd {match.extras?.wides || compiledScorecard.extras.wd}, nb {match.extras?.noballs || compiledScorecard.extras.nb}, lb {match.extras?.legbyes || compiledScorecard.extras.lb}, b {match.extras?.byes || compiledScorecard.extras.b})
                      </td>
                    </tr>

                    {/* Total Row */}
                    <tr className="bg-slate-950/40 border-t-2 border-teal-500/20 font-extrabold text-slate-200">
                      <td className="py-4 pl-2 text-sm uppercase" colSpan="2">
                        Total Score
                      </td>
                      <td className="py-4 text-center text-teal-400 text-lg">
                        {match.score}/{match.wickets}
                      </td>
                      <td className="py-4 text-xs font-semibold text-slate-400 pl-4" colSpan="4">
                        ({getOvers(match.legalBallCount || 0)} overs, RR: {match.currentRunRate || "0.00"})
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Bowling Card */}
              <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-md overflow-x-auto">
                <h4 className="font-extrabold text-sm bg-gradient-to-r from-red-400 to-red-200 bg-clip-text text-transparent uppercase tracking-wider mb-4">
                  Bowling Scorecard ({match.bowlingTeam})
                </h4>
                <table className="w-full text-left min-w-[600px]">
                  <thead>
                    <tr className="text-xs text-slate-500 font-bold border-b border-white/5 pb-2 uppercase">
                      <th className="py-2">Bowler</th>
                      <th className="py-2 text-center">Overs</th>
                      <th className="py-2 text-center">Maidens</th>
                      <th className="py-2 text-center">Runs</th>
                      <th className="py-2 text-center">Wickets</th>
                      <th className="py-2 text-right">Econ</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-semibold text-slate-200">
                    {compiledScorecard.bowlers.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="py-4 text-center text-slate-500 text-xs italic">
                          No bowling records logged yet.
                        </td>
                      </tr>
                    ) : (
                      compiledScorecard.bowlers.map((bo, idx) => (
                        <tr key={idx} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                          <td className="py-3 font-bold text-slate-200">{bo.name}</td>
                          <td className="py-3 text-center text-teal-300 font-extrabold">
                            {getOvers(bo.balls)}
                          </td>
                          <td className="py-3 text-center text-slate-400">{bo.maidens}</td>
                          <td className="py-3 text-center text-slate-400">{bo.runs}</td>
                          <td className="py-3 text-center text-red-400 font-bold">{bo.wickets}</td>
                          <td className="py-3 text-right text-slate-400 font-mono text-xs">
                            {bo.balls ? ((bo.runs / (bo.balls / 6))).toFixed(2) : "0.00"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Fall of Wickets Card */}
              <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-md">
                <h4 className="font-extrabold text-sm text-slate-300 uppercase tracking-wider mb-4">
                  Fall of Wickets
                </h4>
                {compiledScorecard.fow.length === 0 ? (
                  <p className="text-slate-500 text-sm italic">No wickets fallen yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-300">
                    {compiledScorecard.fow.map((fw, idx) => (
                      <span
                        key={idx}
                        className="bg-slate-950 px-3 py-1.5 rounded-xl border border-white/5 block shadow-inner shrink-0"
                      >
                        <strong className="text-teal-400">{fw.wicket}-{fw.score}</strong> ({fw.playerName || "Batsman"}, {fw.overAtFall} ov)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. COMMENTARY TAB */}
          {activeTab === "commentary" && (
            <div className="max-w-4xl mx-auto space-y-6">
              <h4 className="font-extrabold text-sm text-slate-300 uppercase tracking-wider">
                Ball-by-Ball Logs
              </h4>

              {commentaryListWithOvers.length === 0 ? (
                <div className="bg-slate-900 border border-white/5 rounded-2xl p-10 text-center text-slate-500 text-sm italic">
                  Live match commentary is starting... Stay tuned!
                </div>
              ) : (
                <div className="space-y-6">
                  {commentaryListWithOvers.map((item, idx) => {
                    if (item.type === "overBreak") {
                      return (
                        <div
                          key={item.id}
                          className="bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border-y border-white/10 py-3 px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shadow-inner"
                        >
                          <div className="text-slate-200 font-extrabold text-sm uppercase tracking-wider flex items-center gap-2">
                            <span>🏁 End of Over {item.overNumber}</span>
                            <span className="text-xs text-slate-500">|</span>
                            <span className="text-xs text-teal-400">{item.runsInOver} runs scored</span>
                          </div>
                          <div className="text-xs font-bold text-slate-400 sm:text-right">
                            Score: <strong className="text-white">{item.scoreSnapshot}</strong>
                            <span className="mx-2 text-slate-600">•</span>
                            Bowler: <span className="text-slate-300">{item.bowler}</span>
                          </div>
                        </div>
                      );
                    }

                    // Render standard ball event
                    const ev = item.event;
                    let outcomeBg = "bg-slate-800 text-slate-300";
                    let textHighlight = "text-slate-200";

                    if (ev.delivery === "4") {
                      outcomeBg = "bg-amber-500 text-slate-950 font-black shadow-[0_0_6px_rgba(245,158,11,0.3)]";
                      textHighlight = "text-amber-300";
                    } else if (ev.delivery === "6") {
                      outcomeBg = "bg-fuchsia-600 text-white font-black shadow-[0_0_10px_rgba(192,38,211,0.4)]";
                      textHighlight = "text-fuchsia-300";
                    } else if (ev.isWicket) {
                      outcomeBg = "bg-red-500 text-white font-bold border border-red-600";
                      textHighlight = "text-red-300 font-bold";
                    } else if (ev.delivery === "wide" || ev.delivery === "noball") {
                      outcomeBg = "bg-teal-500/10 text-teal-400 border border-teal-500/25";
                    }

                    const ballLabel = ev.delivery === "dot" ? "•"
                      : ev.delivery === "wide" ? "WD"
                      : ev.delivery === "noball" ? "NB"
                      : ev.delivery === "wicket" ? "W"
                      : ev.delivery === "runout" ? "RO"
                      : ev.runsScored !== undefined ? String(ev.runsScored)
                      : ev.delivery.toUpperCase().slice(0, 2);

                    return (
                      <div
                        key={ev.id || idx}
                        className="flex items-start gap-4 p-4 hover:bg-white/5 rounded-2xl transition-colors border border-white/5 hover:border-white/10"
                      >
                        {/* Over and ball outcome */}
                        <div className="flex flex-col items-center gap-1.5 shrink-0">
                          <span className="text-xs font-mono font-extrabold text-slate-400 tracking-tighter">
                            {ev.snapshotOver}
                          </span>
                          <span
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${outcomeBg}`}
                          >
                            {ballLabel}
                          </span>
                        </div>

                        {/* Commentary Text */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm md:text-base leading-relaxed ${textHighlight}`}>
                            {/* Format bold tags manually */}
                            {getCommentaryText(ev).split("**").map((text, i) =>
                              i % 2 === 1 ? <strong key={i} className="text-white font-extrabold uppercase">{text}</strong> : text
                            )}
                          </p>
                          <span className="text-[10px] text-slate-500 font-semibold block mt-1.5 uppercase tracking-wide">
                            {new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 4. MATCH INFO TAB */}
          {activeTab === "info" && (
            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Match Details Panel */}
              <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-md space-y-4">
                <h4 className="font-extrabold text-sm text-slate-300 uppercase tracking-wider border-b border-white/5 pb-2">
                  Match Details
                </h4>

                <div className="grid grid-cols-3 gap-2 text-xs py-1">
                  <span className="text-slate-500 font-bold uppercase">Series</span>
                  <span className="col-span-2 text-slate-200 font-semibold">
                    {match.tournamentName || "KS Cricket Tournament"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs py-1">
                  <span className="text-slate-500 font-bold uppercase">Match</span>
                  <span className="col-span-2 text-slate-200 font-semibold">
                    {match.matchTitle || `${match.battingTeam} vs ${match.bowlingTeam}`}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs py-1">
                  <span className="text-slate-500 font-bold uppercase">Format</span>
                  <span className="col-span-2 text-slate-200 font-bold text-teal-400 uppercase">
                    {match.matchType || "T20"} ({match.maxOvers} Overs)
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs py-1">
                  <span className="text-slate-500 font-bold uppercase">Venue</span>
                  <span className="col-span-2 text-slate-200 font-semibold">
                    {match.venueName || "Colombo Stadium"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs py-1">
                  <span className="text-slate-500 font-bold uppercase">Date</span>
                  <span className="col-span-2 text-slate-200 font-semibold">
                    {match.matchDate || "TBD Date"}
                  </span>
                </div>

                {match.toss && match.toss.winner && (
                  <div className="grid grid-cols-3 gap-2 text-xs py-1 border-t border-white/5 pt-3">
                    <span className="text-slate-500 font-bold uppercase">Toss Info</span>
                    <span className="col-span-2 text-teal-300 font-semibold">
                      {match.toss.winner} won the toss & elected to {match.toss.decision === "bat" ? "bat" : "bowl"}
                    </span>
                  </div>
                )}
              </div>

              {/* Roster & Squad listings Panel */}
              <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-md space-y-6">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-300 uppercase tracking-wider border-b border-white/5 pb-2 mb-3">
                    {match.battingTeam} Squad
                  </h4>
                  {match.battingSquad && match.battingSquad.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {match.battingSquad.map((player, i) => (
                        <span
                          key={i}
                          className="bg-slate-950 border border-white/5 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300"
                        >
                          {player}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-xs italic">Squad roster not announced.</p>
                  )}
                </div>

                <div>
                  <h4 className="font-extrabold text-sm text-slate-300 uppercase tracking-wider border-b border-white/5 pb-2 mb-3">
                    {match.bowlingTeam} Squad
                  </h4>
                  {match.bowlingSquad && match.bowlingSquad.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {match.bowlingSquad.map((player, i) => (
                        <span
                          key={i}
                          className="bg-slate-950 border border-white/5 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300"
                        >
                          {player}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-xs italic">Squad roster not announced.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="mt-20 border-t border-white/5 bg-slate-950/40 py-10 px-6 text-center text-xs text-slate-500">
        <p>© {new Date().getFullYear()} KS Live Broadcasting System. All rights reserved.</p>
        <p className="mt-2 text-[10px] tracking-wider text-slate-600 uppercase">
          Colombo • Sri Lanka
        </p>
      </footer>
    </div>
  );
}
