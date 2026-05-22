import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { matchesApi } from "../api";

export default function PublicLiveMatches() {
  const [matches, setMatches] = useState({ live: [], upcoming: [], recent: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPublicMatches = () => {
    setLoading(true);
    matchesApi.getPublicMatches()
      .then((res) => {
        if (res.success && res.matches) {
          setMatches(res.matches);
        } else {
          setError("Failed to load match listings.");
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch matches", err);
        setError("Error connecting to server. Please try again.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchPublicMatches();
    // Poll for match listing updates every 30 seconds
    const interval = setInterval(fetchPublicMatches, 30000);
    return () => clearInterval(interval);
  }, []);

  // Real-time socket updates for live matches
  useEffect(() => {
    if (!matches.live || matches.live.length === 0) return;
    const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;
    let sockets = [];

    import("socket.io-client").then(({ io }) => {
      matches.live.forEach((m) => {
        const socket = io(`${API_URL}/overlay`, {
          query: { matchId: m.matchId },
          transports: ["websocket", "polling"],
        });

        socket.on("score:update", (data) => {
          if (data) {
            setMatches((prev) => {
              const newLive = prev.live.map((liveMatch) =>
                liveMatch.matchId === data.matchId ? { ...liveMatch, ...data } : liveMatch
              );
              return { ...prev, live: newLive };
            });
          }
        });

        sockets.push(socket);
      });
    });

    return () => {
      sockets.forEach((s) => s.disconnect());
    };
  }, [matches.live.length]);

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

  // Filter matches based on search query
  const filterMatches = (matchList) => {
    if (!searchQuery) return matchList;
    const query = searchQuery.toLowerCase();
    return matchList.filter(
      (m) =>
        (m.matchTitle && m.matchTitle.toLowerCase().includes(query)) ||
        (m.tournamentName && m.tournamentName.toLowerCase().includes(query)) ||
        (m.battingTeam && m.battingTeam.toLowerCase().includes(query)) ||
        (m.bowlingTeam && m.bowlingTeam.toLowerCase().includes(query)) ||
        (m.venueName && m.venueName.toLowerCase().includes(query))
    );
  };

  const filteredLive = filterMatches(matches.live || []);
  const filteredUpcoming = filterMatches(matches.upcoming || []);
  const filteredRecent = filterMatches(matches.recent || []);

  const totalMatchesCount = filteredLive.length + filteredUpcoming.length + filteredRecent.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-zinc-900 text-white font-sans selection:bg-teal-500 selection:text-black">
      {/* Premium Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-950/80 border-b border-white/10 shadow-lg px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
          <img src="/ks_logo.png" alt="KS Live Logo" className="w-10 h-10 object-contain drop-shadow-[0_0_8px_rgba(20,184,166,0.5)]" />
          <span className="font-extrabold text-xl bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent uppercase tracking-wider">
            KS Live Scores
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/landing" className="text-sm font-semibold text-slate-300 hover:text-white transition-colors">
            Home
          </Link>
          <Link to="/login" className="px-4 py-2 text-sm font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-lg shadow-md hover:shadow-teal-500/25 transition-all">
            Broadcaster Login
          </Link>
        </div>
      </header>

      {/* Main Hero Container */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Live Cricket Scores
            </h1>
            <p className="text-slate-400 mt-2 text-sm md:text-base">
              Get real-time professional cricket scores, commentary, and full match previews.
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full md:w-80">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search match, team, series..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950/50 hover:bg-slate-950/80 border border-white/10 rounded-xl focus:border-teal-400 focus:ring-1 focus:ring-teal-400 text-white placeholder-slate-500 transition-all outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 border-4 border-teal-400/30 border-t-teal-400 rounded-full animate-spin"></div>
            <p className="text-slate-400 text-sm animate-pulse">Syncing live scores...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center text-red-200 max-w-lg mx-auto my-12">
            <span className="text-4xl">⚠️</span>
            <h3 className="font-bold text-lg mt-3">Connection Problem</h3>
            <p className="text-sm text-red-300 mt-1">{error}</p>
            <button
              onClick={fetchPublicMatches}
              className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-white text-xs font-bold rounded-lg border border-red-500/40 transition-colors"
            >
              Retry Sync
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* LIVE MATCHES SECTION */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <h2 className="text-xl font-bold tracking-wide uppercase text-slate-200">
                  Live Matches ({filteredLive.length})
                </h2>
              </div>

              {filteredLive.length === 0 ? (
                <div className="bg-slate-950/20 border border-white/5 rounded-2xl p-10 text-center text-slate-500 text-sm">
                  No matches currently in progress.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredLive.map((m) => {
                    const matchSlug = m.slug || m.matchId;
                    return (
                      <Link
                        key={m.matchId}
                        to={`/live/match/${matchSlug}`}
                        className="group relative block bg-gradient-to-br from-slate-900 to-slate-950 hover:from-slate-950 hover:to-slate-900 border border-white/10 hover:border-teal-500/40 rounded-2xl p-6 shadow-md hover:shadow-teal-500/5 transition-all overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 h-1.5 w-1/3 bg-gradient-to-r from-teal-400 to-emerald-400 rounded-bl-xl opacity-80 group-hover:w-full transition-all duration-300"></div>

                        {/* Top Info */}
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-4">
                          <span className="font-semibold text-teal-400 uppercase tracking-wider">
                            {m.matchType || "T20"}
                          </span>
                          <span className="truncate max-w-[150px] font-medium bg-slate-900 px-2 py-0.5 rounded border border-white/5">
                            {m.tournamentName || "KS Cup"}
                          </span>
                        </div>

                        {/* Teams Layout */}
                        <div className="space-y-4 mb-6">
                          {/* Batting Team (Live Score) */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-xs text-teal-400 shadow-inner uppercase">
                                {getTeamInitials(m.battingTeam)}
                              </div>
                              <span className="font-bold text-slate-200 group-hover:text-white transition-colors truncate max-w-[150px]">
                                {m.battingTeam}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="font-extrabold text-lg text-teal-300">
                                {m.score}/{m.wickets}
                              </span>
                              <span className="text-xs text-slate-400 block">
                                {getOvers(m.legalBallCount || 0)} ov
                              </span>
                            </div>
                          </div>

                          {/* Bowling Team */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-800/40 border border-white/5 flex items-center justify-center font-bold text-xs text-slate-400 uppercase">
                                {getTeamInitials(m.bowlingTeam)}
                              </div>
                              <span className="font-medium text-slate-400 truncate max-w-[150px]">
                                {m.bowlingTeam}
                              </span>
                            </div>
                            {m.isSecondInnings && m.targetScore > 0 && (
                              <span className="text-xs font-semibold text-slate-400">
                                Target: {m.targetScore}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Recent Balls Tracker */}
                        {m.recentBalls && m.recentBalls.length > 0 && (
                          <div className="mb-5 flex items-center gap-2 overflow-x-auto py-1">
                            <span className="text-[10px] text-slate-500 font-bold tracking-wider uppercase shrink-0">
                              Over:
                            </span>
                            {m.recentBalls.map((ball, i) => {
                              let bg = "bg-slate-800 text-slate-300";
                              if (ball === "4") bg = "bg-amber-500 text-slate-950 font-extrabold";
                              else if (ball === "6") bg = "bg-fuchsia-600 text-white font-extrabold shadow-[0_0_8px_rgba(192,38,211,0.5)]";
                              else if (ball === "W" || ball.includes("W") || ball.includes("Wicket")) bg = "bg-red-500 text-white font-bold";
                              return (
                                <span
                                  key={i}
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${bg}`}
                                >
                                  {ball}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Footer Status situation */}
                        <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                          <span className="text-teal-400 font-bold bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20 animate-pulse">
                            ● LIVE
                          </span>
                          <span className="text-slate-400 font-semibold italic text-right truncate max-w-[180px]">
                            {m.isSecondInnings && m.targetScore > 0
                              ? `Need ${Math.max(0, m.targetScore - m.score)} off ${120 - m.legalBallCount} balls`
                              : `CRR: ${m.score && m.legalBallCount ? (m.score / (m.legalBallCount / 6)).toFixed(2) : "0.00"}`}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            {/* UPCOMING MATCHES SECTION */}
            <section className="mb-12">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-teal-400 text-lg">📅</span>
                <h2 className="text-xl font-bold tracking-wide uppercase text-slate-200">
                  Upcoming Matches ({filteredUpcoming.length})
                </h2>
              </div>

              {filteredUpcoming.length === 0 ? (
                <div className="bg-slate-950/20 border border-white/5 rounded-2xl p-10 text-center text-slate-500 text-sm">
                  No upcoming matches scheduled.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredUpcoming.map((m) => {
                    const matchSlug = m.slug || m.matchId;
                    return (
                      <Link
                        key={m.matchId}
                        to={`/live/match/${matchSlug}`}
                        className="group block bg-slate-900/60 border border-white/10 hover:border-white/20 rounded-2xl p-6 transition-all hover:bg-slate-950/50"
                      >
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-4">
                          <span className="font-semibold text-teal-400 tracking-wider">
                            {m.matchType || "T20"}
                          </span>
                          <span className="truncate max-w-[150px] font-medium bg-slate-900 px-2 py-0.5 rounded border border-white/5">
                            {m.tournamentName || "Upcoming"}
                          </span>
                        </div>

                        {/* Match Title if any */}
                        {m.matchTitle && (
                          <div className="text-slate-300 font-bold text-sm mb-3 truncate">
                            {m.matchTitle}
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 mb-6 py-2">
                          <div className="flex flex-col items-start w-[40%]">
                            <span className="font-bold text-slate-200 group-hover:text-white truncate max-w-full text-base">
                              {m.battingTeam}
                            </span>
                            <span className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                              {getTeamInitials(m.battingTeam)}
                            </span>
                          </div>

                          <span className="text-slate-500 font-extrabold text-xs">VS</span>

                          <div className="flex flex-col items-end w-[40%] text-right">
                            <span className="font-bold text-slate-200 group-hover:text-white truncate max-w-full text-base">
                              {m.bowlingTeam}
                            </span>
                            <span className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                              {getTeamInitials(m.bowlingTeam)}
                            </span>
                          </div>
                        </div>

                        {/* Date and Venue */}
                        <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
                          <span className="font-medium text-slate-400 truncate max-w-[150px]">
                            📍 {m.venueName || "TBD Venue"}
                          </span>
                          <span className="font-bold text-slate-400 bg-slate-800/80 px-2 py-1 rounded border border-white/5">
                            {m.matchDate || "TBD Date"}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            {/* RECENT RESULTS SECTION */}
            <section className="mb-12">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-teal-400 text-lg">🏆</span>
                <h2 className="text-xl font-bold tracking-wide uppercase text-slate-200">
                  Recent Results ({filteredRecent.length})
                </h2>
              </div>

              {filteredRecent.length === 0 ? (
                <div className="bg-slate-950/20 border border-white/5 rounded-2xl p-10 text-center text-slate-500 text-sm">
                  No completed matches on record.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredRecent.map((m) => {
                    const matchSlug = m.slug || m.matchId;
                    return (
                      <Link
                        key={m.matchId}
                        to={`/live/match/${matchSlug}`}
                        className="group block bg-slate-900/40 hover:bg-slate-900/60 border border-white/5 hover:border-white/10 rounded-2xl p-6 transition-all shadow-sm"
                      >
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                          <span className="font-semibold text-slate-400 tracking-wider">
                            {m.matchType || "T20"}
                          </span>
                          <span className="truncate max-w-[150px] font-medium bg-slate-950 px-2 py-0.5 rounded border border-white/5">
                            {m.tournamentName || "Tournament"}
                          </span>
                        </div>

                        {/* Score summaries */}
                        <div className="space-y-3 mb-6">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-300 group-hover:text-white transition-colors truncate max-w-[180px]">
                              {m.battingTeam}
                            </span>
                            <span className="font-extrabold text-sm text-slate-300">
                              {m.score}/{m.wickets} <span className="text-xs font-normal text-slate-500">({getOvers(m.legalBallCount || 0)})</span>
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-500 truncate max-w-[180px]">
                              {m.bowlingTeam}
                            </span>
                            {m.isSecondInnings && m.targetScore > 0 && (
                              <span className="text-xs text-slate-500 font-medium">
                                Target: {m.targetScore}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Result Situation */}
                        <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                          <span className="text-slate-400 font-bold bg-slate-950 px-2.5 py-1 rounded border border-white/5">
                            FINISHED
                          </span>
                          <span className="text-teal-400/90 font-extrabold text-right truncate max-w-[180px]">
                            {m.score >= m.targetScore && m.isSecondInnings
                              ? `${m.battingTeam} won`
                              : `${m.bowlingTeam} won`}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Total count status bar */}
            {!loading && totalMatchesCount === 0 && searchQuery && (
              <div className="py-20 text-center text-slate-500 text-sm">
                No results match your search query "{searchQuery}".
              </div>
            )}
          </>
        )}
      </main>

      <footer className="mt-20 border-t border-white/5 bg-slate-950/40 py-10 px-6 text-center text-xs text-slate-500">
        <p>© {new Date().getFullYear()} KS Live Broadcasting System. All rights reserved.</p>
        <p className="mt-2 text-[10px] tracking-wider text-slate-600 uppercase">
          Colombo • Sri Lanka
        </p>
      </footer>
    </div>
  );
}
