import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { matchesApi, tournamentsApi } from "../api";
import { db } from "../firebase";
import { ref, onValue } from "firebase/database";
import { PlayIcon } from "@heroicons/react/24/solid";
import { Activity, ArrowUpRight, BarChart3, Calendar, Check, Circle, CircleDot, ClipboardList, Coins, Crown, Lock, MapPin, Play, Star, Trophy, Umbrella, Zap } from 'lucide-react';
import BroadcastTicker from "./BroadcastTicker";
import ModernOverlayThemes from "./ModernOverlayThemes";
import VersusOverlay from "./VersusOverlay";
import "./BroadcastScreens.css";
import "./BroadcastLogo.css";
import "./ks-premium.css";
import "./ThemeNewKSColor.css";
import "./ModernEventFx.css";
import "./newipl.css";
import "./IPL2026Theme.css";
import "./neon-vavuniya.css";
import "./t20-blitz.css";
import "./sl-broadcast.css";
import "./gold-championship.css";

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);
const isMongoDB = (id) => true;

const getAbsoluteUrl = (url, cacheBuster) => {
  if (!url) return '';
  let finalUrl = url;
  if (!url.startsWith('http') && !url.startsWith('blob:') && !url.startsWith('data:')) {
    const baseUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);
    finalUrl = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }
  return cacheBuster && !url.startsWith('data:') && !url.startsWith('blob:') ? `${finalUrl}?cb=${cacheBuster}` : finalUrl;
};

// ── TeamLogo: Shared logo component with fallback placeholder ─────────────
// Shows team initials on a translucent circle when the logo src is missing
// or fails to load. Resets automatically when src changes (live logo swap).
const TeamLogo = React.memo(function TeamLogo({ src, teamName, className, size = 64, style }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setFailed(false); }, [src]);

  const initials = React.useMemo(() => {
    if (!teamName) return '?';
    const words = teamName.trim().split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words.map(w => w[0]).join('').slice(0, 3).toUpperCase();
  }, [teamName]);

  if (!src || failed) {
    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.15)',
          borderRadius: '50%',
          width: size,
          height: size,
          minWidth: size,
          fontSize: Math.round(size * 0.28),
          fontWeight: 900,
          color: '#fff',
          flexShrink: 0,
          letterSpacing: '0.5px',
          fontStyle: 'normal',
          textShadow: 'none',
          border: '2px solid rgba(255,255,255,0.25)',
          boxSizing: 'border-box',
          ...style,
        }}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      className={['team-logo-img', className].filter(Boolean).join(' ')}
      alt={teamName || 'Team Logo'}
      style={{ width: size, height: size, minWidth: size, maxWidth: size, flexShrink: 0, ...style }}
      onError={() => setFailed(true)}
    />
  );
});


function useDelayUnmount(isMounted, delayTime) {
  const [shouldRender, setShouldRender] = React.useState(false);
  React.useEffect(() => {
    let timeoutId;
    if (isMounted && !shouldRender) {
      setShouldRender(true);
    } else if (!isMounted && shouldRender) {
      timeoutId = setTimeout(() => setShouldRender(false), delayTime);
    }
    return () => clearTimeout(timeoutId);
  }, [isMounted, delayTime, shouldRender]);
  return shouldRender;
}

// Netlify Functions cannot host persistent Socket.IO connections, so production
// falls back to REST polling. VITE_REALTIME_MODE=socket opts back in.
const USE_SOCKET =
  import.meta.env.VITE_REALTIME_MODE === 'socket' ||
  (!import.meta.env.PROD && import.meta.env.VITE_REALTIME_MODE !== 'polling');
const LIVE_POLL_MS =
  Number(import.meta.env.VITE_LIVE_POLL_MS) || (import.meta.env.PROD ? 3000 : 30000);

