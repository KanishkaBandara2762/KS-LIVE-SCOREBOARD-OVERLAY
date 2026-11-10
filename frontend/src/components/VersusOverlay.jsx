import React, { useEffect, useState } from "react";
import "./VersusOverlay.css";

// Design frame size. The whole graphic is laid out on this canvas and
// scaled to fit the OBS / browser viewport.
const STAGE_W = 1920;
const STAGE_H = 1080;

// Shield outline used by both team badges (viewBox 0 0 460 440).
const SHIELD_PATH = "M78 0 H382 L460 64 L428 332 L230 440 L32 332 L0 64 Z";
// Inner dashed "logo area" outline.
const LOGO_AREA_PATH = "M150 120 H310 L340 146 L330 270 L230 330 L130 270 L120 146 Z";
// VS badge outline (viewBox 0 0 220 190).
const VS_PATH = "M40 0 H180 L220 40 V120 L110 190 L0 120 V40 Z";

const scaleAround = (cx, cy, s) => `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`;

// "North South University" -> "NSU", "Colombo" -> "COL"
export const teamInitials = (name = "") => {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 4).toUpperCase();
};

const useStageScale = () => {
  const calc = () => Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  const [scale, setScale] = useState(calc);
  useEffect(() => {
    const onResize = () => setScale(calc());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return scale;
};

const TeamShield = ({ side, name, logoUrl, index }) => {
  const gid = `vsx-${side}`;
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = logoUrl && !logoFailed;

  return (
    <div className={`vsx-shield-wrap vsx-shield-${side}`}>
      <div className="vsx-shield-card" />
      <div className="vsx-shield-tab" />
      <div className="vsx-shield-stripes"><span /><span /></div>

      <svg className="vsx-shield-svg" width="460" height="440" viewBox="0 0 460 440" aria-hidden="true">
        <defs>
          <linearGradient id={`${gid}-metal`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7d8798" />
            <stop offset="0.5" stopColor="#3b4252" />
            <stop offset="1" stopColor="#262b38" />
          </linearGradient>
          <linearGradient id={`${gid}-ring`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="vsx-stop-a" />
            <stop offset="1" className="vsx-stop-b" />
          </linearGradient>
          <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="vsx-stop-fill-top" />
            <stop offset="1" stopColor="#0b0f1c" />
          </linearGradient>
        </defs>
        <path d={SHIELD_PATH} fill={`url(#${gid}-metal)`} />
        <path
          className="vsx-shield-ring"
          d={SHIELD_PATH}
          transform={scaleAround(230, 220, 0.93)}
          fill="none"
          stroke={`url(#${gid}-ring)`}
          strokeWidth="16"
          strokeLinejoin="miter"
        />
        <path d={SHIELD_PATH} transform={scaleAround(230, 220, 0.87)} fill={`url(#${gid}-fill)`} />
        <line x1="70" y1="168" x2="390" y2="168" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
        <path d={LOGO_AREA_PATH} fill="none" stroke="rgba(160,175,200,0.35)" strokeWidth="1.5" strokeDasharray="7 7" />
      </svg>

      <div className="vsx-shield-content">
        {showLogo ? (
          <img className="vsx-shield-logo" src={logoUrl} alt={name} onError={() => setLogoFailed(true)} />
        ) : (
          <div className="vsx-shield-initials">{teamInitials(name)}</div>
        )}
        <div className="vsx-shield-caption">{side === "a" ? "TEAM A" : "TEAM B"}</div>
      </div>

      <div className="vsx-shield-index">{index}</div>
    </div>
  );
};

const VsBadge = () => (
  <div className="vsx-vs">
    <svg className="vsx-vs-svg" width="220" height="190" viewBox="0 0 220 190" aria-hidden="true">
      <defs>
        <linearGradient id="vsx-vs-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9d1de" />
          <stop offset="0.5" stopColor="#6b7486" />
          <stop offset="1" stopColor="#3a4150" />
        </linearGradient>
        <linearGradient id="vsx-vs-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a3150" />
          <stop offset="1" stopColor="#12162a" />
        </linearGradient>
      </defs>
      <path d={VS_PATH} fill="url(#vsx-vs-metal)" />
      <path d={VS_PATH} transform={scaleAround(110, 95, 0.86)} fill="url(#vsx-vs-fill)" />
      <path
        className="vsx-vs-chevron"
        d="M38 128 L110 168 L182 128"
        fill="none"
        stroke="#8b5cf6"
        strokeWidth="6"
        strokeLinejoin="round"
      />
    </svg>
    <div className="vsx-vs-text">VS</div>
    <div className="vsx-vs-caption">HEAD TO HEAD</div>
  </div>
);

/**
 * Broadcast "Versus" screen. Shared by every theme.
 * Background is semi-transparent so the live camera feed stays visible.
 */
const VersusOverlay = ({ match, teamALogoUrl, teamBLogoUrl }) => {
  const scale = useStageScale();

  const teamA = match.battingTeam || "TEAM A";
  const teamB = match.bowlingTeam || "TEAM B";
  const year = (String(match.matchDate || "").match(/\d{4}/) || [new Date().getFullYear()])[0];
  const kicker = `${match.matchTitle || "LIVE CRICKET"}  /  ${year}`;
  const title = match.tournamentName || "CRICKET CHAMPIONSHIP";
  const matchChip = match.matchNumber ? `MATCH ${match.matchNumber}` : (match.bowlingPrefix || `${match.maxOvers || 20} OVERS`);
  const rightMeta = match.matchNumber ? `MATCH DAY  /  ${match.matchNumber}` : (match.venueName || "");

  const toss = match.toss || {};
  const hasToss = !!(toss.winner && toss.decision);
  const stripLabel = hasToss ? "TOSS UPDATE" : "MATCH INFO";
  const stripText = hasToss
    ? `${toss.winner} WON THE TOSS AND ELECTED TO ${toss.decision === "bowl" ? "BOWL" : "BAT"} FIRST`
    : [match.venueName, `${match.maxOvers || 20} OVERS MATCH`].filter(Boolean).join("  •  ");

  // Small caption above each name bar: batting/bowling order once the toss is known.
  const roleOf = (team, fallback) => {
    if (!hasToss) return fallback;
    const wonToss = String(toss.winner).trim().toLowerCase() === String(team).trim().toLowerCase();
    const batsFirst = wonToss ? toss.decision === "bat" : toss.decision === "bowl";
    return batsFirst ? "BATTING FIRST" : "BOWLING FIRST";
  };

  return (
    <div className="vsx-root">
      {/* Semi-transparent background (live match shows through) */}
      <div className="vsx-bg">
        <div className="vsx-bg-tint" />
        <div className="vsx-bg-stripes" />
        <div className="vsx-bg-glow vsx-bg-glow-a" />
        <div className="vsx-bg-glow vsx-bg-glow-b" />
      </div>

      <div className="vsx-stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {/* Header */}
        <div className="vsx-header">
          <div className="vsx-kicker">{kicker}</div>
          <div className="vsx-kicker-line" />
          <h1 className="vsx-title">{title}</h1>
        </div>
        <div className="vsx-divider"><span /></div>

        <div className="vsx-live">
          <div className="vsx-live-pill"><i />LIVE BROADCAST</div>
          {rightMeta && <div className="vsx-live-meta">{rightMeta}</div>}
        </div>

        {/* Badges */}
        <div className="vsx-center-line" />
        <TeamShield side="a" name={teamA} logoUrl={teamALogoUrl} index="01" />
        <VsBadge />
        <TeamShield side="b" name={teamB} logoUrl={teamBLogoUrl} index="02" />

        {/* Name bars */}
        <div className="vsx-chip"><span>{matchChip}</span></div>

        <div className="vsx-bar vsx-bar-a">
          <div className="vsx-bar-label">{roleOf(teamA, "TEAM A")}</div>
          <div className="vsx-bar-body">
            <i className="vsx-bar-slash" />
            <span className="vsx-bar-name">{teamA}</span>
            <i className="vsx-bar-shine" />
          </div>
        </div>
        <div className="vsx-bar-sep" />
        <div className="vsx-bar vsx-bar-b">
          <div className="vsx-bar-label">{roleOf(teamB, "TEAM B")}</div>
          <div className="vsx-bar-body">
            <span className="vsx-bar-name">{teamB}</span>
            <i className="vsx-bar-slash" />
            <i className="vsx-bar-shine" />
          </div>
        </div>

        {/* Toss / info strip */}
        <div className="vsx-strip">
          <div className="vsx-strip-label">{stripLabel}</div>
          <div className="vsx-strip-text">{stripText}</div>
          <div className="vsx-strip-mark"><span /><span /></div>
        </div>
        <div className="vsx-footer-line" />
      </div>
    </div>
  );
};

export default VersusOverlay;
