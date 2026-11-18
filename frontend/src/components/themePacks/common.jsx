import React, { createContext, useContext, useEffect, useState } from "react";
import "./common.css";

/* ================================================================
   Shared building blocks for theme packs.
   A theme pack is an object of full-screen components (see index.js).
   Every screen component receives the same props ("ctx"):
     match, getAbsoluteUrl, getOvers, hiding, isMatchFinished,
     winnerInfo, finalWinnerTeam, finalWinnerText, bannerInfo,
     pointsTable, hasTournament, rows, kind
   ================================================================ */

/** Size factor for small "panel" overlays (1 = full screen). Set by themePacks/index.js. */
export const PanelContext = createContext(1);

export const upper = (s, fallback = "") => String(s || fallback).toUpperCase();

/** Font-size style that shrinks long text so it fits a heading slot. */
export const fit = (text, basePx, maxChars) => {
  const len = String(text || "").length;
  return { fontSize: `${Math.round(len > maxChars ? Math.max(basePx * 0.45, (basePx * maxChars) / len) : basePx)}px` };
};

/** Scale factor so a fixed-size design fits the current window. */
export function useFitScale(designW, designH) {
  const calc = () => {
    if (typeof window === "undefined") return 1;
    const w = window.innerWidth / designW;
    return designH ? Math.min(w, window.innerHeight / designH) : w;
  };
  const [scale, setScale] = useState(calc);
  useEffect(() => {
    const onResize = () => setScale(calc());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designW, designH]);
  return scale;
}

/** Logo / photo that falls back to initials when missing or broken. */
export function Logo({ src, name, className = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    const initials = String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    return <div className={`${className} tp-logo-ph`}>{initials || "?"}</div>;
  }
  return <img src={src} alt={name || ""} className={className} onError={() => setFailed(true)} />;
}

/** Full-screen 1920×1080 canvas, scaled to fit and centred. */
export function Stage({ canvasClass = "", hiding = false, background = null, children, z = 107 }) {
  const panel = useContext(PanelContext);
  const scale = useFitScale(1920, 1080) * panel;
  return (
    <div className={`tp-screen ${hiding ? "tp-hide" : ""}`} style={{ zIndex: z }}>
      <div className={`tp-canvas ${panel < 1 ? "tp-panel" : ""} ${canvasClass}`} style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {background}
        {children}
      </div>
    </div>
  );
}

/* ── Data helpers (identical numbers across every theme) ───────── */

export function tossInfo(match) {
  const toss = match.toss || {};
  const winner = toss.winner || "";
  const decision = toss.decision === "bowl" ? "BOWL" : "BAT";
  const winnerIsBatting = winner && upper(winner) === upper(match.battingTeam);
  return {
    known: !!winner,
    winner,
    decision,
    line: winner ? `${upper(winner)} WON THE TOSS AND ELECTED TO ${decision} FIRST` : "",
    winnerLogo: winnerIsBatting ? match.battingLogo : match.leagueLogo,
    loser: winnerIsBatting ? match.bowlingTeam : match.battingTeam,
    loserLogo: winnerIsBatting ? match.leagueLogo : match.battingLogo,
  };
}

export function chaseInfo(match) {
  const bpo = match.ballsPerOver || 6;
  const legal = match.legalBallCount ?? match.totalBalls ?? 0;
  const totalBalls = match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 20) * bpo;
  const ballsLeft = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, totalBalls - legal);
  const chasing = !!match.isSecondInnings && match.targetScore > 0;
  const runsNeeded = chasing ? Math.max(0, match.targetScore - match.score) : 0;
  const crr = legal > 0 ? (match.score / (legal / bpo)) : 0;
  const rrr = chasing && ballsLeft > 0 ? (runsNeeded / (ballsLeft / bpo)) : 0;
  return { bpo, legal, totalBalls, ballsLeft, chasing, runsNeeded, target: match.targetScore || 0, crr: crr.toFixed(2), rrr: rrr.toFixed(2) };
}

export const roleLabel = (r) => {
  const s = String(r || "").toLowerCase();
  if (s.includes("keep")) return "WICKET KEEPER";
  if (s.includes("bowl")) return "BOWLER";
  if (s.includes("bat")) return "BATTER";
  return "ALL ROUNDER";
};

export function squadInfo(match, getAbsoluteUrl) {
  const isTeam2 = match.squadListTeam === "team2";
  const squad = (isTeam2 ? match.bowlingSquad : match.battingSquad) || [];
  return {
    teamName: isTeam2 ? match.bowlingTeam : match.battingTeam,
    teamLogo: getAbsoluteUrl(isTeam2 ? match.leagueLogo : match.battingLogo),
    players: squad.slice(0, 16).map((p) => (typeof p === "string" ? { name: p } : p)),
  };
}

/** Photo for a player name, looked up in either squad. */
export function findPlayerPhoto(match, name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  const all = [...(match.battingSquad || []), ...(match.bowlingSquad || [])];
  return all.find((p) => p && typeof p === "object" && p.photo && String(p.name).trim().toLowerCase() === key)?.photo || null;
}

/** Cycles 0..n-1 every `ms` (used for multi-group points tables). */
export function useRotate(n, ms = 8000) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (n < 2) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % n), ms);
    return () => clearInterval(t);
  }, [n, ms]);
  return n ? i % n : 0;
}

/** Message to show instead of the points table, or null when data is ready. */
export function pointsTableMessage(pointsTable, hasTournament, group) {
  if (!hasTournament) return "This match is not part of a tournament.";
  if (!pointsTable) return "Loading points table…";
  if (pointsTable.error) return pointsTable.error;
  if (!group) return "No groups set up yet.";
  return null;
}
