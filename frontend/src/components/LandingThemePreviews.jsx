import { useEffect, useRef, useState } from "react";
import ModernOverlayThemes from "./ModernOverlayThemes";
import LightningBar from "./LightningBar";
import "./LandingThemePreviews.css";

/* ================================================================
   LandingThemePreviews
   Renders the REAL overlay themes (unchanged) on a fixed sample match,
   scaled to fit each gallery card, over one professional cricket
   match background. Static sample data; no timers.
   ================================================================ */

// Professional cricket match background shared by every preview.
export const MATCH_BACKGROUND = "/images/stadiums/stadium_night.png";

// Stage size the overlays are designed for; scaled down to each card.
const STAGE_W = 1920;

const SAMPLE_MATCH = {
  battingTeam: "Thunder XI",
  bowlingTeam: "Storm Kings",
  battingLogo: "",
  leagueLogo: "",
  matchType: "T20",
  matchStatus: "LIVE",
  tournamentName: "KS LIVE T20 CUP",
  score: 142,
  wickets: 3,
  legalBallCount: 100,
  ballsPerOver: 6,
  maxOvers: 20,
  isSecondInnings: true,
  targetScore: 165,
  targetBalls: 120,
  partnership: { runs: 48, balls: 30 },
  player1: { name: "K. Silva", runs: 54, balls: 32, onStrike: true },
  player2: { name: "R. Dias", runs: 21, balls: 14, onStrike: false },
  bowler: { name: "M. Perera", wickets: 2, runs: 28, overs: 3.4 },
  recentBalls: ["1", "4", "0", "2", "6", "W"],
};

const SAMPLE_PROPS = {
  showEvent: false,
  eventType: null,
  eventWicketName: "",
  getHowOutText: () => "",
  scoreAnimClass: "",
  getOvers: (balls) => `${Math.floor(balls / 6)}.${balls % 6}`,
  getAbsoluteUrl: (url) => url || "",
  TeamLogo: ({ teamName, size }) => (
    <span
      className="ltp-logo-fallback"
      style={{ width: size, height: size, lineHeight: `${size}px` }}
    >
      {(teamName || "?").charAt(0)}
    </span>
  ),
};

// Scales a 1920-wide stage to the width of the box it sits in.
function FitStage({ children, className }) {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const update = () => setScale(el.clientWidth / STAGE_W);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={boxRef} className={`ltp-root ${className || ""}`}>
      <div className="ltp-stage" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

// Skin themes draw on one of the base layouts; preview them with that layout.
const PREVIEW_LAYOUTS = {
  APEX: "ICC_GLOBAL",
  SHAKTI: "ICC_GLOBAL",
  DIAMOND: "SKY_HYPERION",
  VOLT: "FOX_STRIKE",
  THUNDER: "FOX_STRIKE",
  BLITZ: "JIO_TITAN",
  FRANCHISE: "JIO_TITAN",
  ELITE: "SUPERSPORT_AURA",
};

// previewId is the overlay theme ID, e.g. "APEX" or "SHAKTI".
export function ThemePreview({ previewId, className }) {
  if (!previewId) return null;
  if (previewId === "LIGHTNING_BAR") {
    return (
      <FitStage className={className}>
        <div className="ltp-bottom">
          <LightningBar match={SAMPLE_MATCH} getOvers={SAMPLE_PROPS.getOvers} getAbsoluteUrl={SAMPLE_PROPS.getAbsoluteUrl} TeamLogo={SAMPLE_PROPS.TeamLogo} />
        </div>
      </FitStage>
    );
  }
  return (
    <FitStage className={className}>
      <ModernOverlayThemes themeId={PREVIEW_LAYOUTS[previewId] || previewId} match={SAMPLE_MATCH} {...SAMPLE_PROPS} />
    </FitStage>
  );
}