const ScorecardDisplay = () => {
  const { matchId, tournamentId } = useParams();
  const dbPath = matchId ? `matches/${matchId}/live_match` : 'live_match';
  const [match, setMatch] = useState(null);
  const [showEvent, setShowEvent] = useState(false);
  const [currentEvent, setCurrentEvent] = useState(null);
  const [winnerInfo, setWinnerInfo] = useState(null);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  const [subErrorMessage, setSubErrorMessage] = useState('');

  // --- Tournament leaderboard cards (computed on the server from ball-by-ball data) ---
  const [publicBoards, setPublicBoards] = useState(null);
  const boardsMatchId = match?.matchId || matchId;
  const boardsVisible = !!(match?.showTournamentMostRuns || match?.showTournamentMostWickets);
  useEffect(() => {
    if (!boardsVisible || !boardsMatchId) return;
    let alive = true;
    const load = () => fetch(`${API_URL}/api/public/match/${boardsMatchId}/leaderboards`)
      .then((r) => r.json()).then((d) => { if (alive && d?.success) setPublicBoards(d); }).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [boardsVisible, boardsMatchId]);

  // --- Animation Hooks ---
  const isMatchFinishedCheck = ["finished", "match ended"].includes(String(match?.matchStatus || "").toLowerCase());
  const isTossMounted = !!(match?.showToss && !winnerInfo && !match?.showVersus);
  const isScorecardMounted = !!(match && !winnerInfo && !(match?.showSummary || isMatchFinishedCheck) && !match?.showVersus);
  const renderToss = useDelayUnmount(isTossMounted, 500);
  const renderScorecard = useDelayUnmount(isScorecardMounted, 500);

  // ── OBS Overlay Refresh state ──────────────────────────────────
  // refreshKey increments each time Admin Panel fires a refresh signal.
  // The useEffect below watches it and re-fetches the latest snapshot.
  const [refreshKey, setRefreshKey] = useState(0);
  const lastRefreshTs = useRef({ main: 0, ballByBall: 0 });

  // ── Animation state ───────────────────────────────────────────
  const [scoreAnimClass, setScoreAnimClass] = useState("");
  const [boardAnimClass, setBoardAnimClass] = useState("");
  const [bowlerAnimClass, setBowlerAnimClass] = useState("");
  // Phones: lay the overlay out on a fixed-width canvas and scale it to the screen width.
  const [viewportSize, setViewportSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const handleResize = () => setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  // Smaller design width = bigger text on phones. Content wider than this is cut off on phones.
  const OVERLAY_DESIGN_WIDTH = 1000;
  const isPhoneScreen = viewportSize.w < 768;
  const phoneScale = isPhoneScreen ? viewportSize.w / OVERLAY_DESIGN_WIDTH : 1;
  const phoneCanvasStyle = isPhoneScreen
    ? {
        width: OVERLAY_DESIGN_WIDTH,
        height: viewportSize.h / phoneScale,
        transform: `scale(${phoneScale})`,
        transformOrigin: "0 0",
        left: 0,
        top: 0,
        right: "auto",
        bottom: "auto",
      }
    : undefined;
  const [newOverAnim, setNewOverAnim] = useState(false);
  const [showInfoStrip, setShowInfoStrip] = useState(false);
  // FIX 5: KS Premium over-break chase display state
  const [showOverBreakChase, setShowOverBreakChase] = useState(false);
  const prevScore = useRef(null);
  const prevWickets = useRef(null);
  const prevEventTime = useRef(null);
  const prevBannerEventTime = useRef(null);
  // firstLoadDoneRef: prevents stale eventTrigger in Firebase from replaying
  // animations after a page load/OBS refresh. On the very first snapshot we
  // seed prevBannerEventTime with whatever eventTime is already in the DB so
  // only NEW events (changed eventTime) will trigger animations.
  const firstLoadDoneRef = useRef(false);
  const eventQueueRef = useRef([]);
  const eventPlayingRef = useRef(false);
  const currentEventRef = useRef(null);
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
    ICC_GLOBAL: { main: "theme-icc-global", isModernRenderer: true, animClass: "anim-icc-global" },
    SKY_HYPERION: { main: "theme-sky-hyperion", isModernRenderer: true, animClass: "anim-sky-hyperion" },
    JIO_TITAN: { main: "theme-jio-titan", isModernRenderer: true, animClass: "anim-jio-titan" },
    FOX_STRIKE: { main: "theme-fox-strike", isModernRenderer: true, animClass: "anim-fox-strike" },
    SUPERSPORT_AURA: { main: "theme-supersport-aura", isModernRenderer: true, animClass: "anim-supersport-aura" },
    APEX: { main: "theme-apex", isModernRenderer: true, animClass: "" },
    DIAMOND: { main: "theme-diamond", isModernRenderer: true, animClass: "" },
    VOLT: { main: "theme-volt", isModernRenderer: true, animClass: "" },
    THUNDER: { main: "theme-thunder", isModernRenderer: true, animClass: "" },
    BLITZ: { main: "theme-blitz", isModernRenderer: true, animClass: "" },
    ELITE: { main: "theme-elite", isModernRenderer: true, animClass: "" },
    FRANCHISE: { main: "theme-franchise", isModernRenderer: true, animClass: "" },
    SHAKTI: { main: "theme-shakti", isModernRenderer: true, animClass: "" },
    IPL_GOLD: { main: "bg-slate-900", accent: "bg-yellow-400", text: "text-yellow-400", batsman: "bg-yellow-400", bowler: "from-blue-800 to-blue-950", border: "border-yellow-500", chase: "bg-blue-900", animClass: "anim-ipl-gold" },
    SKY_PRO: { main: "bg-white", accent: "bg-red-600", text: "text-red-600", batsman: "bg-slate-100", bowler: "from-red-600 to-red-800", border: "border-red-600", chase: "bg-slate-900", animClass: "anim-sky-pro" },
    NEON_VAVUNIYA: { main: "theme-neon-pulse", accent: "bg-lime-500", text: "text-lime-400", batsman: "bg-zinc-900", bowler: "from-zinc-800 to-black", border: "border-lime-500", chase: "bg-zinc-800", animClass: "anim-neon-vavuniya" },
    MINIMAL_DARK: { main: "bg-zinc-950", accent: "bg-white", text: "text-white", batsman: "bg-zinc-800", bowler: "from-zinc-700 to-zinc-900", border: "border-white/20", chase: "bg-black", animClass: "anim-minimal-dark" },
    CLASSIC_DARK: { main: "theme-classic-dark", accent: "bg-gray-300", text: "text-gray-200", batsman: "theme-classic-dark-bat", bowler: "from-gray-800 to-gray-950", border: "border-gray-500", chase: "bg-gray-900", animClass: "anim-classic-dark" },
    T20_NEON: { main: "theme-t20-blitz", accent: "theme-t20-neon-accent", text: "text-cyan-300", batsman: "theme-t20-neon-bat", bowler: "from-purple-900 to-fuchsia-950", border: "border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.4)]", chase: "bg-fuchsia-900", animClass: "anim-t20-neon" },
    WC_BLUE_PURPLE: { main: "theme-wc-bp", accent: "theme-wc-bp-accent", text: "text-blue-300", batsman: "theme-wc-bp-bat", bowler: "from-indigo-900 to-purple-950", border: "border-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.4)]", chase: "bg-indigo-900", animClass: "anim-wc-bp" },
    GOLD_CHAMPIONSHIP: { main: "theme-gold-championship", accent: "theme-gold-champ-accent", text: "text-amber-300", batsman: "theme-gold-champ-bat", bowler: "from-amber-900 to-yellow-950", border: "border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]", chase: "bg-amber-950", animClass: "anim-gold-champ" },
    NEW_KS_COLOR: { animClass: "anim-ksp" },
    KS_SPECIAL: { main: "theme-ks-special", accent: "theme-ks-special-accent", text: "text-teal-300", batsman: "theme-ks-special-bat", bowler: "from-gray-800 to-gray-900", border: "border-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.35)]", chase: "theme-ks-special-chase", animClass: "anim-ks-special" },
    WC2026: { main: "theme-wc2026", accent: "theme-wc2026-accent", text: "theme-wc2026-score", batsman: "theme-wc2026-bat", bowler: "theme-wc2026-bowler", border: "theme-wc2026-border", chase: "theme-wc2026-chase", isWC2026: true, animClass: "anim-wc2026" },
    SL_BROADCAST: { main: "theme-sl-broadcast2", accent: "theme-sl-broadcast-accent", text: "theme-sl-broadcast-score", batsman: "theme-sl-broadcast-bat", bowler: "theme-sl-broadcast-bowler", border: "theme-sl-broadcast-border", chase: "theme-sl-broadcast-chase", animClass: "anim-sl-broadcast" },
    DC_BLUE: { main: "bg-blue-900", accent: "bg-cyan-400", text: "text-cyan-400", batsman: "bg-blue-950 text-white border-x border-blue-800", bowler: "from-blue-800 to-blue-950", border: "border-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.3)]", chase: "bg-blue-950", animClass: "anim-ipl-gold" },
    ABUDHABI_T10: { main: "theme-abudhabi-t10", isAbuDhabiT10: true, animClass: "anim-t10-entrance" }
  }), []);

  // ── Reusable animation trigger helper ──────────────────────────
  const triggerAnim = useCallback((setter, className, duration = 1000) => {
    setter(className);
    const t = setTimeout(() => setter(""), duration);
    return t;
  }, []);

  const playQueuedEvent = useCallback(() => {
    if (eventPlayingRef.current) return;
    const nextEvent = eventQueueRef.current.shift();
    if (!nextEvent) return;
    eventPlayingRef.current = true;
    currentEventRef.current = nextEvent;
    setCurrentEvent(nextEvent);
    setShowEvent(true);
    let duration = 3500;
    if (nextEvent.type === "FOUR") duration = 2500;
    else if (nextEvent.type === "SIX") duration = 3000;
    else if (nextEvent.type === "WICKET") duration = 3500;
    
    if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
    eventTimerRef.current = setTimeout(() => {
      setShowEvent(false);
      eventPlayingRef.current = false;
      currentEventRef.current = null;
      setCurrentEvent(null);
      playQueuedEvent();
    }, duration);
  }, []);

  const queueEvent = useCallback((event) => {
    if (!event?.type || !event?.time) return;
    const exists = eventQueueRef.current.some((queued) => queued.time === event.time && queued.type === event.type);
    if (exists || (currentEventRef.current?.time === event.time && currentEventRef.current?.type === event.type)) return;
    eventQueueRef.current.push(event);
    playQueuedEvent();
  }, [playQueuedEvent]);

  // ── DUAL-MODE DATA SYNC (MongoDB/Socket.IO or Legacy Firebase) ────────────────────────────
  useEffect(() => {
    // ─── Merge helper: socket payloads are often PARTIAL (only changed fields).
    // We must MERGE into existing state, not replace, to preserve themeID/teamNames etc.
    const mergeMatchState = (prev, incoming) => {
      if (!incoming) return prev;
      if (!prev) {
        // First load — flatten overlaySettings into top-level fields
        if (incoming.overlaySettings) {
          const os = incoming.overlaySettings;
          return {
            ...incoming,
            themeID: os.themeID || 'IPL_GOLD',
            battingLogo: getAbsoluteUrl(os.battingLogo || incoming.team1Logo || incoming.battingLogo || '', refreshKey),
            leagueLogo: getAbsoluteUrl(os.leagueLogo || incoming.team2Logo || incoming.leagueLogo || '', refreshKey),
            overlayMode: os.overlayMode || 'full',
            showVersus: !!os.showVersus,
            showSummary: !!os.showSummary,
            showMatchSituation: !!os.showMatchSituation,
            showToss: !!os.showToss,
            showPlayerOfMatch: !!os.showPlayerOfMatch,
            showPartnership: !!os.showPartnership,
            showSquadList: !!os.showSquadList,
            squadListTeam: os.squadListTeam || '',
            showMatchWon: !!os.showMatchWon,
            showNeedRun: !!os.showNeedRun,
            showNeedRunStrip: !!os.showNeedRunStrip,
            showLastOut: !!os.showLastOut,
            showCustomText: !!os.showCustomText,
            customText: os.customText || '',
            show4or6Animation: os.show4or6Animation !== false,
            scoreboardOnly: !!os.scoreboardOnly,
            showTournamentMostRuns: !!os.showTournamentMostRuns,
            showTournamentMostWickets: !!os.showTournamentMostWickets,
            showTournamentBoundaries: !!os.showTournamentBoundaries,
            showPointsTable: !!os.showPointsTable,
            showUpcoming: !!os.showUpcoming,
            showResults: !!os.showResults,
            potmName: os.potmName || '',
            potmTeam: os.potmTeam || '',
            potmFigures: os.potmFigures || '',
            potmPhoto: os.potmPhoto || '',
          };
        }
        return incoming;
      }

      // Merge: start with existing state, overlay changed fields
      const merged = { ...prev, ...incoming };

      // If the update includes overlaySettings, always extract theme fields
      if (incoming.overlaySettings) {
        const os = incoming.overlaySettings;
        merged.themeID = os.themeID || prev.themeID || 'IPL_GOLD';
        merged.battingLogo = getAbsoluteUrl(os.battingLogo || prev.battingLogo || prev.team1Logo || '', refreshKey);
        merged.leagueLogo = getAbsoluteUrl(os.leagueLogo || prev.leagueLogo || prev.team2Logo || '', refreshKey);
        merged.overlayMode = os.overlayMode || prev.overlayMode || 'full';
        merged.showVersus = os.showVersus ?? prev.showVersus ?? false;
        merged.showSummary = os.showSummary ?? prev.showSummary ?? false;
        merged.showMatchSituation = os.showMatchSituation ?? prev.showMatchSituation ?? false;
        merged.showToss = os.showToss ?? prev.showToss ?? false;
        // Broadcast Graphics Panel fields
        merged.showPlayerOfMatch = os.showPlayerOfMatch ?? prev.showPlayerOfMatch ?? false;
        merged.showPartnership = os.showPartnership ?? prev.showPartnership ?? false;
        merged.showSquadList = os.showSquadList ?? prev.showSquadList ?? false;
        if (os.squadListTeam !== undefined) merged.squadListTeam = os.squadListTeam;
        merged.showMatchWon = os.showMatchWon ?? prev.showMatchWon ?? false;
        merged.showNeedRun = os.showNeedRun ?? prev.showNeedRun ?? false;
        merged.showNeedRunStrip = os.showNeedRunStrip ?? prev.showNeedRunStrip ?? false;
        merged.showLastOut = os.showLastOut ?? prev.showLastOut ?? false;
        merged.showCustomText = os.showCustomText ?? prev.showCustomText ?? false;
        if (os.customText !== undefined) merged.customText = os.customText;
        merged.show4or6Animation = os.show4or6Animation ?? prev.show4or6Animation ?? true;
        merged.scoreboardOnly = os.scoreboardOnly ?? prev.scoreboardOnly ?? false;
        merged.overlayHidden = os.overlayHidden ?? prev.overlayHidden ?? false;
        merged.showTournamentMostRuns = os.showTournamentMostRuns ?? prev.showTournamentMostRuns ?? false;
        merged.showTournamentMostWickets = os.showTournamentMostWickets ?? prev.showTournamentMostWickets ?? false;
        merged.showTournamentBoundaries = os.showTournamentBoundaries ?? prev.showTournamentBoundaries ?? false;
        merged.showPointsTable = os.showPointsTable ?? prev.showPointsTable ?? false;
        merged.showUpcoming = os.showUpcoming ?? prev.showUpcoming ?? false;
        merged.showResults = os.showResults ?? prev.showResults ?? false;
        if (os.potmName !== undefined) merged.potmName = os.potmName;
        if (os.potmTeam !== undefined) merged.potmTeam = os.potmTeam;
        if (os.potmFigures !== undefined) merged.potmFigures = os.potmFigures;
        if (os.potmPhoto !== undefined) merged.potmPhoto = os.potmPhoto;
      }

      // Fallback: if flat logo fields came in (relative URL from older code paths),
      // convert them to absolute URLs so the overlay img src works correctly.
      if (!incoming.overlaySettings) {
        if (incoming.battingLogo !== undefined) {
          merged.battingLogo = getAbsoluteUrl(incoming.battingLogo || prev.battingLogo || '', refreshKey);
        }
        if (incoming.leagueLogo !== undefined) {
          merged.leagueLogo = getAbsoluteUrl(incoming.leagueLogo || prev.leagueLogo || '', refreshKey);
        }
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

        // On first data arrival, seed prevBannerEventTime with the existing
        // eventTime so stale DB events don’t replay as animations.
        if (!firstLoadDoneRef.current) {
          firstLoadDoneRef.current = true;
          if (merged.eventTime) prevBannerEventTime.current = merged.eventTime;
        }

        if (['FOUR', 'SIX', 'WICKET'].includes(merged.eventTrigger) &&
            merged.eventTime && merged.eventTime !== prevBannerEventTime.current) {
          prevBannerEventTime.current = merged.eventTime;
          queueEvent({
            type: merged.eventTrigger,
            time: merged.eventTime,
            id: merged.eventId || `${merged.eventTrigger}_${merged.eventTime}`,
            lastWicketName: merged.lastWicketName,
            lastWicketRuns: merged.lastWicketRuns,
            lastWicketBalls: merged.lastWicketBalls,
            lastWicketDismissal: merged.lastWicketDismissal,
            lastWicketFielder: merged.lastWicketFielder,
          });
        }

        return merged;
      });
    };

    if (tournamentId) {
      console.log('[ScorecardDisplay] Initializing Tournament mode for tournamentId:', tournamentId);
      
      const fetchTournamentAndMatch = () => {
        tournamentsApi.publicGet(tournamentId)
          .then(res => {
            if (res.subscriptionExpired || res.code === 'OBS_SUBSCRIPTION_REQUIRED') {
              setSubscriptionExpired(true);
              setSubErrorMessage(res.error || 'Broadcasting subscription expired.');
              return;
            }
            if (res.tournament && res.tournament.currentMatchId) {
              handleIncomingData(res.tournament.currentMatchId);
            }
          })
          .catch(e => {
            if (e.status === 403 || e.message?.includes('subscription')) {
              setSubscriptionExpired(true);
              setSubErrorMessage('OBS Broadcasting access has expired. Please renew your subscription.');
            }
            console.error('Tournament fetch failed:', e);
          });
      };

      fetchTournamentAndMatch();

      let socket;
      let obsKeepaliveInterval;
      let obsPollInterval;

      if (USE_SOCKET) {
      import('socket.io-client').then(({ io }) => {
        socket = io(`${API_URL}/overlay`, {
          query: { tournamentId },
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

        socket.on('subscription:expired', (errData) => {
          console.warn('[ScorecardDisplay] Subscription expired for this broadcast:', errData);
          setSubscriptionExpired(true);
          setSubErrorMessage(errData?.message || 'OBS Broadcasting access has expired.');
        });

        // FIX 1: In Socket.IO v4, reconnect fires on socket.io (Manager), not socket.
        // Using 'connect' is the correct cross-version way — fires on first connect AND every reconnect.
        socket.on('connect', () => {
          console.log('[ScorecardDisplay] Socket connected/reconnected — resyncing state...');
          fetchTournamentAndMatch();
        });

        socket.on('matchSwitched', ({ match }) => {
          console.log('[ScorecardDisplay] Match switched to new match:', match?.matchId);
          if (match) {
            handleIncomingData(match);
          } else {
            fetchTournamentAndMatch();
          }
        });

        // Live update events — all partial updates, merged into state
        socket.on('score:update', (data) => handleIncomingData(data));
        socket.on('score:correction', (data) => handleIncomingData(data));
        socket.on('players:update', (data) => handleIncomingData(data));
        socket.on('ticker:update', (data) => handleIncomingData(data));
        socket.on('match:status', (data) => handleIncomingData(data));

        // OBS Overlay Refresh — re-fetch snapshot without hard reload
        socket.on('overlay:refresh', ({ type, ts } = {}) => {
          const field = type === 'ballByBall' ? 'ballByBall' : 'main';
          if (ts && ts <= lastRefreshTs.current[field]) return; // dedupe
          lastRefreshTs.current[field] = ts || Date.now();
          console.log('[ScorecardDisplay] overlay:refresh (tournament) received — re-syncing...');
          fetchTournamentAndMatch();
          setRefreshKey(k => k + 1);
        });

        socket.on('connect_error', (err) => {
          console.warn('[ScorecardDisplay] Socket connect error:', err.message);
        });

        // FIX 2: Send a keepalive ping every 20s so OBS does not throttle/kill the idle socket.
        obsKeepaliveInterval = setInterval(() => {
          if (socket.connected) {
            socket.emit('ping');
          }
        }, 20000);

      }).catch(e => console.error('Failed to load socket client:', e));
      }

      // Polling safety net — re-fetch from REST. On Netlify Functions this is
      // the primary update channel, so it runs every few seconds.
      obsPollInterval = setInterval(() => {
        fetchTournamentAndMatch();
      }, LIVE_POLL_MS);

      return () => {
        if (socket) socket.disconnect();
        if (obsKeepaliveInterval) clearInterval(obsKeepaliveInterval);
        if (obsPollInterval) clearInterval(obsPollInterval);
        if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
      };
    } else if (isMongoDB(matchId)) {
      console.log('[ScorecardDisplay] Initializing MongoDB mode for matchId:', matchId);
      
      // Initial full load from public REST endpoint (no auth required — OBS browser source)
      matchesApi.overlay(matchId)
        .then(res => {
          if (res.subscriptionExpired || res.code === 'OBS_SUBSCRIPTION_REQUIRED') {
            setSubscriptionExpired(true);
            setSubErrorMessage(res.error || 'Broadcasting subscription expired.');
            return;
          }
          if (res.overlay) handleIncomingData({ ...res.overlay, overlaySettings: res.overlay.settings });
        })
        .catch(e => {
          if (e.status === 403 || e.message?.includes('subscription')) {
            setSubscriptionExpired(true);
            setSubErrorMessage('OBS Broadcasting access has expired. Please renew your subscription.');
          }
          console.error('MongoDB initial fetch failed:', e);
        });

      // Real-time Socket.IO setup
      let socket;
      let obsKeepaliveInterval;
      let obsPollInterval;

      // Public polling endpoint — no auth needed, safe for OBS
      const fetchMatchSnapshot = () => {
        matchesApi.overlay(matchId)
          .then(res => {
            if (res.subscriptionExpired || res.code === 'OBS_SUBSCRIPTION_REQUIRED') {
              setSubscriptionExpired(true);
              setSubErrorMessage(res.error || 'Broadcasting subscription expired.');
              return;
            }
            if (res.overlay) handleIncomingData({ ...res.overlay, overlaySettings: res.overlay.settings });
          })
          .catch(e => {
            if (e.status === 403 || e.message?.includes('subscription')) {
              setSubscriptionExpired(true);
            }
          });
      };

      if (USE_SOCKET) {
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

        socket.on('subscription:expired', (errData) => {
          console.warn('[ScorecardDisplay] Subscription expired for this broadcast:', errData);
          setSubscriptionExpired(true);
          setSubErrorMessage(errData?.message || 'OBS Broadcasting access has expired.');
        });

        // FIX 1: In Socket.IO v4, reconnect fires on socket.io (Manager), not socket.
        // Using 'connect' is the correct cross-version way — fires on first connect AND every reconnect.
        socket.on('connect', () => {
          console.log('[ScorecardDisplay] Socket connected/reconnected — resyncing state...');
          fetchMatchSnapshot();
        });

        // Live update events — all partial updates, merged into state
        socket.on('score:update', (data) => handleIncomingData(data));
        socket.on('score:correction', (data) => handleIncomingData(data));
        socket.on('players:update', (data) => handleIncomingData(data));
        socket.on('ticker:update', (data) => handleIncomingData(data));
        socket.on('match:status', (data) => handleIncomingData(data));

        // OBS Overlay Refresh — re-fetch snapshot without hard reload
        socket.on('overlay:refresh', ({ type, ts } = {}) => {
          const field = type === 'ballByBall' ? 'ballByBall' : 'main';
          if (ts && ts <= lastRefreshTs.current[field]) return; // dedupe
          lastRefreshTs.current[field] = ts || Date.now();
          console.log('[ScorecardDisplay] overlay:refresh received — re-syncing...');
          fetchMatchSnapshot();
          setRefreshKey(k => k + 1);
        });

        socket.on('connect_error', (err) => {
          console.warn('[ScorecardDisplay] Socket connect error:', err.message);
        });

        // FIX 2: Send a keepalive ping every 20s so OBS does not throttle/kill the idle socket.
        obsKeepaliveInterval = setInterval(() => {
          if (socket.connected) {
            socket.emit('ping');
          }
        }, 20000);

      }).catch(e => console.error('Failed to load socket client:', e));
      }

      // Polling safety net — re-fetch from REST. On Netlify Functions this is
      // the primary update channel, so it runs every few seconds.
      obsPollInterval = setInterval(() => {
        fetchMatchSnapshot();
      }, LIVE_POLL_MS);

      return () => {
        if (socket) socket.disconnect();
        if (obsKeepaliveInterval) clearInterval(obsKeepaliveInterval);
        if (obsPollInterval) clearInterval(obsPollInterval);
        if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
      };
    } else {
      // Legacy Firebase — full state on every update
      console.log('[ScorecardDisplay] Initializing Firebase Legacy mode. Path:', dbPath);
      const unsubscribe = onValue(ref(db, dbPath), (snapshot) => {
        const val = snapshot.val();
        if (val) {
          // On first Firebase snapshot, seed prevBannerEventTime to suppress
          // stale events already in the DB (e.g. after OBS refresh or logo upload).
          if (!firstLoadDoneRef.current) {
            firstLoadDoneRef.current = true;
            if (val.eventTime) prevBannerEventTime.current = val.eventTime;
          }

          if (['FOUR', 'SIX', 'WICKET'].includes(val.eventTrigger) &&
              val.eventTime && val.eventTime !== prevBannerEventTime.current) {
            prevBannerEventTime.current = val.eventTime;
            queueEvent({
              type: val.eventTrigger,
              time: val.eventTime,
              id: val.eventId || `${val.eventTrigger}_${val.eventTime}`,
              lastWicketName: val.lastWicketName,
              lastWicketRuns: val.lastWicketRuns,
              lastWicketBalls: val.lastWicketBalls,
              lastWicketDismissal: val.lastWicketDismissal,
              lastWicketFielder: val.lastWicketFielder,
            });
          }
          setMatch(val);
        }
      });

      // OBS Overlay Refresh listener for Firebase (legacy) mode
      const refreshControlPath = matchId
        ? `matches/${matchId}/overlayControl/refresh`
        : 'overlayControl/refresh';
      const unsubRefresh = onValue(ref(db, refreshControlPath), (snap) => {
        const data = snap.val();
        if (!data) return;
        const mainTs = data.main || 0;
        const bbTs = data.ballByBall || 0;
        const latest = Math.max(mainTs, bbTs);
        const prevLatest = Math.max(lastRefreshTs.current.main, lastRefreshTs.current.ballByBall);
        if (latest > prevLatest) {
          lastRefreshTs.current.main = mainTs;
          lastRefreshTs.current.ballByBall = bbTs;
          console.log('[ScorecardDisplay] Firebase overlayControl/refresh fired — re-syncing...');
          // Re-fetch from Firebase by bumping key; onValue already streams live,
          // so a key bump is enough to trigger any dependent effects.
          setRefreshKey(k => k + 1);
        }
      });

      return () => {
        unsubscribe();
        unsubRefresh();
        if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
      };
    }
  }, [matchId, dbPath, tournamentId, queueEvent]);


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

  // FIX 5: Detect over-break for KS Premium chase display
  // Show "X Runs from Y Balls" between overs in 2nd innings.
  // Trigger: recentBalls empty AND legalBallCount is a multiple of ballsPerOver AND > 0.
  // Hide: as soon as the first ball of the next over is recorded (recentBalls non-empty).
  const prevRecentBallsLen = useRef(0);
  useEffect(() => {
    if (!match) return;
    const bpoLen = match.ballsPerOver || 6;
    const lbc = match.legalBallCount || 0;
    const ballsLen = (match.recentBalls || []).length;
    const isOverBreak = ballsLen === 0 && lbc > 0 && lbc % bpoLen === 0;
    const wasNonEmpty = prevRecentBallsLen.current > 0;

    if (isOverBreak && wasNonEmpty && match.isSecondInnings) {
      // Over just completed — show chase display
      const runsNeeded = Math.max(0, (match.targetScore || 0) - (match.score || 0));
      if (runsNeeded > 0) setShowOverBreakChase(true);
    } else if (ballsLen > 0) {
      // First ball of new over — hide immediately
      setShowOverBreakChase(false);
    }
    prevRecentBallsLen.current = ballsLen;
  }, [match?.recentBalls, match?.legalBallCount, match?.isSecondInnings, match?.score, match?.targetScore, match?.ballsPerOver]);
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
      const totalBalls = (match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * (match.ballsPerOver || 6));
      const remainingBalls = totalBalls - (match.legalBallCount ?? match.totalBalls ?? 0);
      
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
    const base = themes[match?.themeID] || themes.ICC_GLOBAL || themes.IPL_GOLD;
    const modernThemeIds = ['ICC_GLOBAL', 'SKY_HYPERION', 'JIO_TITAN', 'FOX_STRIKE', 'SUPERSPORT_AURA', 'APEX', 'DIAMOND', 'VOLT', 'THUNDER', 'BLITZ', 'ELITE', 'FRANCHISE', 'SHAKTI'];
    return {
      ...base,
      isModernTheme: modernThemeIds.includes(match?.themeID),
      isKsPremium: match?.themeID === 'KS_PREMIUM',
      isNewKSColor: match?.themeID === 'NEW_KS_COLOR',
      isNewIpl: match?.themeID === 'NEW_IPL',
      isIpl2026: match?.themeID === 'IPL_2026',
      isApogee: match?.themeID === 'APOGEE',
      isDcBlue: match?.themeID === 'DC_BLUE',
      isAbuDhabiT10: match?.themeID === 'ABUDHABI_T10' || match?.themeID === 'ABU_DHABI_T10',
    };
  }, [match?.themeID]);

  // Key for the overlay bar: changes only when a NEW event starts, never when an event
  // ends. Otherwise the bar remounts after every event and its entrance animation replays
  // (the "blink" on the preview). Declared before any early return (Rules of Hooks).
  const [fxKey, setFxKey] = useState('idle');
  useEffect(() => {
    if (currentEvent) setFxKey(`${currentEvent.type}-${currentEvent.time}`);
  }, [currentEvent]);

  if (subscriptionExpired) {
    return (
      <div className="fixed inset-0 bg-[#070b14] flex flex-col items-center justify-center text-white font-sans p-6 text-center select-none">
        <div className="max-w-md w-full bg-slate-900/90 border border-red-500/30 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center text-3xl">
            <Lock size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />
          </div>
          <h2 className="text-xl font-black text-red-400 uppercase tracking-wider mb-2">
            OBS Broadcasting Access Expired
          </h2>
          <p className="text-slate-300 text-sm mb-6 leading-relaxed">
            {subErrorMessage || 'A valid KS LIVE Broadcasting subscription is required to stream this live scoreboard overlay in OBS.'}
          </p>
          <div className="bg-slate-800/80 rounded-xl p-4 mb-6 border border-slate-700/60 text-xs text-slate-400 text-left space-y-1.5">
            <div><Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Match scoring & data: <span className="text-emerald-400 font-semibold">100% Free & Unlimited</span></div>
            <div><Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> OBS overlay streaming: <span className="text-amber-400 font-semibold">Time-Limited License</span></div>
          </div>
          <p className="text-xs text-slate-500">
            Please log in to your KS Live dashboard to renew your OBS Broadcasting plan.
          </p>
        </div>
      </div>
    );
  }

  if (!match) return (
    <div className="fixed inset-0 bg-[#071A2F] flex flex-col items-center justify-center text-white font-black italic uppercase tracking-widest gap-6">
      <img src="/ks_logo.png" className="h-24 w-24 object-contain animate-pulse" alt="KS Live logo" />
      <span className="text-lg tracking-[0.3em]">Connecting to KS Live...</span>
    </div>
  );
  const animThemeClass = active.animClass || "anim-ipl-gold";
  const eventType = currentEvent?.type || match.eventTrigger;
  const eventWicketName = currentEvent?.lastWicketName || match.lastWicketName;
  const eventWicketRuns = currentEvent?.lastWicketRuns ?? match.lastWicketRuns;
  const eventWicketBalls = currentEvent?.lastWicketBalls ?? match.lastWicketBalls;
  const eventWicketDismissal = currentEvent?.lastWicketDismissal || match.lastWicketDismissal || "Bowled";
  const eventWicketFielder = currentEvent?.lastWicketFielder || match.lastWicketFielder || "";
  
  const getHowOutText = () => {
    const bowler = match.bowler?.name || "Bowler";
    switch (eventWicketDismissal) {
      case 'Caught': return `c ${eventWicketFielder || 'Sub'} b ${bowler}`;
      case 'Caught Behind': return `c †${eventWicketFielder || 'Wk'} b ${bowler}`;
      case 'Caught & Bowled': return `c & b ${bowler}`;
      case 'Stumped': return `st †${eventWicketFielder || 'Wk'} b ${bowler}`;
      case 'Run Out': return `Run Out (${eventWicketFielder || 'Direct Hit'})`;
      case 'Run Out (Mankad)': return `Run Out (Mankad)`;
      case 'LBW': return `lbw b ${bowler}`;
      case 'Hit Wicket': return `hit wicket b ${bowler}`;
      case 'Hit the Ball Twice': return `hit the ball twice`;
      case 'Obstructing the Field': return `obstructing the field`;
      case 'Timed Out': return `timed out`;
      case 'Retired Out': return `retired out`;
      case 'Retired Hurt': return 'retired hurt (not out)';
      case 'Absent Hurt': return 'absent hurt (not out)';
      default: return `b ${bowler}`;
    }
  };
  const totalMatchBalls = (match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * (match.ballsPerOver || 6));
  const remainingBalls = totalMatchBalls - (match.legalBallCount ?? match.totalBalls ?? 0);
  const isMatchFinished = ["finished", "match ended"].includes(String(match?.matchStatus || "").toLowerCase());

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

  // Hide All (from mini admin): show an empty transparent screen on OBS
  if (match.overlayHidden) return <div className="fixed inset-0 pointer-events-none" />;

  return (
    <div key={refreshKey} className="fixed inset-0 font-broadcast select-none pointer-events-none text-white uppercase italic" style={phoneCanvasStyle}>

      {/* 1. NAVIGATION OVERLAY (Admin only, visible on hover) */}
      <div className="fixed top-4 left-4 z-[200] flex gap-2 pointer-events-auto opacity-0 hover:opacity-100 transition-opacity">
        <button onClick={() => window.open('/admin', '_blank')} className="bg-slate-800 text-white text-[10px] px-4 py-2 rounded-full font-black border border-white/20">ADMIN PANEL <ArrowUpRight size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></button>
        <button onClick={() => window.open('/teams', '_blank')} className="bg-blue-600 text-white text-[10px] px-4 py-2 rounded-full font-black">TEAM MANAGER <ArrowUpRight size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></button>
      </div>

      {/* 2. VERSUS OVERLAY — shared by every theme (see VersusOverlay.jsx) */}
      {match.showVersus && !winnerInfo && (
        <VersusOverlay
          match={match}
          teamALogoUrl={getAbsoluteUrl(match.battingLogo)}
          teamBLogoUrl={getAbsoluteUrl(match.leagueLogo)}
        />
      )}

      {/* 2b. TOSS RESULT OVERLAY — Cinematic Broadcast Style */}
      {renderToss && (() => {
        const tossVisible = isTossMounted;
        const toss = match.toss || {};
        const tossWinner = toss.winner || match.battingTeam || 'TEAM A';
        const tossDecision = toss.decision === 'bowl' ? 'BOWL' : 'BAT';
        const tossDecisionFull = toss.decision === 'bowl' ? 'ELECTED TO BOWL FIRST' : 'ELECTED TO BAT FIRST';
        // Figure out which logo belongs to toss winner
        const isBattingTossWinner = tossWinner === match.battingTeam;
        const tossWinnerLogo = isBattingTossWinner ? match.battingLogo : match.leagueLogo;
        const tossLoserName = isBattingTossWinner ? match.bowlingTeam : match.battingTeam;
        const tossLoserLogo = isBattingTossWinner ? match.leagueLogo : match.battingLogo;
        return (
          <div className={`toss-screen ${tossVisible ? '' : 'hide'}`}>
            {/* Ambient background layers */}
            <div className="toss-bg-radial" />
            <div className="toss-bg-grid" />
            <div className="toss-shimmer" />

            {/* Floating particles */}
            <div className="toss-particles">
              {Array.from({ length: 16 }).map((_, i) => <div key={i} className="toss-particle" />)}
            </div>

            {/* Top label */}
            <div className="toss-label-top">TOSS RESULT</div>

            {/* Main content */}
            <div className="toss-main">

              {/* Loser team (left, muted) */}
              <div className="toss-team toss-team-loser">
                {tossLoserLogo
                  ? <img src={getAbsoluteUrl(tossLoserLogo)} className="toss-logo toss-logo-loser" alt={tossLoserName} />
                  : <div className="toss-logo toss-logo-loser toss-logo-placeholder">{(tossLoserName || '').slice(0, 2).toUpperCase()}</div>
                }
                <div className="toss-team-name-loser">{tossLoserName}</div>
              </div>

              {/* Center: coin + announcement */}
              <div className="toss-center">
                <div className="toss-coin-wrap">
                  <div className="toss-coin">
                    <div className="toss-coin-face toss-coin-front">
                      <span className="toss-coin-icon"><Coins size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>
                    </div>
                    <div className="toss-coin-face toss-coin-back">
                      <span className="toss-coin-icon"><Star size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>
                    </div>
                  </div>
                  <div className="toss-coin-glow" />
                </div>
                <div className="toss-won-text">WON THE TOSS</div>
                <div className="toss-decision-badge">
                  <span className="toss-decision-icon">{tossDecision === 'BAT' ? <Activity size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> : <Circle size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />}</span>
                  <span>{tossDecisionFull}</span>
                </div>
              </div>

              {/* Winner team (right, highlighted) */}
              <div className="toss-team toss-team-winner">
                <div className="toss-winner-ring">
                  {tossWinnerLogo
                    ? <img src={getAbsoluteUrl(tossWinnerLogo)} className="toss-logo toss-logo-winner" alt={tossWinner} />
                    : <div className="toss-logo toss-logo-winner toss-logo-placeholder">{(tossWinner || '').slice(0, 2).toUpperCase()}</div>
                  }
                </div>
                <div className="toss-team-name-winner">{tossWinner}</div>
                <div className="toss-winner-badge">WINNER</div>
              </div>

            </div>

            {/* Bottom bar */}
            <div className="toss-bottom-bar">
              <span className="toss-match-info">
                {match.matchTitle || match.tournamentName || `${match.maxOvers || 20} OVERS MATCH`}
              </span>
              {match.venueName && <span className="toss-venue"><MapPin size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> {match.venueName}</span>}
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
            <img src={getAbsoluteUrl(winnerInfo.logo)} className="winner-cinematic-logo" alt="Winner" />
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
                  <img src={getAbsoluteUrl(match.battingLogo)} className="summary-team-logo" alt="Logo" />
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
                        <img src={p?.photo || 'https://via.placeholder.com/40'} className="summary-roster-photo" alt="p" />
                        <span className="summary-roster-name">{p?.name || p}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Panel 2: Batting + Bowling */}
                <div className="summary-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <h3 className="summary-panel-header panel-gold">Currently Batting</h3>
                    {[match.player1, match.player2].filter(Boolean).map((p, i) => (
                      <div key={i} className="summary-bat-row">
                        <span className="summary-bat-name">{(p.name || 'SELECT PLAYER')} {p.onStrike && <span className="strike-dot">●</span>}</span>
                        <span><span className="summary-bat-runs">{p.runs ?? 0}</span> <span className="summary-bat-balls">({p.balls ?? 0})</span></span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h3 className="summary-panel-header panel-red">Current Bowler</h3>
                    <span className="summary-bowler-name">{match.bowler?.name || 'SELECT BOWLER'}</span>
                    <span className="summary-bowler-figures">{match.bowler?.figures || '0-0 (0.0)'}</span>
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
                            <span className="summary-fow-name">{w.playerName || w.name || 'Batsman Dismissed'}</span>
                            <span className="summary-fow-bowler">Dismissal #{w.wicket || idx + 1}</span>
                          </div>
                          <span className="summary-fow-score">{w.score ?? 0}-{w.wicket ?? 0} ({w.overAtFall || '0.0'})</span>
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
                <img src={getAbsoluteUrl(match.battingLogo)} className="w-14 h-14 rounded-full bg-white p-1 object-cover shadow-lg border-2 border-yellow-500/40" alt="Team" />
                <div className="h-px w-12 bg-gradient-to-l from-transparent to-yellow-500/50"></div>
              </div>
              <h1 className="text-white font-black text-3xl italic uppercase tracking-wide mb-2">
                {match.battingTeam}
              </h1>
              <p className="text-yellow-400 font-black text-2xl italic">
                need <span className="text-white text-4xl mx-1">{match.targetScore - match.score}</span> runs in <span className="text-white text-4xl mx-1">{((match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * (match.ballsPerOver || 6))) - match.totalBalls}</span> balls
              </p>
              <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest mt-4">to win</p>
            </div>
          </div>
        </div>
      )}

      {/* ── BROADCAST GRAPHICS PANEL OVERLAYS (v3.1) ─────────────────────────── */}

      {/* 5a. PLAYER OF THE MATCH — Cinematic Full-Screen */}
      {match.showPlayerOfMatch && match.potmName && (
        <div className="potm-screen">
          <div className="potm-bg-radial" />
          <div className="potm-bg-grid" />
          <div className="potm-shimmer" />
          <div className="potm-label-top">PLAYER OF THE MATCH</div>
          <div className="potm-crown"><Crown size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></div>
          <div className="potm-card">
            <div className="potm-photo-wrap">
              {match.potmPhoto
                ? <img src={getAbsoluteUrl(match.potmPhoto)} className="potm-photo" alt={match.potmName} />
                : <div className="potm-photo-fallback">{(match.potmName || '').slice(0, 2).toUpperCase()}</div>
              }
              <div className="potm-photo-ring" />
            </div>
            <div className="potm-info">
              <h1 className="potm-name">{match.potmName}</h1>
              {match.potmTeam && <p className="potm-team">{match.potmTeam}</p>}
              {match.potmFigures && <p className="potm-figures">{match.potmFigures}</p>}
            </div>
          </div>
          <div className="potm-label-bottom">OUTSTANDING PERFORMANCE</div>
        </div>
      )}

      {/* 5b. PARTNERSHIP FULL-SCREEN */}
      {match.showPartnership && match.partnership && (
        <div className="partnership-screen">
          <div className="partnership-bg" />
          <div className="partnership-label">CURRENT PARTNERSHIP</div>
          <div className="partnership-card">
            <div className="partnership-runs">{match.partnership.runs ?? 0}</div>
            <div className="partnership-runs-label">RUNS</div>
            <div className="partnership-balls">({match.partnership.balls ?? 0} balls)</div>
            <div className="partnership-players">
              {[match.player1, match.player2].filter(Boolean).map((p, i) => (
                <div key={i} className="partnership-player-row">
                  <span className="partnership-player-name">{p.name || 'BATTER'}</span>
                  <span className="partnership-player-score">{p.runs ?? 0} <span className="partnership-player-balls">({p.balls ?? 0})</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5c. SQUAD LIST FULL-SCREEN */}
      {match.showSquadList && (() => {
        const isTeam2 = match.squadListTeam === 'team2';
        const squad = isTeam2 ? (match.bowlingSquad || []) : (match.battingSquad || []);
        const teamName = isTeam2 ? match.bowlingTeam : match.battingTeam;
        const teamLogo = isTeam2 ? match.leagueLogo : match.battingLogo;
        return (
          <div className="squadlist-screen">
            <div className="squadlist-bg" />
            <div className="squadlist-header">
              {teamLogo && <img src={getAbsoluteUrl(teamLogo)} className="squadlist-logo" alt={teamName} />}
              <div>
                <div className="squadlist-team-name">{teamName}</div>
                <div className="squadlist-label">PLAYING SQUAD</div>
              </div>
            </div>
            <div className="squadlist-grid">
              {squad.map((p, i) => (
                <div key={i} className="squadlist-player">
                  <span className="squadlist-num">{i + 1}</span>
                  <span className="squadlist-pname">{p.name || p}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 5d. NEED RUN FULL-SCREEN (manual trigger, works in 1st inns too) */}
      {match.showNeedRun && !match.showMatchSituation && (
        <div className="fixed inset-0 z-[106] flex items-center justify-center pointer-events-none match-situation-overlay">
          <div className="match-situation-card relative px-16 py-10 rounded-2xl text-center">
            <div className="absolute inset-0 bg-black/85 backdrop-blur-xl rounded-2xl border border-white/10"></div>
            <div className="relative z-10">
              <p className="text-white/50 font-black text-[11px] uppercase tracking-[0.5em] mb-4">Match Situation</p>
              <div className="flex items-center justify-center gap-3 mb-5">
                <div className="h-px w-12 bg-gradient-to-r from-transparent to-yellow-500/50"></div>
                <img src={getAbsoluteUrl(match.battingLogo)} className="w-14 h-14 rounded-full bg-white p-1 object-cover shadow-lg border-2 border-yellow-500/40" alt="Team" />
                <div className="h-px w-12 bg-gradient-to-l from-transparent to-yellow-500/50"></div>
              </div>
              <h1 className="text-white font-black text-3xl italic uppercase tracking-wide mb-2">{match.battingTeam}</h1>
              {match.isSecondInnings && (match.targetScore - match.score) > 0
                ? <p className="text-yellow-400 font-black text-2xl italic">need <span className="text-white text-4xl mx-1">{match.targetScore - match.score}</span> runs in <span className="text-white text-4xl mx-1">{((match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * (match.ballsPerOver || 6))) - match.totalBalls}</span> balls</p>
                : <p className="text-yellow-400 font-black text-2xl italic"><span className="text-white text-4xl mx-1">{match.score}-{match.wickets}</span> in <span className="text-white text-4xl mx-1">{match.maxOvers}</span> overs</p>
              }
              <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest mt-4">live scoring</p>
            </div>
          </div>
        </div>
      )}

      {/* 5e. CUSTOM TEXT LOWER-THIRD */}
      {match.showCustomText && match.customText && (
        <div className="custom-text-strip">
          <div className="custom-text-bar" />
          <span className="custom-text-content">{match.customText}</span>
        </div>
      )}

      {/* 5f. LAST OUT LOWER-THIRD */}
      {match.showLastOut && match.lastWicketName && (
        <div className="lastout-strip">
          <div className="lastout-label">LAST OUT</div>
          <div className="lastout-name">{match.lastWicketName}</div>
          <div className="lastout-figures">{match.lastWicketRuns ?? 0} ({match.lastWicketBalls ?? 0}) • {match.lastWicketDismissal || 'OUT'}</div>
        </div>
      )}

      {/* 5g. TOURNAMENT — MOST RUNS */}
      {match.showTournamentMostRuns && (
        <div className="tournament-screen">
          <div className="tournament-screen-bg" />
          <div className="tournament-screen-header"><Trophy size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> MOST RUNS — {match.tournamentName || 'TOURNAMENT'}</div>
          <div className="tournament-screen-body">
            {(publicBoards?.mostRuns || []).length === 0 ? (
              <div className="tournament-screen-empty">No completed-match statistics yet.</div>
            ) : (
              <div style={{ width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {publicBoards.mostRuns.map((r, i) => (
                  <div key={r.name + r.team + i} style={{ display: 'grid', gridTemplateColumns: '56px 1fr 120px 120px', alignItems: 'center', gap: 12, padding: '12px 18px', borderRadius: 12, background: i === 0 ? 'rgba(250,204,21,0.18)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ fontWeight: 900, fontSize: 22, color: '#facc15' }}>{r.rank}{r.tied ? '=' : ''}</span>
                    <span><span style={{ fontWeight: 900, fontSize: 22 }}>{r.name}</span><span style={{ marginLeft: 10, fontSize: 14, opacity: 0.6 }}>{r.team}</span></span>
                    <span style={{ fontWeight: 900, fontSize: 26, textAlign: 'right' }}>{r.runs}<span style={{ fontSize: 12, opacity: 0.6, marginLeft: 4 }}>RUNS</span></span>
                    <span style={{ fontSize: 13, opacity: 0.75, textAlign: 'right' }}>SR {r.strikeRate ?? '-'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5h. TOURNAMENT — MOST WICKETS */}
      {match.showTournamentMostWickets && (
        <div className="tournament-screen">
          <div className="tournament-screen-bg" />
          <div className="tournament-screen-header"><CircleDot size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> MOST WICKETS — {match.tournamentName || 'TOURNAMENT'}</div>
          <div className="tournament-screen-body">
            {(publicBoards?.mostWickets || []).length === 0 ? (
              <div className="tournament-screen-empty">No completed-match statistics yet.</div>
            ) : (
              <div style={{ width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {publicBoards.mostWickets.map((r, i) => (
                  <div key={r.name + r.team + i} style={{ display: 'grid', gridTemplateColumns: '56px 1fr 120px 120px', alignItems: 'center', gap: 12, padding: '12px 18px', borderRadius: 12, background: i === 0 ? 'rgba(250,204,21,0.18)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ fontWeight: 900, fontSize: 22, color: '#facc15' }}>{r.rank}{r.tied ? '=' : ''}</span>
                    <span><span style={{ fontWeight: 900, fontSize: 22 }}>{r.name}</span><span style={{ marginLeft: 10, fontSize: 14, opacity: 0.6 }}>{r.team}</span></span>
                    <span style={{ fontWeight: 900, fontSize: 26, textAlign: 'right' }}>{r.wickets}<span style={{ fontSize: 12, opacity: 0.6, marginLeft: 4 }}>WKTS</span></span>
                    <span style={{ fontSize: 13, opacity: 0.75, textAlign: 'right' }}>ECON {r.economy ?? '-'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5i. TOURNAMENT — POINTS TABLE */}
      {match.showPointsTable && (
        <div className="tournament-screen">
          <div className="tournament-screen-bg" />
          <div className="tournament-screen-header"><BarChart3 size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> POINTS TABLE — {match.tournamentName || 'TOURNAMENT'}</div>
          <div className="tournament-screen-body">
            <div className="tournament-screen-empty">Connect tournament data to display points table.</div>
          </div>
        </div>
      )}

      {/* 5j. TOURNAMENT — BOUNDARIES */}
      {match.showTournamentBoundaries && (
        <div className="tournament-screen">
          <div className="tournament-screen-bg" />
          <div className="tournament-screen-header"><Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> BOUNDARIES — {match.tournamentName || 'TOURNAMENT'}</div>
          <div className="tournament-screen-body">
            <div className="tournament-screen-empty">Connect tournament data to display boundary stats.</div>
          </div>
        </div>
      )}

      {/* 5k. TOURNAMENT — UPCOMING */}
      {match.showUpcoming && (
        <div className="tournament-screen">
          <div className="tournament-screen-bg" />
          <div className="tournament-screen-header"><Calendar size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> UPCOMING MATCHES — {match.tournamentName || 'TOURNAMENT'}</div>
          <div className="tournament-screen-body">
            <div className="tournament-screen-empty">Connect tournament data to display upcoming fixtures.</div>
          </div>
        </div>
      )}

      {/* 5l. TOURNAMENT — RESULTS */}
      {match.showResults && (
        <div className="tournament-screen">
          <div className="tournament-screen-bg" />
          <div className="tournament-screen-header"><ClipboardList size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> RESULTS — {match.tournamentName || 'TOURNAMENT'}</div>
          <div className="tournament-screen-body">
            <div className="tournament-screen-empty">Connect tournament data to display match results.</div>
          </div>
        </div>
      )}

      {/* 6. MAIN BOTTOM SCOREBOARD */}
      {renderScorecard && (
        <div className={`absolute bottom-0 left-0 w-full flex flex-col pointer-events-none ${animThemeClass}`}>
          {/* FREE HIT LIVE BADGE (v3.0) */}
          {match.freeHitActive && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-2 px-5 py-1.5 rounded-full bg-gradient-to-r from-amber-500 via-orange-600 to-red-600 border-2 border-yellow-300 text-white font-black text-xs tracking-[0.25em] shadow-[0_0_25px_rgba(249,115,22,0.8)] animate-pulse">
              <span><Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span> FREE HIT <span><Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>
            </div>
          )}

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
               MODERN INTERNATIONAL BROADCAST OVERLAY THEMES
               (ICC Global, Sky Hyperion, Jio Titan, Fox Strike, SuperSport Aura)
          ═══════════════════════════════════════════════════════════ */}
          {active.isModernTheme ? (
            // Keyed per event so each four / six / wicket replays its bar animation (live only).
            <div
              key={fxKey}
              className={`fx-host ${showEvent && ['FOUR', 'SIX', 'WICKET'].includes(eventType) ? `fx-${eventType.toLowerCase()}` : ''}`}
            >
              <ModernOverlayThemes
                themeId={match.themeID}
                match={match}
                showEvent={showEvent}
                eventType={eventType}
                eventWicketName={eventWicketName}
                getHowOutText={getHowOutText}
                scoreAnimClass={scoreAnimClass}
                getOvers={getOvers}
                getAbsoluteUrl={getAbsoluteUrl}
                TeamLogo={TeamLogo}
              />
            </div>
          ) : active.isNewKSColor ? (() => {
            const bpo = match.ballsPerOver || 6;
            const balls = match.recentBalls || [];
            const legalDeliveries = match.legalBallCount ?? match.totalBalls ?? 0;
            const overStr = `${Math.floor(legalDeliveries / bpo)}.${legalDeliveries % bpo}`;
            const maxOvers = match.maxOvers || 20;
            const totalMatchBallsKSP = (match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * (match.ballsPerOver || 6));
            const remainKSP = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, totalMatchBallsKSP - legalDeliveries);
            const runsNeeded = match.isSecondInnings ? Math.max(0, match.targetScore - match.score) : 0;

            const b1 = match.player1;
            const b2 = match.player2;
            const bb = match.bowler;
            const team1Name = match.battingTeam || "TEAM 1";

            return (
                <div className="kse-wrapper" style={{ zIndex: 10 }}>
                    <div className="kse-bg-pattern"></div>
                    
                    {showEvent && ["FOUR", "SIX", "WICKET"].includes(eventType) && (
                        <div className={`kse-event-banner kse-event-${eventType.toLowerCase()}`}>
                            <div className="kse-event-text">
                                {eventType === "WICKET" 
                                    ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <span style={{ fontSize: '32px', marginBottom: '-5px' }}>{eventWicketName} OUT!</span>
                                        <span style={{ fontSize: '14px', color: '#ffcc00' }}>{getHowOutText()}</span>
                                      </div>
                                    : eventType}
                            </div>
                        </div>
                    )}

                    <div className="kse-board">

                        <div className="kse-top-bar">
                            <div className="kse-live-dot"></div>
                            <span>LIVE • {match.tournamentName || "UNIVERSITY PREMIER LEAGUE 2026"} | CRR: {(match.score / Math.max(1, (legalDeliveries / bpo))).toFixed(2)} {match.isSecondInnings && match.targetScore ? ` | TARGET: ${match.targetScore}` : ''}</span>
                        </div>

                        <div className="kse-left">
                            <TeamLogo src={getAbsoluteUrl(match.battingLogo)} teamName={match.battingTeam} className="kse-logo" size={56} />
                            <div className="kse-team-info">
                                <div className="kse-team-name">{team1Name}</div>
                                <div className="kse-tournament">{match.tournamentName || "KS LIVE BROADCASTING"}</div>
                            </div>
                        </div>

                        <div className="kse-center">
                            <div className="kse-score-wrapper">
                                <div className={`kse-score ${scoreAnimClass ? 'kse-score-update' : ''}`}>{match.score}/{match.wickets}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div className="kse-overs-max" style={{ marginBottom: '-4px' }}>{maxOvers} OVERS</div>
                                    <div className="kse-overs">{overStr}</div>
                                </div>
                            </div>
                        </div>

                        <div className="kse-right">
                            {match.isSecondInnings && (runsNeeded > 0) && (remainKSP <= 30) ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                                    <div style={{ fontSize: '18px', fontWeight: '800', textAlign: 'center', color: '#fff' }}>
                                        {match.battingTeam} NEED <span style={{ color: '#FFD54F', fontSize: '24px' }}>{runsNeeded}</span> MORE FROM <span style={{ color: '#FFD54F', fontSize: '24px' }}>{remainKSP}</span> BALLS
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <div style={{ color: b1?.onStrike ? '#fff' : '#aaa' }}><strong>{b1?.onStrike ? <><Star size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> </> : ''}{b1?.name || 'Batter 1'}</strong> <span className="kse-batter-runs">{b1?.runs || 0} ({b1?.balls || 0})</span></div>
                                        <div style={{ color: b2?.onStrike ? '#fff' : '#aaa' }}><strong>{b2?.onStrike ? <><Star size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> </> : ''}{b2?.name || 'Batter 2'}</strong> <span className="kse-batter-runs">{b2?.runs || 0} ({b2?.balls || 0})</span></div>
                                    </div>

                                    <div>
                                        <div className="kse-bowler-title">CURRENT BOWLER</div>
                                        <div><strong>{bb?.name || 'Bowler'}</strong> <span className="kse-bowler-figs">{bb?.wickets || 0}/{bb?.runs || 0}</span></div>
                                    </div>
                                    <div style={{ paddingLeft: '20px', borderLeft: '1px solid rgba(255,255,255,0.1)', marginLeft: '10px' }}>
                                        <TeamLogo src={getAbsoluteUrl(match.leagueLogo)} teamName={match.bowlingTeam} className="kse-logo" size={56} style={{ margin: 0 }} />
                                    </div>
                                </>
                            )}
                        </div>

                        
                    </div> {/* Closes kse-board */}

                    <div className="kse-ball-tracker">
                            {showOverBreakChase && match.isSecondInnings && (() => {
                                const kseBpo = match.ballsPerOver || 6;
                                const kseLbd = match.legalBallCount ?? 0;
                                const kseTotalBalls = match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * kseBpo;
                                const kseRemain = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, kseTotalBalls - kseLbd);
                                const kseRuns = Math.max(0, (match.targetScore || 0) - (match.score || 0));
                                return kseRuns > 0 ? (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '100%',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        background: 'linear-gradient(90deg, #10b981, #047857)', // Emerald green to match New KS Color
                                        border: '1px solid #34d399',
                                        borderRadius: '6px 6px 0 0',
                                        padding: '4px 20px',
                                        fontSize: '13px',
                                        fontWeight: 800,
                                        letterSpacing: '1px',
                                        color: '#fff',
                                        whiteSpace: 'nowrap',
                                        animation: 'ksp-slide-up 0.4s ease',
                                        zIndex: 20,
                                        boxShadow: '0 -4px 10px rgba(0,0,0,0.3)'
                                    }}>
                                        {match.battingTeam} NEED{' '}
                                        <span style={{ color: '#fff', fontSize: '16px', textShadow: '0 0 5px rgba(255,255,255,0.5)' }}>{kseRuns}</span>
                                        {' '}FROM{' '}
                                        <span style={{ color: '#fff', fontSize: '16px', textShadow: '0 0 5px rgba(255,255,255,0.5)' }}>{kseRemain}</span>
                                        {' '}BALLS
                                    </div>
                                ) : null;
                            })()}
                            {Array.from({ length: Math.min(6, Math.max(bpo, balls.length)) }).map((_, i) => {
                                const b = balls[balls.length - 1 - i] || '';
                                if (!b) return null;
                                let c = '';
                                if (b === '4') c = 'four';
                                if (b === '6') c = 'six';
                                if (b.includes('W')) c = 'wicket';
                                if (b.includes('wd') || b.includes('nb')) c = 'extra';
                                return <div key={i} className={`kse-ball ${c}`}>{b === '0' ? '.' : b}</div>;
                            }).reverse()}
                        </div>
                </div>
            );
          })() : 
          active.isKsPremium ? (() => {
            const bpo = match.ballsPerOver || 6;
            const balls = match.recentBalls || [];
            const legalDeliveries = match.legalBallCount ?? match.totalBalls ?? 0;
            const totalMatchBallsKSP = (match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * (match.ballsPerOver || 6));
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
                    <TeamLogo src={getAbsoluteUrl(match.battingLogo)} teamName={match.battingTeam} className="ksp-logo" size={56} />
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
                    {showEvent && ["FOUR", "SIX", "WICKET"].includes(eventType) && (
                      <div className={`ksp-event-banner ksp-event-${eventType.toLowerCase()}`}>
                        <div className="ksp-sweep" />
                        <div className="ksp-event-text">
                          {eventType === "WICKET" 
                            ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontSize: '32px', marginBottom: '-5px' }}>{eventWicketName} OUT!</span>
                                <span style={{ fontSize: '14px', color: '#ffcc00' }}>{getHowOutText()}</span>
                              </div>
                            : eventType === "FOUR" ? "FOUR!" : "SIX!"}
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
                          <div className="ksp-batter-row" style={{ color: match.player1 ? '#fff' : '#aaa' }}>
                            <div className="ksp-batter-name">
                              <span className="ksp-striker-arrow" style={{ opacity: match.player1?.onStrike ? 1 : 0, transition: 'opacity 0.2s' }}><Play size="1em" fill="currentColor" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span> {match.player1?.name || 'SELECT P1'}
                            </div>
                            <div>
                              <span className="ksp-batter-runs">{match.player1?.runs || 0}</span> <span className="ksp-batter-balls">{match.player1?.balls || 0}</span>
                            </div>
                          </div>
                          <div className="ksp-batter-row" style={{ color: match.player2 ? '#fff' : '#aaa' }}>
                            <div className="ksp-batter-name">
                              <span className="ksp-striker-arrow" style={{ opacity: match.player2?.onStrike ? 1 : 0, transition: 'opacity 0.2s' }}><Play size="1em" fill="currentColor" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span> {match.player2?.name || 'SELECT P2'}
                            </div>
                            <div>
                              <span className="ksp-batter-runs">{match.player2?.runs || 0}</span> <span className="ksp-batter-balls">{match.player2?.balls || 0}</span>
                            </div>
                          </div>
                        </div>
                        <div className="ksp-bowler-section">
                          <div className="ksp-bowler-title">BOWLING : {match.bowlingTeam}</div>
                          <div className="ksp-bowler-row">
                            <div className="ksp-bowler-name">{match.bowler?.name || 'SELECT BOWLER'}</div>
                            <div className="ksp-bowler-figs">
                              {match.bowler?.figures || '0-0 (0.0)'}
                            </div>
                          </div>
                          {match.partnership && match.partnership.runs > 0 && (
                            <div className="ksp-partnership">
                              P'SHIP: {match.partnership.runs} ({match.partnership.balls})
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Block: Bowling Logo */}
                  <div className="ksp-right">
                    <TeamLogo src={getAbsoluteUrl(match.leagueLogo)} teamName={match.bowlingTeam} className="ksp-bowling-logo" size={56} />
                  </div>
                </div>

                {/* Bottom Ball Tracker */}
                <div className="ksp-ball-tracker">
                  {/* FIX 5: Over-break chase display for 2nd innings */}
                  {showOverBreakChase && match.isSecondInnings && (() => {
                    const kspBpo = match.ballsPerOver || 6;
                    const kspLbd = match.legalBallCount ?? 0;
                    const kspTotalBalls = match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * kspBpo;
                    const kspRemain = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, kspTotalBalls - kspLbd);
                    const kspRuns = Math.max(0, (match.targetScore || 0) - (match.score || 0));
                    return kspRuns > 0 ? (
                      <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'linear-gradient(90deg, #0D47A1, #082963)',
                        border: '1px solid #FFC107',
                        borderRadius: '6px 6px 0 0',
                        padding: '4px 20px',
                        fontSize: '13px',
                        fontWeight: 800,
                        letterSpacing: '1px',
                        color: '#fff',
                        whiteSpace: 'nowrap',
                        animation: 'ksp-slide-up 0.4s ease',
                        zIndex: 20,
                      }}>
                        {match.battingTeam} NEED{' '}
                        <span style={{ color: '#FFC107', fontSize: '16px' }}>{kspRuns}</span>
                        {' '}FROM{' '}
                        <span style={{ color: '#FFC107', fontSize: '16px' }}>{kspRemain}</span>
                        {' '}BALLS
                      </div>
                    ) : null;
                  })()}
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
                  <div style={{ marginLeft: '10px', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '10px', display: 'flex', alignItems: 'center', color: '#ffb900', fontSize: '12px', fontWeight: '800', letterSpacing: '1px' }}>
                    THIS OVER: {match.overRuns || 0}
                  </div>
                </div>
              </div>
            );
          })() : active.isNewIpl ? (() => {
            const bpo = match.ballsPerOver || 6;
            const balls = match.recentBalls || [];
            const legalDeliveries = match.legalBallCount ?? match.totalBalls ?? 0;
            const totalMatchBallsNew = (match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * (match.ballsPerOver || 6));
            const remainNew = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, totalMatchBallsNew - legalDeliveries);
            const rrrNew = match.isSecondInnings && remainNew > 0 ? ((match.targetScore - match.score) / (remainNew / 6)).toFixed(2) : '--';
            const runsNeeded = match.isSecondInnings ? Math.max(0, match.targetScore - match.score) : 0;
            
            return (
              <div className="newipl-wrapper">
                <div className="newipl-board">
                  {/* Event triggers (animated overlays) */}
                  {showEvent && ["FOUR", "SIX", "WICKET"].includes(eventType) && (
                    <div className={`newipl-event-trigger newipl-event-${eventType.toLowerCase()}`}>
                      <div className="newipl-event-text">
                        {eventType === "WICKET" 
                          ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: '1.2' }}>
                              <span style={{ fontSize: '20px' }}>{eventWicketName} OUT!</span>
                              <span style={{ fontSize: '10px', color: '#ffcc00' }}>{getHowOutText()}</span>
                            </div>
                          : eventType}
                      </div>
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
                      <TeamLogo src={getAbsoluteUrl(match.battingLogo)} teamName={match.battingTeam} className="newipl-team-logo" size={58} />
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
                          <div className="newipl-batter-row" style={{ color: match.player1 ? '#fff' : '#aaa' }}>
                            <div className="newipl-batter-name">
                              {match.player1?.onStrike && <span className="newipl-striker-arrow"><Play size="1em" fill="currentColor" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>} {match.player1?.name || 'BAT 1'}
                            </div>
                            <div className="newipl-batter-score">{match.player1?.runs ?? 0}<span className="newipl-batter-balls">({match.player1?.balls ?? 0})</span></div>
                          </div>
                          <div className="newipl-batter-row" style={{ color: match.player2 ? '#fff' : '#aaa' }}>
                            <div className="newipl-batter-name">
                              {match.player2?.onStrike && <span className="newipl-striker-arrow"><Play size="1em" fill="currentColor" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>} {match.player2?.name || 'BAT 2'}
                            </div>
                            <div className="newipl-batter-score">{match.player2?.runs ?? 0}<span className="newipl-batter-balls">({match.player2?.balls ?? 0})</span></div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bowler + Bowling Team Logo */}
                    <div className="newipl-bowler-block">
                      <div className="newipl-bowler-label">BOWLER</div>
                      <div className="newipl-bowler-name">{match.bowler?.name || 'SELECT BOWLER'}</div>
                      <div className="newipl-bowler-figs">
                        {match.bowler?.figures && match.bowler.figures !== '0-0 (0.0)'
                          ? match.bowler.figures
                          : match.bowler?.name
                            ? `${match.bowler.wickets || 0}-${match.bowler.runs || 0} (${getOvers(Math.round((match.bowler.overs||0)*(match.ballsPerOver||6)))})`
                            : '—'
                        }
                      </div>
                    </div>
                    {/* Bowling Team Logo */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', marginLeft: '10px', paddingLeft: '10px', borderLeft: '1px solid rgba(255,255,255,0.12)' }}>
                      <TeamLogo src={getAbsoluteUrl(match.leagueLogo)} teamName={match.bowlingTeam} className="newipl-team-logo" size={44} style={{ width: 44, height: 44, minWidth: 44 }} />
                      <div style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: '1px', textAlign: 'center', maxWidth: '50px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.bowlingTeam}</div>
                    </div>

                    {/* Partnership */}
                    {match.partnership && match.partnership.runs > 0 && (
                      <div className="newipl-bowler-block" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', marginLeft: '10px', paddingLeft: '10px' }}>
                        <div className="newipl-bowler-label" style={{ color: '#ffb900' }}>PARTNERSHIP</div>
                        <div className="newipl-bowler-name" style={{ color: '#fff', fontSize: '14px' }}>{match.partnership.runs} <span style={{ fontSize: '10px', color: '#aaa' }}>({match.partnership.balls})</span></div>
                      </div>
                    )}
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
                      <div style={{ marginLeft: '10px', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '10px', display: 'flex', alignItems: 'center', color: '#ffb900', fontSize: '12px', fontWeight: 'bold' }}>
                        THIS OVER: {match.overRuns || 0}
                      </div>
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
            const totalMatchBallsKSP = (match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * (match.ballsPerOver || 6));
            const remainIPL = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, totalMatchBallsKSP - legalDeliveries);
            const runsNeeded = match.isSecondInnings ? Math.max(0, match.targetScore - match.score) : 0;
            
            const striker = match.player1?.onStrike ? match.player1 : match.player2;
            const nonStriker = match.player1?.onStrike ? match.player2 : match.player1;

            return (
              <div className="scoreboard anim-ipl2026-entrance">
                
                {/* LEFT TEAM — Batting Logo + Abbreviation */}
                <div className="team team-left" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '4px 8px' }}>
                  <TeamLogo src={getAbsoluteUrl(match.battingLogo)} teamName={match.battingTeam} size={44} style={{ border: '2px solid rgba(255,255,255,0.3)', boxShadow: '0 0 10px rgba(255,255,255,0.15)' }} />
                  <span style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '1px', color: '#fff' }}>{match.battingTeam ? match.battingTeam.substring(0, 3).toUpperCase() : 'BAT'}</span>
                </div>

                {/* BATSMAN PANEL */}
                <div className="player-panel anim-ipl2026-panel-left">

                    <div className="striker-indicator"></div>

                    <div className="player-row">
                        <div className="player-name">
                            {striker?.name || 'STRIKER'}
                        </div>
                        <div className="player-score">
                            {striker?.runs || 0} <span className="balls">({striker?.balls || 0})</span>
                        </div>
                    </div>

                    <div className="player-row">
                        <div className="player-name">
                            {nonStriker?.name || 'NON-STRIKER'}
                        </div>
                        <div className="player-score">
                            {nonStriker?.runs || 0} <span className="balls">({nonStriker?.balls || 0})</span>
                        </div>
                    </div>

                </div>

                {/* CENTER PANEL */}
                <div className="center-section anim-ipl2026-center">

                    <div className="score-capsule anim-ipl2026-pop">
                        <span className="score-team">{match.battingTeam ? match.battingTeam.substring(0, 3).toUpperCase() : 'BAT'}</span>
                        <span className="score-main">
                            {match.score}-{match.wickets}
                        </span>
                        <span className="score-overs">
                            {getOvers(legalDeliveries)} / {match.maxOvers || 5}
                        </span>
                    </div>

                    <div className="projected-score">
                        {match.isSecondInnings && remainIPL > 0
                            ? `NEED ${runsNeeded} RUNS IN ${remainIPL} BALLS`
                            : `EXTRAS: ${match.extras?.total || 0} | PROJ: ${Math.floor((match.score / Math.max(1, (legalDeliveries / 6))) * (match.maxOvers || 20))}`}
                    </div>

                </div>

                {/* BOWLER PANEL */}
                <div className="bowler-panel anim-ipl2026-panel-right">

                    <div className="branding anim-ipl2026-drop">
                        {match.tournamentName ? match.tournamentName.toUpperCase() : "LIVE MATCH"}
                    </div>

                    <div className="bowler-header">
                        <div className="bowler-name">
                            {match.bowler?.name || 'BOWLER'}
                        </div>
                        <div className="bowler-figures">
                            {match.bowler?.wickets || 0}-{match.bowler?.runs || 0} ({getOvers(Math.round((match.bowler?.overs||0)*(match.ballsPerOver||6)))})
                        </div>
                    </div>

                    <div className="last-balls">
                        {Array.from({ length: Math.min(6, Math.max(bpo, balls.length)) }).map((_, i) => {
                            const b = balls[balls.length - 1 - i] || '';
                            if (!b) return null;
                            let bClass = "ball";
                            if (b === '4') bClass += " four";
                            else if (b === '6') bClass += " six";
                            else if (b.includes('W')) bClass += " wicket";
                            return (
                                <div key={i} className={bClass}>
                                    {b === '•' ? '0' : b}
                                </div>
                            );
                        }).reverse()}
                    </div>

                </div>

                {/* RIGHT TEAM — Bowling Logo + Abbreviation */}
                <div className="team team-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '4px 8px' }}>
                  <TeamLogo src={getAbsoluteUrl(match.leagueLogo)} teamName={match.bowlingTeam} size={44} style={{ border: '2px solid rgba(255,255,255,0.3)', boxShadow: '0 0 10px rgba(255,255,255,0.15)' }} />
                  <span style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '1px', color: '#fff' }}>{match.bowlingTeam ? match.bowlingTeam.substring(0, 3).toUpperCase() : 'BOWL'}</span>
                </div>

              </div>
            );
          })() : active.isAbuDhabiT10 ? (() => {
            const bpo = match.ballsPerOver || 6;
            const legalDeliveries = match.legalBallCount ?? match.totalBalls ?? 0;
            const maxOvers = match.maxOvers || 10;
            const oversStr = getOvers(legalDeliveries);
            const totalMatchBalls = match.targetBalls > 0 ? match.targetBalls : maxOvers * bpo;
            const remainBalls = match.manualBallsOverride
              ? (match.manualBallsValue || 0)
              : Math.max(0, totalMatchBalls - legalDeliveries);
            const runsNeeded = match.isSecondInnings ? Math.max(0, (match.targetScore || 0) - match.score) : 0;
            const crr = legalDeliveries > 0 ? (match.score / (legalDeliveries / bpo)).toFixed(2) : "0.00";

            const striker = match.player1?.onStrike ? match.player1 : match.player2;
            const nonStriker = match.player1?.onStrike ? match.player2 : match.player1;
            const bowler = match.bowler;
            const bowlerOversStr = bowler?.figures && bowler.figures !== '0-0 (0.0)'
              ? bowler.figures.split(' ')[1]?.replace(/[()]/g, '') || getOvers(Math.round((bowler?.overs || 0) * (match.ballsPerOver || 6)))
              : getOvers(Math.round((bowler?.overs || 0) * (match.ballsPerOver || 6)));

            const teamShort = match.battingTeam ? (match.battingTeam.length <= 4 ? match.battingTeam.toUpperCase() : match.battingTeam.substring(0, 3).toUpperCase()) : 'BAT';

            return (
              <div className="t10-container anim-t10-entrance">
                {/* Free hit live badge */}
                {match.freeHitActive && (
                  <div className="t10-freehit-pill">⚡ FREE HIT</div>
                )}

                {/* Event celebration banner (FOUR / SIX / WICKET) */}
                {showEvent && ["FOUR", "SIX", "WICKET"].includes(eventType) && (
                  <div className={`t10-event-banner t10-event-${eventType.toLowerCase()}`}>
                    <span className="t10-event-title">{eventType}</span>
                    {eventType === "WICKET" && eventWicketName && (
                      <span className="t10-event-sub">{eventWicketName} {getHowOutText()}</span>
                    )}
                  </div>
                )}

                {/* Outer scaler for responsive fit across any resolution */}
                <div className="t10-outer-scaler">
                  <div className="relative w-[1920px] h-[135px] overflow-hidden bg-transparent text-white font-['Barlow'] select-none t10-figma-bar">
                    {/* Background Navy */}
                    <div className="absolute inset-y-0 left-[150px] w-[1620px]" style={{ background: '#05091D' }} />

                    {/* Left Team Logo (Batting Team) */}
                    <div className="absolute left-0 top-0 h-[135px] w-[150px] bg-[#2f5be0] flex items-center justify-center p-2">
                      <TeamLogo src={getAbsoluteUrl(match.battingLogo)} teamName={match.battingTeam} size={120} style={{ maxHeight: '125px', maxWidth: '140px', objectFit: 'contain' }} />
                    </div>

                    {/* Left Player Information */}
                    <div className="absolute left-[150px] top-0 h-[135px] w-[550px]">
                      {/* Striker Row */}
                      <div className="absolute left-0 w-full h-[44px] flex items-center top-[20px]">
                        <span className="w-[330px] pl-[70px] text-[34px] font-bold tracking-wide leading-none flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
                          {striker?.name || 'KANISHKA'}
                          {striker?.onStrike && <span className="text-[#C6A12B] text-[24px]">★</span>}
                        </span>
                        <span className="w-[90px] text-[40px] font-bold leading-none tabular-nums text-right pr-4">
                          {striker?.runs ?? 0}
                        </span>
                        <span className="text-[19px] font-semibold leading-none tabular-nums opacity-90 text-slate-300">
                          {striker?.balls ?? 0}
                        </span>
                      </div>

                      {/* Non-Striker Row */}
                      <div className="absolute left-0 w-full h-[44px] flex items-center top-[72px]">
                        <span className="w-[330px] pl-[70px] text-[34px] font-bold tracking-wide leading-none overflow-hidden text-ellipsis whitespace-nowrap">
                          {nonStriker?.name || 'SANJU'}
                        </span>
                        <span className="w-[90px] text-[40px] font-bold leading-none tabular-nums text-right pr-4">
                          {nonStriker?.runs ?? 0}
                        </span>
                        <span className="text-[19px] font-semibold leading-none tabular-nums opacity-90 text-slate-300">
                          {nonStriker?.balls ?? 0}
                        </span>
                      </div>
                    </div>

                    {/* Center White Lightning SVG */}
                    <svg className="absolute left-[700px] top-0" width="520" height="135" viewBox="0 0 520 135">
                      <polygon points="50,3 470,3 440,50 510,40 446,92 470,132 50,132 74,92 10,40 80,50" fill="#fff" />
                      <polyline points="50,132 74,92 10,40 80,50 50,3" fill="none" stroke="#C6A12B" strokeWidth="5" strokeLinejoin="miter" />
                      <polyline points="470,3 440,50 510,40 446,92 470,132" fill="none" stroke="#C6A12B" strokeWidth="5" strokeLinejoin="miter" />
                      <line x1="50" y1="3" x2="470" y2="3" stroke="#C6A12B" strokeWidth="5" />
                      <line x1="50" y1="132" x2="470" y2="132" stroke="#C6A12B" strokeWidth="5" />
                    </svg>

                    {/* Current Score */}
                    <div className="absolute left-[780px] top-[14px] w-[360px] h-[64px] flex items-center justify-center gap-[40px] text-[#05091D] leading-none">
                      <span className="font-['Roboto_Slab'] font-black text-[60px]">{teamShort}</span>
                      <span className="font-['Roboto_Slab'] font-black text-[74px] tabular-nums">{match.score}-{match.wickets}</span>
                    </div>

                    {/* Target and Overs */}
                    <div className="absolute left-[780px] top-[90px] w-[360px] flex justify-center gap-[30px] text-[#05091D] text-[25px] font-bold leading-none">
                      <span>{match.isSecondInnings && match.targetScore > 0 ? `TARGET ${match.targetScore}` : `1ST INNINGS`}</span>
                      <span>{oversStr} OVERS</span>
                    </div>

                    {/* Right Bowler Information */}
                    <div className="absolute left-[1220px] top-[20px] w-[550px] h-[44px] flex items-center">
                      <span className="w-[300px] text-center text-[34px] font-bold tracking-wide leading-none overflow-hidden text-ellipsis whitespace-nowrap">
                        {bowler?.name || 'BOULT'}
                      </span>
                      <span className="w-[150px] text-[40px] font-bold leading-none tabular-nums text-right pr-4">
                        {bowler?.wickets ?? 0}-{bowler?.runs ?? 0}
                      </span>
                      <span className="text-[19px] font-semibold leading-none tabular-nums opacity-90 text-slate-300">
                        {bowlerOversStr}
                      </span>
                    </div>

                    {/* Match Situation */}
                    <div className="absolute left-[1230px] top-[72px] w-[530px] h-[44px] flex items-center justify-center whitespace-nowrap text-[30px] font-medium leading-none">
                      {match.isSecondInnings ? (
                        runsNeeded <= 0 ? (
                          <span className="text-[#C6A12B] font-bold">{match.battingTeam ? match.battingTeam.toUpperCase() : 'BATTING TEAM'} WON</span>
                        ) : (
                          <span>To WIN <b className="font-bold text-white">{runsNeeded}</b> RUNS FROM <b className="font-bold text-white">{remainBalls}</b> BALLS</span>
                        )
                      ) : (
                        <span>{match.tournamentName ? match.tournamentName.toUpperCase() : 'ABU DHABI T10'} • CRR <b className="font-bold text-white">{crr}</b></span>
                      )}
                    </div>

                    {/* Right Team Logo (Bowling Team) */}
                    <div className="absolute right-0 top-0 h-[135px] w-[150px] bg-[#cdb21f] flex items-center justify-center p-2">
                      <TeamLogo src={getAbsoluteUrl(match.leagueLogo)} teamName={match.bowlingTeam} size={120} style={{ maxHeight: '125px', maxWidth: '140px', objectFit: 'contain' }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })() : active.isApogee ? (() => {
            const bpo = match.ballsPerOver || 6;
            const balls = match.recentBalls || [];
            const legalDeliveries = match.legalBallCount ?? match.totalBalls ?? 0;
            const totalMatchBallsKSP = (match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * (match.ballsPerOver || 6));
            const remainApogee = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, totalMatchBallsKSP - legalDeliveries);
            const runsNeeded = match.isSecondInnings ? Math.max(0, match.targetScore - match.score) : 0;

            return (
              <div className="apogee-bar anim-apogee apogee-open">
                {showEvent && ["FOUR", "SIX", "WICKET"].includes(eventType) && (
                  <div className={`apogee-event-banner apogee-event-${eventType.toLowerCase()}`}>
                    <h1 className="apogee-event-title" style={eventType === "WICKET" ? { marginBottom: '0px' } : {}}>{eventType}</h1>
                    {eventType === "WICKET" && (
                      <div style={{ fontSize: '16px', fontWeight: 800, marginTop: '-5px', letterSpacing: '2px', color: '#fff', textAlign: 'center' }}>
                        {eventWicketName} - <span style={{ color: '#ffcc00' }}>{getHowOutText()}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="apogee-bar-glow" />
                <div className="apogee-bar-glow-soft" />
                
                <div className="apogee-panel apogee-panel-left">
                  <TeamLogo src={getAbsoluteUrl(match.battingLogo)} teamName={match.battingTeam} className="apogee-logo" size={52} />
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
                      {p.onStrike ? <div className="apogee-striker-arrow"><Play size="1em" fill="currentColor" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></div> : null}
                      <div className="apogee-batsman-name">{p.name}</div>
                      <div className="apogee-batsman-stats">{p.runs} <span className="apogee-batsman-balls">({p.balls})</span></div>
                    </div>
                  ) : null)}
                </div>
                
                <div className="apogee-panel apogee-panel-bowler">
                  <div className="apogee-bowler-info">
                    <div className="apogee-bowler-name">{match.bowler?.name || 'SELECT BOWLER'}</div>
                    <div className="apogee-bowler-figures">
                      {match.bowler?.figures && match.bowler.figures !== '0-0 (0.0)'
                        ? match.bowler.figures
                        : match.bowler?.name
                          ? `${match.bowler.wickets || 0}-${match.bowler.runs || 0} (${getOvers(Math.round((match.bowler.overs||0)*(match.ballsPerOver||6)))})`
                          : '—'
                      }
                    </div>
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

                {/* Bowling team logo — always visible; stacked with target in 2nd innings */}
                <div className="apogee-panel apogee-panel-logo-right" style={{ flexDirection: 'column', gap: '4px' }}>
                  <TeamLogo src={getAbsoluteUrl(match.leagueLogo)} teamName={match.bowlingTeam} className="apogee-logo-right" size={48} />
                  {match.isSecondInnings && runsNeeded > 0 && (
                    <div style={{ textAlign: 'center', marginTop: '2px' }}>
                      <div className="apogee-target-label" style={{ fontSize: '9px' }}>NEED</div>
                      <div className="apogee-target-num" style={{ fontSize: '16px' }}>{runsNeeded}/{remainApogee}b</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })() : ( <>

          {/* BROADCAST TICKER — sits above the scoreboard bar */}
          <BroadcastTicker matchId={matchId} tickerData={match?.ticker} />
          <div className={`flex h-28 ${active.main} items-stretch relative overflow-hidden ${active.isWC2026 ? `${active.border} wc2026-open` : `border-t-2 ${active.border} scoreboard-open`} shadow-2xl ${boardAnimClass}`}>

            {/* INLINE EVENT BANNER — contained within scoreboard */}
            {showEvent && !active.isNewKSColor && !active.isNewIpl && !active.isKsPremium && ["FOUR", "SIX", "WICKET"].includes(eventType) && (
              <div className={`event-banner event-banner-${eventType.toLowerCase()}`}>
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
                    {eventType === "WICKET" ? "WICKET" : "BOUNDARY"}
                  </p>
                  <h1 className="event-banner-title" style={eventType === "WICKET" ? { marginBottom: '-5px' } : {}}>
                    {eventType === "WICKET"
                      ? <>{eventWicketName} <span className="event-banner-stat">{eventWicketRuns}({eventWicketBalls})</span> OUT!</>
                      : eventType === "FOUR" ? "IT'S A FOUR!" : "MASSIVE SIX!"}
                  </h1>
                  {eventType === "WICKET" && (
                    <p className="event-banner-subtitle" style={{ fontSize: '20px', marginTop: '5px', color: '#ffcc00', letterSpacing: '0.1em', fontWeight: 800 }}>
                      {getHowOutText()}
                    </p>
                  )}
                  <div className="event-banner-accent" />
                </div>
              </div>
            )}

            {/* TEAM & LOGO SECTION */}
            <div className={`flex items-center w-[35%] pl-4 gap-4 ${active.main} ${active.isWC2026 ? 'wc2026-content-reveal' : 'content-reveal'}`}>
              <TeamLogo src={getAbsoluteUrl(match.battingLogo)} teamName={match.battingTeam} className="h-16 w-16 rounded-full object-contain shadow-lg" size={64} style={{ background: 'rgba(255,255,255,0.12)', padding: '4px' }} />
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
                       {match.matchStatus === 'Rain Delay' && <><Umbrella size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> </>}{match.matchStatus}
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
              <div className={`wc2026-strike wc2026-content-reveal ${showEvent && (eventType === 'FOUR' || eventType === 'SIX') ? 'wc2026-strike-active' : ''}`} />
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
                    <span className="text-broadcast-glow">
                      {match.bowler?.figures && match.bowler.figures !== '0-0 (0.0)'
                        ? match.bowler.figures
                        : `${match.bowler.wickets || 0}-${match.bowler.runs || 0} (${getOvers(Math.round((match.bowler.overs||0)*(match.ballsPerOver||6)))})`
                      }
                    </span>
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

            <div className="w-24 bg-black flex flex-col items-center justify-center p-2 border-l border-gray-800 gap-1">
              <TeamLogo src={getAbsoluteUrl(match.leagueLogo)} teamName={match.bowlingTeam} className="h-16 w-16 object-contain" size={64} />
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


