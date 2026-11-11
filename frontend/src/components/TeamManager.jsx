import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { matchesApi } from "../api";

const TeamManager = () => {
  const { matchId } = useParams();
  const [players, setPlayers] = useState([]);
  const [newPlayer, setNewPlayer] = useState({ name: "", photo: "" });
  const [selectedBatting, setSelectedBatting] = useState([]);
  const [selectedBowling, setSelectedBowling] = useState([]);
  const [teamNames, setTeamNames] = useState({ teamA: "TEAM A", teamB: "TEAM B" });
  const adminPath = matchId ? `/admin/${matchId}` : "/admin";
  const miniAdminPath = matchId ? `/mini-admin/${matchId}` : "/mini-admin";
  const overlayPath = matchId ? `/overlay/${matchId}` : "/overlay";

  // Load master player list from localStorage
  const loadMasterPlayers = () => {
    try {
      const stored = JSON.parse(localStorage.getItem("player_database") || "[]");
      setPlayers(stored);
    } catch {
      setPlayers([]);
    }
  };

  useEffect(() => {
    loadMasterPlayers();
    window.addEventListener('ks_players_updated', loadMasterPlayers);
    return () => window.removeEventListener('ks_players_updated', loadMasterPlayers);
  }, []);

  // Load live match squad from MongoDB
  useEffect(() => {
    if (!matchId) return;
    matchesApi.get(matchId)
      .then(res => {
        if (res.match) {
          setSelectedBatting(res.match.battingSquad || []);
          setSelectedBowling(res.match.bowlingSquad || []);
          setTeamNames({
            teamA: res.match.battingTeam || "TEAM A",
            teamB: res.match.bowlingTeam || "TEAM B",
          });
        }
      })
      .catch(e => console.error("Failed to load match squad from MongoDB:", e));
  }, [matchId]);

  const addPlayerToDB = () => {
    if (!newPlayer.name) return;
    const id = Date.now();
    const updated = [...players, { ...newPlayer, id }];
    localStorage.setItem("player_database", JSON.stringify(updated));
    setPlayers(updated);
    window.dispatchEvent(new Event('ks_players_updated'));
    setNewPlayer({ name: "", photo: "" });
  };

  // DELETE player from the master database
  const deleteFromMaster = (id) => {
    if (window.confirm("Delete this player from the database?")) {
      const updated = players.filter(p => p.id !== id);
      localStorage.setItem("player_database", JSON.stringify(updated));
      setPlayers(updated);
      window.dispatchEvent(new Event('ks_players_updated'));
    }
  };

  const pushToLiveMatch = async () => {
    try {
      // 1. Sync squads with MongoDB
      await matchesApi.updatePlayers(matchId, {
        battingSquad: selectedBatting,
        bowlingSquad: selectedBowling,
      });
      // 2. Sync team names with MongoDB
      await matchesApi.updateMatch(matchId, {
        battingTeam: teamNames.teamA.toUpperCase(),
        bowlingTeam: teamNames.teamB.toUpperCase(),
      });
      alert("Match configurations successfully pushed to MongoDB!");
    } catch (e) {
      console.error(e);
      alert("Failed to sync match data with MongoDB.");
    }
  };

  return (
    <div className="ks-app ks-tw p-4 sm:p-8 bg-slate-900 min-h-screen font-sans text-slate-100 uppercase">
      {/* HEADER / NAVIGATION */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-wrap gap-4 justify-between items-center bg-slate-800 p-5 rounded-2xl border border-white/10 shadow-2xl">
        <div>
          <h1 className="text-2xl font-black text-yellow-400 tracking-widest">KS TEAM MANAGER</h1>
          <div className="flex gap-4 mt-2">
            <button onClick={() => window.open(adminPath, '_blank')} className="text-xs bg-blue-600 hover:bg-blue-500 px-4 py-1 rounded-full font-black transition">Admin Panel ↗</button>
            <button onClick={() => window.open(miniAdminPath, '_blank')} className="text-xs bg-emerald-600 hover:bg-emerald-500 px-4 py-1 rounded-full font-black transition">Mini Admin ↗</button>
            <button onClick={() => window.open(overlayPath, '_blank')} className="text-xs bg-slate-700 hover:bg-slate-600 px-4 py-1 rounded-full font-black transition border border-white/10">Scoreboard ↗</button>
          </div>
        </div>
        <button onClick={pushToLiveMatch} className="bg-green-600 hover:bg-green-500 text-white px-10 py-3 rounded-full font-black text-sm animate-pulse border-2 border-white/20">Sync Match Data Now</button>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8">

        {/* 1. MASTER PLAYER CREATOR & REGISTRY */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-white/10 shadow-xl h-fit">
          <h2 className="font-black text-blue-400 mb-6 text-sm tracking-widest">1. Registry</h2>
          <div className="space-y-4">
            <input
              className="w-full bg-slate-700 border-none p-3 rounded-lg font-bold text-white placeholder-slate-400 focus:ring-2 ring-blue-500 outline-none"
              placeholder="PLAYER NAME"
              value={newPlayer.name}
              onChange={(e) => setNewPlayer({ ...newPlayer, name: e.target.value.toUpperCase() })}
            />
            <button onClick={addPlayerToDB} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-black shadow-lg transition">Add to Database</button>
          </div>

          <div className="mt-8 border-t border-white/5 pt-6">
            <h3 className="text-xs font-black text-slate-400 mb-4 tracking-widest text-center">Master Database</h3>
            <div className="h-96 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {players.map((p) => (
                <div key={p.id} className="flex flex-col p-2 bg-slate-900 rounded-xl border border-white/5 group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs tracking-widest truncate">{p.name}</span>
                    <button onClick={() => deleteFromMaster(p.id)} className="text-red-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setSelectedBatting([...selectedBatting, p])} className="flex-1 bg-blue-600 hover:bg-blue-500 py-1 rounded text-xs font-black">ADD T-A</button>
                    <button onClick={() => setSelectedBowling([...selectedBowling, p])} className="flex-1 bg-red-600 hover:bg-red-500 py-1 rounded text-xs font-black">ADD T-B</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 2. TEAM A SELECTION */}
        <div className="lg:col-span-2 bg-slate-800 p-6 rounded-2xl border border-blue-500/20 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
          <div className="mb-6">
            <input
              className="w-full bg-transparent border-b-2 border-blue-500/30 text-2xl font-black text-blue-400 focus:border-blue-400 outline-none mb-1"
              value={teamNames.teamA}
              onChange={(e) => setTeamNames({ ...teamNames, teamA: e.target.value.toUpperCase() })}
            />
            <p className="text-xs font-black text-blue-500/50 tracking-widest">TEAM A (BATTING)</p>
          </div>

          <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 min-h-[500px]">
            {selectedBatting.length === 0 && <p className="text-center text-slate-600 text-xs mt-20">No players assigned to Team A</p>}
            <div className="space-y-2">
              {selectedBatting.map((p, i) => (
                <div key={i} className="flex justify-between items-center bg-slate-800 p-3 rounded-xl border-l-4 border-blue-500 shadow-md">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-600 font-black text-xs">{i + 1}</span>
                    <span className="font-bold text-sm tracking-widest">{p.name}</span>
                  </div>
                  <button onClick={() => setSelectedBatting(selectedBatting.filter((_, idx) => idx !== i))} className="text-red-500 font-black text-xs hover:scale-125 transition">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. TEAM B SELECTION */}
        <div className="lg:col-span-2 bg-slate-800 p-6 rounded-2xl border border-red-500/20 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
          <div className="mb-6">
            <input
              className="w-full bg-transparent border-b-2 border-red-500/30 text-2xl font-black text-red-400 focus:border-red-400 outline-none mb-1"
              value={teamNames.teamB}
              onChange={(e) => setTeamNames({ ...teamNames, teamB: e.target.value.toUpperCase() })}
            />
            <p className="text-xs font-black text-red-500/50 tracking-widest">TEAM B (BOWLING)</p>
          </div>

          <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 min-h-[500px]">
            {selectedBowling.length === 0 && <p className="text-center text-slate-600 text-xs mt-20">No players assigned to Team B</p>}
            <div className="space-y-2">
              {selectedBowling.map((p, i) => (
                <div key={i} className="flex justify-between items-center bg-slate-800 p-3 rounded-xl border-l-4 border-red-500 shadow-md">
                  <div className="flex items-center gap-4">
                    <span className="text-slate-600 font-black text-xs">{i + 1}</span>
                    <span className="font-bold text-sm tracking-widest">{p.name}</span>
                  </div>
                  <button onClick={() => setSelectedBowling(selectedBowling.filter((_, idx) => idx !== i))} className="text-red-500 font-black text-xs hover:scale-125 transition">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TeamManager;