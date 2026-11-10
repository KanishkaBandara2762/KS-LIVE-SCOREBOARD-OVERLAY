import React, { useState, useEffect, useRef } from "react";
import { Activity, ArrowLeft, ArrowUpRight, Check, ChevronDown, ChevronUp, Circle, Coins, Flag, Folder, Hourglass, Image as ImageIcon, Info, Pause, Radio, RefreshCw, Rocket, Save, Settings, Sparkles, Tv, TriangleAlert, Umbrella, X, Zap } from 'lucide-react';
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { ref, onValue, set, update } from "firebase/database";
import ComboboxPlayerInput from './ComboboxPlayerInput';
import LanguageSwitcher from "./LanguageSwitcher";
import { useLanguage } from "../i18n/LanguageContext";
import { createMatchEvent } from "../utils/matchEvent";
import { generateMatchKey } from "../utils/matchKey";
import { matchesApi, tournamentsApi, ensureBroadcastLink } from "../api";

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);
// Netlify Functions cannot host persistent Socket.IO connections.
const USE_SOCKET =
  import.meta.env.VITE_REALTIME_MODE === 'socket' ||
  (!import.meta.env.PROD && import.meta.env.VITE_REALTIME_MODE !== 'polling');
const isMongoDB = (id) => true;

const getAbsoluteUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const AdminPanel = () => {
  const { t } = useLanguage();
  const { matchId: urlMatchId } = useParams();
  const navigate = useNavigate();

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
    ballsPerOver: 6,
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
    showToss: false,
    themeID: "ICC_GLOBAL",
    eventTrigger: null,
    eventTime: null,
    eventId: null,
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
    overLocked: false,
    matchType: "T20",
    matchTitle: "",
    matchStatus: "Live",
    tournamentName: "",
    venueName: "",
    matchDate: "",
    sponsorText: "",
    autoShowBanner: true,
    matchKey: generateMatchKey(),
    publicScorePreview: true,
    slug: ""
  };

  const [match, setMatch] = useState(() => {
    const saved = localStorage.getItem("ks_master_record");
    return saved ? JSON.parse(saved) : initialState;
  });

  const [history, setHistory] = useState([]);
  const [showLivePreview, setShowLivePreview] = useState(true);
  const [customExtraType, setCustomExtraType] = useState("WD");
  const [customExtraRuns, setCustomExtraRuns] = useState(0);

  // Run Out State
  const [showRunOutPanel, setShowRunOutPanel] = useState(false);
  const [runOutRuns, setRunOutRuns] = useState(0);
  const [runOutPlayer, setRunOutPlayer] = useState('striker');

  const [overCooldown, setOverCooldown] = useState(false);
  const [overlayCopied, setOverlayCopied] = useState(false);
  const [showNextMatch, setShowNextMatch] = useState(false);
  const isFromFirebase = useRef(false);
  const prevMatchRef = useRef(null);

  // ── OBS Overlay Refresh state ──────────────────────────────────
  const [refreshStatus, setRefreshStatus] = useState('idle'); // 'idle' | 'success' | 'failed'
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const autoRefreshIntervalRef = useRef(null);

  // ── Logo Upload state (isolated — never touches match events) ───
  const [logoUploadStatus, setLogoUploadStatus] = useState({ A: 'idle', B: 'idle' }); // 'idle'|'uploading'|'success'|'error'
  const [logoUploadError, setLogoUploadError] = useState({ A: null, B: null });
  const fileInputA = useRef(null);
  const fileInputB = useRef(null);

  // ── Multi-match: derive DB paths from URL matchId or stored match key ──
  const matchDbId = urlMatchId || match?.matchKey;
  const dbPath = matchDbId ? `matches/${matchDbId}/live_match` : 'live_match';
  const tickerPath = matchDbId ? `matches/${matchDbId}/overlay_ticker` : 'overlay_ticker';
  const overlayUrl = typeof window !== "undefined"
    ? `${window.location.origin}/overlay/${matchDbId || ''}`
    : `/overlay/${matchDbId || ''}`;

  // ── Local Match Info State ──────────────────────────────────────
  const [tourneyData, setTourneyData] = useState({ name: "", venue: "", date: "", sponsor: "" });

  const [showWicketPanel, setShowWicketPanel] = useState(false);
  const [wicketDismissal, setWicketDismissal] = useState('Bowled');
  const [wicketFielder, setWicketFielder] = useState('');

  // ── Broadcast Ticker State (separate from match) ──────────────────────
  const [tickerMsg, setTickerMsg] = useState("");
  const [tickerMode, setTickerMode] = useState("banner");    // "banner" or "breaking"
  const [tickerPreset, setTickerPreset] = useState("final");  // "final", "semi", "custom"
  const [tickerVisible, setTickerVisible] = useState(false);

  const [publicCopied, setPublicCopied] = useState(false);
  const [localSlug, setLocalSlug] = useState("");

  useEffect(() => {
    if (match.slug !== undefined) {
      setLocalSlug(match.slug || "");
    }
  }, [match.slug]);

  const handleCopyPublicUrl = () => {
    const publicUrl = `${window.location.origin}/live/match/${match.slug || matchDbId}`;
    navigator.clipboard.writeText(publicUrl);
    setPublicCopied(true);
    setTimeout(() => setPublicCopied(false), 2000);
  };

  const handleSaveSlug = () => {
    const sanitized = localSlug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    setMatch(prev => ({ ...prev, slug: sanitized }));
  };

  // Sync local tournament info from match state softly
  useEffect(() => {
    if (match) {
      setTourneyData(prev => ({
        ...prev,
        // Only patch empty local fields to avoid overwriting user typing
        name: prev.name || match.tournamentName || "",
        venue: prev.venue || match.venueName || "",
        date: prev.date || match.matchDate || "",
        sponsor: prev.sponsor || match.sponsorText || ""
      }));
    }
  }, [match.tournamentName, match.venueName, match.matchDate, match.sponsorText]);

  useEffect(() => {
    if (!match?.matchKey) {
      setMatch((prev) => ({ ...prev, matchKey: generateMatchKey() }));
    }
  }, [match?.matchKey]);

  // Sync ticker state from Firebase on load
  useEffect(() => {
    if (isMongoDB(matchDbId)) return;
    const tickerRef = ref(db, tickerPath);
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
  }, [tickerPath, matchDbId]);

  // Push ticker changes (dual-mode)
  const pushTicker = (overrides = {}) => {
    const msg = overrides.message ?? tickerMsg;
    const vis = overrides.visible ?? tickerVisible;
    const mode = overrides.mode ?? tickerMode;

    if (isMongoDB(matchDbId)) {
      matchesApi.toggleTicker(matchDbId, {
        message: msg,
        mode: mode,
        visible: vis,
      }).catch(() => {});
      setTickerMsg(msg);
      setTickerVisible(vis);
      setTickerMode(mode);
      return;
    }

    const payload = {
      message: msg,
      mode: mode,
      preset: overrides.preset ?? tickerPreset,
      visible: vis,
      timestamp: Date.now(),
    };
    update(ref(db, tickerPath), payload);
  };

  // --- DUAL-MODE DATA SYNC ---
  useEffect(() => {
    if (isMongoDB(matchDbId)) {
      matchesApi.get(matchDbId)
        .then(res => {
          if (res.match) {
            const flattenedMatch = {
              ...res.match,
              themeID: res.match.overlaySettings?.themeID || 'IPL_GOLD',
              battingLogo: res.match.overlaySettings?.battingLogo || '',
              leagueLogo: res.match.overlaySettings?.leagueLogo || '',
              showVersus: res.match.overlaySettings?.showVersus || false,
              showSummary: res.match.overlaySettings?.showSummary || false,
              showMatchSituation: res.match.overlaySettings?.showMatchSituation || false,
              showToss: res.match.overlaySettings?.showToss || false,
            };
            setMatch(flattenedMatch);
            if (res.ticker) {
              setTickerMsg(res.ticker.message || "");
              setTickerMode(res.ticker.mode || "banner");
              setTickerVisible(!!res.ticker.visible);
            }
          }
        })
        .catch(() => {});

      let socket;
      if (USE_SOCKET) import('socket.io-client').then(({ io }) => {
        socket = io(`${API_URL}/admin`, {
          query: { matchId: matchDbId },
          transports: ['websocket', 'polling'],
        });
        socket.on('connection:ack', ({ snapshot }) => { 
          if (snapshot) {
            setMatch(prev => {
              const updated = { ...prev, ...snapshot };
              if (snapshot.overlaySettings) {
                updated.themeID = snapshot.overlaySettings.themeID || prev.themeID || 'IPL_GOLD';
                updated.battingLogo = snapshot.overlaySettings.battingLogo || prev.battingLogo || '';
                updated.leagueLogo = snapshot.overlaySettings.leagueLogo || prev.leagueLogo || '';
                updated.showVersus = snapshot.overlaySettings.showVersus ?? prev.showVersus ?? false;
                updated.showSummary = snapshot.overlaySettings.showSummary ?? prev.showSummary ?? false;
                updated.showMatchSituation = snapshot.overlaySettings.showMatchSituation ?? prev.showMatchSituation ?? false;
                updated.showToss = snapshot.overlaySettings.showToss ?? prev.showToss ?? false;
              }
              return updated;
            });
          }
        });
        socket.on('score:update', (data) => { 
          if (data) {
            setMatch(prev => {
              const updated = { ...prev, ...data };
              if (data.overlaySettings) {
                updated.themeID = data.overlaySettings.themeID || prev.themeID || 'IPL_GOLD';
                updated.battingLogo = data.overlaySettings.battingLogo || prev.battingLogo || '';
                updated.leagueLogo = data.overlaySettings.leagueLogo || prev.leagueLogo || '';
                updated.showVersus = data.overlaySettings.showVersus ?? prev.showVersus ?? false;
                updated.showSummary = data.overlaySettings.showSummary ?? prev.showSummary ?? false;
                updated.showMatchSituation = data.overlaySettings.showMatchSituation ?? prev.showMatchSituation ?? false;
                updated.showToss = data.overlaySettings.showToss ?? prev.showToss ?? false;
              }
              return updated;
            });
          }
        });
        socket.on('score:correction', (data) => { if (data) setMatch(prev => ({ ...prev, ...data })); });
        socket.on('players:update', (data) => { if (data) setMatch(prev => ({ ...prev, ...data })); });
        socket.on('ticker:update', (data) => {
          if (data.ticker) {
            setTickerMsg(data.ticker.message || '');
            setTickerMode(data.ticker.mode || 'banner');
            setTickerVisible(!!data.ticker.visible);
          }
        });
      }).catch(e => console.error(e));
      return () => { if (socket) socket.disconnect(); };
    } else {
      const squadRef = ref(db, dbPath);
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
              bowler: currentBowler,
              score: data.score ?? prev.score,
              wickets: data.wickets ?? prev.wickets,
              totalBalls: data.totalBalls ?? prev.totalBalls,
              recentBalls: data.recentBalls ?? prev.recentBalls,
              overRuns: data.overRuns ?? prev.overRuns,
              legalBallCount: data.legalBallCount ?? prev.legalBallCount,
              currentOver: data.currentOver ?? prev.currentOver,
              overLocked: data.overLocked ?? prev.overLocked,
            };
          });
        }
      });
      return () => unsubscribe();
    }
  }, [matchDbId, dbPath]);

  // ── Diff-based database push (dual-mode) ──────────────────
  useEffect(() => {
    if (isFromFirebase.current) {
      isFromFirebase.current = false;
      prevMatchRef.current = match;
      localStorage.setItem("ks_master_record", JSON.stringify(match));
      return;
    }
    localStorage.setItem("ks_master_record", JSON.stringify(match));

    const prev = prevMatchRef.current;
    if (!prev) {
      prevMatchRef.current = match;
      return;
    }

    const delta = {};
    for (const key of Object.keys(match)) {
      const curVal = match[key];
      const prevVal = prev[key];
      if (curVal !== prevVal) {
        if (typeof curVal === 'object' && curVal !== null) {
          if (JSON.stringify(curVal) !== JSON.stringify(prevVal)) {
            delta[key] = curVal;
          }
        } else {
          delta[key] = curVal;
        }
      }
    }

    if (Object.keys(delta).length > 0) {
      if (isMongoDB(matchDbId)) {
        matchesApi.updateMatch(matchDbId, delta).catch(() => {});
      } else {
        update(ref(db, dbPath), delta);
      }
    }
    prevMatchRef.current = match;
  }, [match, matchDbId, dbPath]);

  // ── Image compressor for Firebase storage (RTDB has field size limits) ──
  // Resizes to max 300×300px and outputs as PNG (preserves transparency).
  // Falls back to JPEG at 0.85 quality if PNG is still too large.
  const compressImageForOverlay = (file) =>
    new Promise((resolve, reject) => {
      const MAX_DIM = 300;
      const MAX_BYTES = 180000; // ~180 KB base64 safe for Firebase RTDB
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onloadend = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let { width: w, height: h } = img;
          if (w > MAX_DIM || h > MAX_DIM) {
            const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          let dataUrl = canvas.toDataURL('image/png');
          if (dataUrl.length > MAX_BYTES) {
            // PNG too large — fall back to JPEG (loses transparency)
            dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          }
          resolve(dataUrl);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

  const handleLogoUpload = async (e, team) => {
    const file = e.target.files[0];
    // Reset input so the same file can be re-selected after a failed upload
    if (e.target) e.target.value = '';
    if (!file) return;

    const logoField = team === 'A' ? 'battingLogo' : 'leagueLogo';
    const uploadTs = Date.now();

    // ── Validation (file type + size) ──────────────────────────────
    const ACCEPTED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!ACCEPTED.includes(file.type)) {
      setLogoUploadError(prev => ({ ...prev, [team]: 'Unsupported format. Use PNG, JPG, WEBP, or SVG.' }));
      setLogoUploadStatus(prev => ({ ...prev, [team]: 'error' }));
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setLogoUploadError(prev => ({ ...prev, [team]: 'File too large. Max 3 MB.' }));
      setLogoUploadStatus(prev => ({ ...prev, [team]: 'error' }));
      return;
    }

    setLogoUploadStatus(prev => ({ ...prev, [team]: 'uploading' }));
    setLogoUploadError(prev => ({ ...prev, [team]: null }));

    try {
      // ── MongoDB: upload via REST, get back a hosted URL ──
      const formData = new FormData();
      formData.append('logo', file);
      formData.append('side', team === 'A' ? 'batting' : 'bowling');
      const res = await matchesApi.uploadLogo(matchDbId, formData);
      if (!res.success || !res.logoUrl) throw new Error(res.error || 'Upload failed');
      const fullUrl = res.logoUrl.startsWith('http') ? res.logoUrl : `${import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001')}${res.logoUrl.startsWith('/') ? '' : '/'}${res.logoUrl}`;

      // Update local React state properly formatted
      setMatch(prev => {
        const updated = { ...prev, [logoField]: fullUrl, logoUpdatedAt: uploadTs };
        if (res.match && res.match.overlaySettings) {
            updated.themeID = res.match.overlaySettings.themeID || prev.themeID || 'IPL_GOLD';
            updated.showVersus = res.match.overlaySettings.showVersus ?? prev.showVersus ?? false;
            updated.showSummary = res.match.overlaySettings.showSummary ?? prev.showSummary ?? false;
            updated.showMatchSituation = res.match.overlaySettings.showMatchSituation ?? prev.showMatchSituation ?? false;
        }
        return updated;
      });

      setLogoUploadStatus(prev => ({ ...prev, [team]: 'success' }));
      setTimeout(() => setLogoUploadStatus(prev => ({ ...prev, [team]: 'idle' })), 3000);
    } catch (err) {
      console.error('[AdminPanel] Logo upload failed:', err);
      setLogoUploadError(prev => ({
        ...prev,
        [team]: err.message || 'Upload failed. Please try again.',
      }));
      setLogoUploadStatus(prev => ({ ...prev, [team]: 'error' }));
    }
  };




  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Enter' && showWicketPanel) {
        e.preventDefault();
        handleWicket(wicketDismissal, wicketFielder);
        return;
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const key = e.key.toLowerCase();
      if (['0', '1', '2', '3'].includes(key)) addRun(parseInt(key));
      if (key === '4') addBoundary(4);
      if (key === '6') addBoundary(6);
      if (key === 'w') {
        if (showWicketPanel) {
          handleWicket(wicketDismissal, wicketFielder);
        } else {
          setShowWicketPanel(true);
        }
      }
      if (key === 's') swapStrike();
      if (key === 'u') handleUndo();
      if (key === 'm') toggleSummary();
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [match, history, showWicketPanel, wicketDismissal, wicketFielder]);

  const totalMatchBalls = (match.maxOvers || 5) * (match.ballsPerOver || 6);
  // Bug fix: use legalBallCount (legal deliveries only) for accurate remaining balls
  const legalDeliveries = match.legalBallCount ?? match.totalBalls ?? 0;
  const remainingBalls = Math.max(0, totalMatchBalls - legalDeliveries);

  const handleSaveMatchInfo = () => {
    setMatch(prev => ({
      ...prev,
      tournamentName: tourneyData.name,
      venueName: tourneyData.venue,
      matchDate: tourneyData.date,
      sponsorText: tourneyData.sponsor
    }));
  };

  const handleShowBanner = () => {
    setMatch(prev => ({
      ...prev,
      ...createMatchEvent("SHOW_BANNER")
    }));
  };

  const handleCopyOverlayUrl = async () => {
    if (!(await ensureBroadcastLink({ matchId: matchDbId, locked: match.broadcastLocked || Boolean(match.tournamentId) }))) return;
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setOverlayCopied(true);
      window.setTimeout(() => setOverlayCopied(false), 1800);
    } catch (error) {
      console.error("Overlay URL copy failed", error);
    }
  };

  const handleRegenerateMatchKey = () => {
    setMatch((prev) => ({ ...prev, matchKey: generateMatchKey() }));
  };

  // ── OBS Overlay Refresh ────────────────────────────────────────
  // refreshType: 'main' | 'ballByBall'
  const handleRefreshOverlay = async (refreshType = 'main') => {
    const ts = Date.now();
    const refreshPath = matchDbId
      ? `matches/${matchDbId}/overlayControl/refresh`
      : 'overlayControl/refresh';

    try {
      // For MongoDB matches, emit via Socket.IO so the overlay gets it instantly.
      // On Netlify Functions the overlay polls REST, so the emit is skipped.
      if (USE_SOCKET) {
        import('socket.io-client').then(({ io }) => {
          const sock = io(`${API_URL}/admin`, {
            query: { matchId: matchDbId },
            transports: ['websocket', 'polling'],
          });
          sock.emit('overlay:refresh', { matchId: matchDbId, type: refreshType, ts });
          setTimeout(() => sock.disconnect(), 3000);
        }).catch(() => {});
      }

      setRefreshStatus('success');
      setLastRefreshTime(new Date());
    } catch (err) {
      console.error('[AdminPanel] Overlay refresh failed:', err);
      setRefreshStatus('failed');
      setLastRefreshTime(new Date());
    }

    // Reset status badge after 4 seconds
    setTimeout(() => setRefreshStatus('idle'), 4000);
  };

  // ── Auto-refresh effect ────────────────────────────────────────
  useEffect(() => {
    if (autoRefreshEnabled) {
      autoRefreshIntervalRef.current = setInterval(() => {
        handleRefreshOverlay('main');
      }, 30000);
    } else {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    }
    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshEnabled]);

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
      setMatch({ ...initialState, battingTeam: match.battingTeam, bowlingTeam: match.bowlingTeam, battingLogo: match.battingLogo, leagueLogo: match.leagueLogo, legalBallCount: 0, currentOver: 0, overLocked: false, matchKey: generateMatchKey() });
      setHistory([]);
    }
  };

  const handleNewInnings = () => {
    if (match.isSecondInnings) {
      alert("Match is already in the 2nd innings. Action ignored to protect target score.");
      return;
    }
    if (window.confirm("Start 2nd innings?")) {
      setMatch(prev => {
        return {
          ...prev,
          battingTeam: prev.bowlingTeam, bowlingTeam: prev.battingTeam, battingLogo: prev.leagueLogo, leagueLogo: prev.battingLogo,
          firstInningsScore: prev.score, firstInningsWickets: prev.wickets, firstInningsOvers: prev.totalBalls,
          score: 0, wickets: 0, totalBalls: 0, recentBalls: [], overRuns: 0, fallOfWickets: [], showSummary: false,
          player1: { name: "SELECT P1", runs: 0, balls: 0, onStrike: true },
          player2: { name: "SELECT P2", runs: 0, balls: 0, onStrike: false },
          bowler: { name: "SELECT BOWLER", figures: "0-0 (0.0)" },
          isSecondInnings: true, targetScore: prev.score + 1, isSuperOver: false, ...createMatchEvent("RESET_WINNER"),
          legalBallCount: 0, currentOver: 0, overLocked: false
        };
      });
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
      recentBalls, overRuns,
      legalBallCount: (prev.legalBallCount || 0) + 1
    }));
  };

  // Dedicated boundary handler — ONLY called by FOUR/SIX buttons
  const addBoundary = (runs) => {
    if (match.overLocked) return;
    setHistory([...history, match]);
    const active = match.player1.onStrike ? "player1" : "player2";
    const { recentBalls, overRuns } = updateOverHistory(runs.toString(), match, runs);
    setMatch(prev => ({
      ...prev, score: prev.score + runs, totalBalls: prev.totalBalls + 1,
      [active]: { ...prev[active], runs: prev[active].runs + runs, balls: prev[active].balls + 1 },
      recentBalls, overRuns, ...createMatchEvent(runs === 6 ? "SIX" : "FOUR"),
      legalBallCount: (prev.legalBallCount || 0) + 1
    }));
  };

  const addExtra = (type, runs = 0) => {
    if (match.overLocked) return;
    setHistory([...history, match]);
    const totalExtraRuns = 1 + runs;
    const entry = runs > 0 ? `${type}+${runs}` : type;
    const { recentBalls, overRuns } = updateOverHistory(entry, match, totalExtraRuns);
    // Bug 9 fix: read from `prev` inside setMatch to avoid stale NB race condition
    setMatch(prev => {
      const active = prev.player1.onStrike ? "player1" : "player2";
      const batsmanUpdate = type === "NB"
        ? { [active]: { ...prev[active], runs: prev[active].runs + runs, balls: prev[active].balls + 1 } }
        : {};
      return { ...prev, score: prev.score + totalExtraRuns, recentBalls, overRuns, ...batsmanUpdate };
    });
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
      recentBalls, overRuns,
      legalBallCount: (prev.legalBallCount || 0) + 1
    }));
  };

  const handleWicket = (dismissalType = 'Bowled', fielderName = '') => {
    if (match.overLocked) return;
    setHistory([...history, match]);
    const outKey = match.player1.onStrike ? "player1" : "player2";
    const outPlayer = match[outKey];
    const { recentBalls, overRuns } = updateOverHistory("W", match, 0);
    const fow = { name: outPlayer.name, runs: outPlayer.runs, balls: outPlayer.balls, bowler: match.bowler.name, fowScore: match.score, fowWicket: match.wickets + 1, dismissalType, fielderName };
    setMatch(prev => ({
      ...prev, wickets: prev.wickets + 1, totalBalls: prev.totalBalls + 1, recentBalls, overRuns,
      fallOfWickets: [...prev.fallOfWickets, fow], ...createMatchEvent("WICKET"),
      lastWicketName: outPlayer.name, lastWicketRuns: outPlayer.runs, lastWicketBalls: outPlayer.balls,
      lastWicketDismissal: dismissalType, lastWicketFielder: fielderName,
      [outKey]: { name: "NEW PLAYER", runs: 0, balls: 0, onStrike: true },
      legalBallCount: (prev.legalBallCount || 0) + 1
    }));
  };

  const handleRunOut = () => {
    if (match.overLocked) return;
    setHistory([...history, match]);
    
    const strikerKey = match.player1.onStrike ? "player1" : "player2";
    const nonStrikerKey = match.player1.onStrike ? "player2" : "player1";
    const outKey = runOutPlayer === 'striker' ? strikerKey : nonStrikerKey;
    const outPlayer = match[outKey];
    
    const runString = runOutRuns > 0 ? `${runOutRuns}W` : "W";
    const { recentBalls, overRuns } = updateOverHistory(runString, match, runOutRuns);
    const fow = { name: outPlayer.name, runs: outPlayer.runs, balls: outPlayer.balls, bowler: match.bowler?.name || "", fowScore: match.score + runOutRuns, fowWicket: match.wickets + 1 };
    
    setMatch(prev => {
      let p1Strike = prev.player1.onStrike;
      let p2Strike = prev.player2.onStrike;
      
      let p1Balls = prev.player1.balls;
      let p2Balls = prev.player2.balls;
      let p1Runs = prev.player1.runs;
      let p2Runs = prev.player2.runs;

      // Add runs and balls to original striker
      if (p1Strike) { p1Balls++; p1Runs += runOutRuns; }
      else { p2Balls++; p2Runs += runOutRuns; }

      // Rotate strike if odd runs
      if (runOutRuns % 2 !== 0) {
        p1Strike = !p1Strike;
        p2Strike = !p2Strike;
      }

      // New player inherits the strike state of the slot they are filling
      const outKeyStrikeStatus = outKey === 'player1' ? p1Strike : p2Strike;

      return {
        ...prev,
        score: prev.score + runOutRuns,
        wickets: prev.wickets + 1,
        totalBalls: prev.totalBalls + 1,
        recentBalls, overRuns,
        fallOfWickets: [...(prev.fallOfWickets || []), fow],
        ...createMatchEvent("WICKET"),
        lastWicketName: outPlayer.name, lastWicketRuns: outPlayer.runs, lastWicketBalls: outPlayer.balls,
        player1: outKey === 'player1' 
          ? { name: "NEW PLAYER", runs: 0, balls: 0, onStrike: outKeyStrikeStatus } 
          : { ...prev.player1, runs: p1Runs, balls: p1Balls, onStrike: p1Strike },
        player2: outKey === 'player2' 
          ? { name: "NEW PLAYER", runs: 0, balls: 0, onStrike: outKeyStrikeStatus } 
          : { ...prev.player2, runs: p2Runs, balls: p2Balls, onStrike: p2Strike },
        legalBallCount: (prev.legalBallCount || 0) + 1
      };
    });
    setShowRunOutPanel(false);
    setRunOutRuns(0);
    setRunOutPlayer('striker');
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
      ...createMatchEvent("NEW_OVER"),
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
          <div className="flex items-center gap-2">
            <img src="/ks_logo.png" alt="KS Logo" className="h-7 w-auto object-contain" />
            <h1 className="font-bold tracking-tighter text-yellow-400 text-xl italic">{t("admin.header")}</h1>
          </div>
            <div className="flex gap-2 ml-4">
              <button onClick={async () => { if (await ensureBroadcastLink({ matchId: matchDbId, locked: match.broadcastLocked || Boolean(match.tournamentId) })) window.open(`/overlay/${matchDbId}`, '_blank'); }} className="text-[10px] bg-white/10 px-3 py-1 rounded hover:bg-white/20 font-black border border-white/10 text-white">Overlay <ArrowUpRight size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></button>
              {match.tournamentId && (
                <button onClick={async () => { if (await ensureBroadcastLink({ tournamentId: match.tournamentId, locked: true })) window.open(`/overlay/tournament/${match.tournamentId}`, '_blank'); }} className="text-[10px] bg-amber-500/20 text-amber-300 px-3 py-1 rounded hover:bg-amber-500/30 font-black border border-amber-500/30">Tournament Overlay <ArrowUpRight size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></button>
              )}
              <button onClick={() => window.open(`/teams/${matchDbId}`, '_blank')} className="text-[10px] bg-blue-600 px-3 py-1 rounded hover:bg-blue-500 font-black text-white">Teams <ArrowUpRight size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></button>
              <button onClick={() => window.open(`/mini-admin/${matchDbId}`, 'KS_Mini_Admin', 'width=480,height=850,resizable=yes,scrollbars=yes')} className="text-[10px] bg-yellow-500 px-3 py-1 rounded hover:bg-yellow-400 font-black text-black">Mini <Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></button>
              <button onClick={() => navigate('/dashboard')} className="text-[10px] bg-indigo-600 px-3 py-1 rounded hover:bg-indigo-500 font-black text-white"><ArrowLeft size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Dashboard</button>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <LanguageSwitcher compact />
            <button onClick={() => navigate('/account')} className="bg-slate-700 text-white px-3 py-1 rounded text-[10px] font-black shadow-lg"><Settings size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Account</button>
            {match.tournamentId && (
              <button onClick={() => setShowNextMatch(true)} className="bg-yellow-500 px-3 py-1 rounded text-[10px] font-black shadow-lg text-black animate-pulse"><Rocket size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> NEXT MATCH</button>
            )}
            <button onClick={handleNewMatch} className="bg-blue-600 px-3 py-1 rounded text-[10px] font-black shadow-lg">Match</button>
            <button onClick={handleNewInnings} className="bg-orange-500 px-3 py-1 rounded text-[10px] font-black shadow-lg">Innings</button>
            <button onClick={handleSuperOver} className="bg-red-500 px-3 py-1 rounded text-[10px] font-black shadow-lg">Super Over</button>
            <button onClick={handleUndo} className="bg-white/10 px-4 py-1 rounded text-xs font-bold border border-white/20">Undo (U)</button>
          </div>
        </div>

        {/* LIVE PREVIEW ROW */}
        <div className="bg-slate-800 px-6 py-3 border-b border-slate-700 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-black tracking-[0.15em] text-slate-300">LIVE OVERLAY MONITOR</span>
            </div>
            <button onClick={() => setShowLivePreview(p => !p)} className="text-[10px] font-bold px-3 py-1 bg-white/10 text-white hover:bg-white/20 rounded border border-white/10">
              {showLivePreview ? <>Hide Preview <ChevronUp size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></> : <>Show Preview <ChevronDown size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></>}
            </button>
          </div>
          {showLivePreview && (
            <div className="relative w-full bg-black rounded-lg overflow-hidden border border-slate-700 aspect-video max-h-[280px] shadow-inner flex items-center justify-center">
              <iframe
                src={overlayUrl}
                title="Live Overlay Monitor"
                className="absolute top-0 left-0 w-full h-full"
                style={{ border: 'none', pointerEvents: 'none' }}
              />
              <div className="absolute bottom-2 right-2 bg-black/75 backdrop-blur px-2.5 py-1 rounded text-[8px] tracking-[0.1em] text-slate-400 border border-white/10 pointer-events-none">
                RESOLUTION SCALED TO VIEWPORT
              </div>
            </div>
          )}
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* COLUMN 1: CONFIG & LOGOS */}
          <div className="space-y-4 border-r pr-4 text-center">
            <h2 className="font-bold text-blue-600 border-b pb-1 uppercase text-xs tracking-widest">{t("admin.section.setup")}</h2>
            {/* Added safely: overlay access helper without changing the existing overlay layout */}
            <div className="rounded border border-cyan-200 bg-cyan-50 p-3 text-left">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-cyan-700">{t("admin.overlayAccess")}</h3>
                <button
                  type="button"
                  onClick={handleCopyOverlayUrl}
                  className="rounded bg-cyan-600 px-2.5 py-1 text-[10px] font-black uppercase text-white hover:bg-cyan-700"
                >
                  {overlayCopied ? t("common.copied") : t("common.copy")}
                </button>
              </div>
              <p className="mt-2 text-[10px] font-bold text-slate-600">{t("admin.overlayInstruction")}</p>
              <input
                readOnly
                value={overlayUrl}
                className="mt-2 w-full rounded border border-cyan-200 bg-white p-2 text-[11px] font-bold text-slate-700"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-[10px] font-black uppercase text-slate-600">Match Key: <span className="text-cyan-700">{match.matchKey || "----"}</span></div>
                <button
                  type="button"
                  onClick={handleRegenerateMatchKey}
                  className="rounded border border-cyan-300 bg-white px-2.5 py-1 text-[10px] font-black uppercase text-cyan-700 hover:bg-cyan-100"
                >
                  New Key
                </button>
              </div>
            </div>

            {/* ── OBS OVERLAY REFRESH ──────────────────────────── */}
            <div className="rounded border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-3 text-left shadow-sm">
              <div className="flex items-center gap-2 mb-2.5">
                <RefreshCw size="1em" className="text-base" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-800">OBS Overlay Refresh</h3>
                {refreshStatus === 'success' && (
                  <span className="ml-auto text-[9px] font-black text-emerald-600 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full animate-pulse"><Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Success</span>
                )}
                {refreshStatus === 'failed' && (
                  <span className="ml-auto text-[9px] font-black text-red-600 bg-red-100 border border-red-300 px-2 py-0.5 rounded-full"><X size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Failed</span>
                )}
              </div>

              {/* Two refresh buttons */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  type="button"
                  id="refresh-main-overlay-btn"
                  onClick={() => handleRefreshOverlay('main')}
                  className="flex flex-col items-center justify-center gap-0.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded py-2 px-1 text-[9px] font-black uppercase tracking-wider shadow-md border-b-2 border-emerald-800 transition-all"
                >
                  <Tv size="1em" className="text-base leading-none" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />
                  <span>Refresh Main</span>
                  <span className="text-emerald-200 font-medium">Overlay</span>
                </button>
                <button
                  type="button"
                  id="refresh-ballbyball-overlay-btn"
                  onClick={() => handleRefreshOverlay('ballByBall')}
                  className="flex flex-col items-center justify-center gap-0.5 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white rounded py-2 px-1 text-[9px] font-black uppercase tracking-wider shadow-md border-b-2 border-teal-800 transition-all"
                >
                  <Activity size="1em" className="text-base leading-none" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />
                  <span>Refresh Ball</span>
                  <span className="text-teal-200 font-medium">by Ball</span>
                </button>
              </div>

              {/* Auto-refresh toggle */}
              <div className="flex items-center justify-between bg-white/70 border border-emerald-200 rounded px-2 py-1.5 mb-2">
                <div>
                  <p className="text-[9px] font-black text-emerald-800 uppercase tracking-wider">Auto-Refresh</p>
                  <p className="text-[8px] font-medium text-slate-500">Every 30 seconds</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="auto-refresh-toggle"
                    checked={autoRefreshEnabled}
                    onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Last refresh time */}
              <div className="flex items-center justify-between text-[9px] font-bold text-slate-500">
                <span>Last Refresh:</span>
                <span className={`font-black ${
                  lastRefreshTime ? 'text-emerald-700' : 'text-slate-400'
                }`}>
                  {lastRefreshTime
                    ? lastRefreshTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : '—'}
                </span>
              </div>
            </div>

            {/* Cricbuzz style Public Live Score Preview Settings */}
            {isMongoDB(matchDbId) && (
              <div className="rounded border border-indigo-200 bg-indigo-50/50 p-3 text-left space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-700"><Circle size="1em" fill="currentColor" className="text-emerald-500" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Public Live Preview</h3>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={match.publicScorePreview !== false}
                      onChange={(e) => setMatch(prev => ({ ...prev, publicScorePreview: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
                <p className="text-[10px] font-medium text-slate-500 leading-tight">
                  Allow anyone to view this match live. Uncheck to lock visibility.
                </p>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-indigo-700 tracking-wider uppercase block">Custom URL Slug</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={localSlug}
                      onChange={(e) => setLocalSlug(e.target.value)}
                      placeholder="e.g. final-2026"
                      className="w-full rounded border border-indigo-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={handleSaveSlug}
                      className="rounded bg-indigo-600 px-3 py-1 text-[10px] font-black uppercase text-white hover:bg-indigo-700 transition"
                    >
                      Save
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-indigo-100/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Shareable Preview Link</span>
                    <button
                      type="button"
                      onClick={handleCopyPublicUrl}
                      className="text-[9px] font-black uppercase text-indigo-600 hover:text-indigo-800 transition"
                    >
                      {publicCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <input
                    readOnly
                    value={`${window.location.origin}/live/match/${match.slug || matchDbId}`}
                    className="mt-1 w-full rounded border border-slate-200 bg-white/70 p-1.5 text-[10px] font-mono text-slate-600 select-all"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => window.open(`/live/match/${match.slug || matchDbId}`, '_blank')}
                  className="w-full py-1.5 rounded bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-black text-[10px] uppercase tracking-wider hover:from-indigo-700 hover:to-indigo-800 shadow-sm flex items-center justify-center gap-1 transition"
                >
                  <Radio size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Preview Live Dashboard
                </button>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded border border-slate-100">
              <div className="flex flex-col text-left">
                <label className="text-[9px] font-black text-slate-500 tracking-wider">FORMAT</label>
                <select className="border p-1.5 rounded text-xs font-bold" value={match.matchType || "T20"} onChange={(e) => setMatch({ ...match, matchType: e.target.value })}>
                  <option value="T20">T20</option><option value="ODI">ODI</option>
                  <option value="Test">Test</option><option value="T10">T10</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
              <div className="flex flex-col text-left">
                <label className="text-[9px] font-black text-slate-500 tracking-wider">STAGE/TITLE</label>
                <input type="text" className="border p-1.5 rounded text-xs font-bold" placeholder="FINAL" value={match.matchTitle || match.bowlingPrefix || ""} onChange={(e) => setMatch({ ...match, matchTitle: e.target.value, bowlingPrefix: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded">
              <div><label className="text-[8px] font-bold">OVERS</label><input type="number" className="w-full border p-2 rounded text-center" value={match.maxOvers} onChange={(e) => setMatch({ ...match, maxOvers: parseInt(e.target.value) })} /></div>
              <div><label className="text-[8px] font-bold">BPO</label><input type="number" className="w-full border p-2 rounded text-center" value={match.ballsPerOver} onChange={(e) => setMatch({ ...match, ballsPerOver: parseInt(e.target.value) })} /></div>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded">
              <div className="flex flex-col text-left col-span-2">
                <label className="text-[8px] font-bold block mb-1">INNINGS TYPE</label>
                <select className="w-full border p-1 rounded text-xs font-bold bg-white" value={match.isSecondInnings ? "2" : "1"} onChange={(e) => setMatch({ ...match, isSecondInnings: e.target.value === "2" })}>
                  <option value="1">1st Innings</option>
                  <option value="2">2nd Innings</option>
                </select>
              </div>
              <div className="col-span-2 mt-1 pt-2 border-t text-left">
                <label className="text-[8px] font-bold block mb-1">ALLOWED EXTRAS</label>
                <div className="grid grid-cols-2 gap-1 text-[9px] font-bold text-slate-600">
                  <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={match.extrasConfig?.wd !== false} onChange={(e)=>setMatch({...match, extrasConfig: {...match.extrasConfig, wd: e.target.checked}})} /> Wides</label>
                  <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={match.extrasConfig?.nb !== false} onChange={(e)=>setMatch({...match, extrasConfig: {...match.extrasConfig, nb: e.target.checked}})} /> No Balls</label>
                  <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={match.extrasConfig?.b !== false} onChange={(e)=>setMatch({...match, extrasConfig: {...match.extrasConfig, b: e.target.checked}})} /> Byes</label>
                  <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={match.extrasConfig?.lb !== false} onChange={(e)=>setMatch({...match, extrasConfig: {...match.extrasConfig, lb: e.target.checked}})} /> Leg Byes</label>
                </div>
              </div>
            </div>

            <select className="w-full border p-2 rounded text-xs font-black bg-white uppercase shadow-sm" value={match.themeID} onChange={(e) => setMatch({ ...match, themeID: e.target.value })}>
              <optgroup label="International Broadcast Flagships">
                <option value="ICC_GLOBAL">ICC T20 Global Apex (World Cup)</option>
                <option value="SKY_HYPERION">Sky Sports Hyperion Pro (UK)</option>
                <option value="JIO_TITAN">Jio Premier Titan (IPL 4K)</option>
                <option value="FOX_STRIKE">Fox Cricket BBL Strike (Action)</option>
                <option value="SUPERSPORT_AURA">SuperSport Aura Glass (Modern)</option>
                <option value="APEX">Apex (TV Broadcast)</option>
                <option value="DIAMOND">Diamond (Metallic)</option>
                <option value="VOLT">Volt (Lime Sports-Tech)</option>
                <option value="THUNDER">Thunder (Electric Red)</option>
                <option value="BLITZ">Blitz (Lightning Blue)</option>
                <option value="ELITE">Elite (Minimal Gold)</option>
                <option value="FRANCHISE">Franchise (Gradient)</option>
                <option value="SHAKTI">Shakti (Bold Contrast)</option>
              </optgroup>
              <optgroup label="Premier Modern Themes">
                <option value="NEW_KS_COLOR">Emerald Cricket Pro (KS Signature)</option>
                <option value="NEW_IPL">Tata IPL Modern (Franchise)</option>
                <option value="IPL_2026">IPL 2026 Stadium Capsule</option>
                <option value="KS_PREMIUM">KS Premium (Broadcast Flagship)</option>
                <option value="WC2026">T20 World Cup 2026 Electric</option>
                <option value="APOGEE">Apogee Arena Pro (Cyber HUD)</option>
                <option value="GOLD_CHAMPIONSHIP">Gold Championship (Grand Finals)</option>
              </optgroup>
            </select>

            <div className={`p-3 rounded border transition ${match.isSecondInnings ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Target Chase</h3>
                <input type="checkbox" checked={match.isSecondInnings} onChange={(e) => setMatch({ ...match, isSecondInnings: e.target.checked })} />
              </div>
              <input type="number" className="w-full border p-2 rounded text-sm font-black text-blue-700 text-center" value={match.targetScore} onChange={(e) => setMatch({ ...match, targetScore: parseInt(e.target.value) || 0 })} placeholder="Set Target" />
            </div>

            {/* MATCH STATUS SECTION */}
            <div className="space-y-2 pt-3 border-t mt-2">
              <h3 className="text-[9px] font-black text-slate-400 tracking-widest uppercase"><Radio size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Match Status</h3>
              <div className="grid grid-cols-2 gap-1.5">
                <button className={`py-1.5 rounded text-[10px] font-black ${match.matchStatus === 'Live' || !match.matchStatus ? "bg-red-600 text-white shadow-lg" : "bg-slate-200"}`} onClick={() => setMatch({ ...match, matchStatus: "Live" })}><Circle size="1em" fill="currentColor" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> LIVE</button>
                <button className={`py-1.5 rounded text-[10px] font-black ${match.matchStatus === 'Break' ? "bg-blue-600 text-white shadow-lg" : "bg-slate-200"}`} onClick={() => setMatch({ ...match, matchStatus: "Break" })}><Pause size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> BREAK</button>
                <button className={`py-1.5 rounded text-[10px] font-black ${match.matchStatus === 'Innings Break' ? "bg-amber-500 text-black shadow-lg" : "bg-slate-200"}`} onClick={() => setMatch({ ...match, matchStatus: "Innings Break" })}><RefreshCw size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> INN BREAK</button>
                <button className={`py-1.5 rounded text-[10px] font-black ${match.matchStatus === 'Rain Delay' ? "bg-blue-900 border border-blue-500 text-cyan-300 shadow-lg" : "bg-slate-200"}`} onClick={() => setMatch({ ...match, matchStatus: "Rain Delay" })}><Umbrella size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> RAIN</button>
              </div>
              <button className={`w-full py-1.5 mt-1 rounded text-[10px] font-black ${match.matchStatus === 'Match Ended' ? "bg-purple-700 text-white shadow-lg" : "bg-slate-200"}`} onClick={() => setMatch({ ...match, matchStatus: "Match Ended" })}><Flag size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> MATCH ENDED</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMatch({ ...match, showVersus: !match.showVersus })} className={`py-2 rounded font-bold text-[10px] ${match.showVersus ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}>Versus Tab</button>
              <button onClick={toggleSummary} className={`py-2 rounded font-bold text-[10px] ${match.showSummary ? 'bg-green-600 text-white' : 'bg-slate-200'}`}>Summary (M)</button>
            </div>
            <button
              onClick={() => setMatch({ ...match, showToss: !match.showToss })}
              className={`w-full py-2 rounded font-bold text-[10px] transition ${
                match.showToss ? 'bg-amber-500 text-white shadow-lg' : 'bg-slate-200'
              }`}
            >
              <Coins size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> {match.showToss ? 'HIDE TOSS RESULT' : 'SHOW TOSS RESULT'}
            </button>
            <button onClick={() => setMatch({ ...match, showMatchSituation: !match.showMatchSituation })} className={`w-full py-2 rounded font-bold text-[10px] transition ${match.showMatchSituation ? 'bg-purple-600 text-white shadow-lg' : 'bg-slate-200'}`}>Show Match Situation</button>
            <button onClick={() => setMatch({ ...match, overlayMode: match.overlayMode === 'full' ? 'simple' : 'full' })} className={`w-full py-2 rounded font-bold text-[10px] transition ${match.overlayMode === 'simple' ? 'bg-teal-600 text-white shadow-lg' : 'bg-slate-200'}`}>Switch Overlay: {match.overlayMode === 'full' ? 'FULL' : 'SIMPLE'}</button>

            {/* ── MATCH INFO & BANNER ──────────────────────── */}
            <div className="space-y-2 pt-3 border-t mt-3 bg-indigo-50 p-3 rounded border border-indigo-100">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-[9px] font-black text-indigo-700 tracking-widest uppercase"><Info size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Match Info & Banner</h3>
                <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border shadow-sm">
                   <label className="text-[8px] font-black text-slate-500 uppercase">Auto Show</label>
                   <input 
                     type="checkbox" 
                     className="ml-1" 
                     checked={match.autoShowBanner !== false} 
                     onChange={(e) => setMatch({ ...match, autoShowBanner: e.target.checked })} 
                   />
                </div>
              </div>
              <input type="text" className="w-full border p-1.5 rounded text-xs font-bold" placeholder="Tournament Name" value={tourneyData.name} onChange={(e) => setTourneyData({...tourneyData, name: e.target.value})} />
              <input type="text" className="w-full border p-1.5 rounded text-xs font-bold" placeholder="Venue / Ground Name" value={tourneyData.venue} onChange={(e) => setTourneyData({...tourneyData, venue: e.target.value})} />
              <input type="date" className="w-full border p-1.5 rounded text-xs font-bold" value={tourneyData.date} onChange={(e) => setTourneyData({...tourneyData, date: e.target.value})} />
              <input type="text" className="w-full border p-1.5 rounded text-xs font-bold" placeholder="Sponsor Text (e.g. Dream11)" value={tourneyData.sponsor} onChange={(e) => setTourneyData({...tourneyData, sponsor: e.target.value})} />
              
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button onClick={handleSaveMatchInfo} className="bg-indigo-600 text-white py-2 rounded text-[10px] font-black shadow-md hover:bg-indigo-700 transition">
                  <Save size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Save / Update
                </button>
                <button onClick={handleShowBanner} className="bg-cyan-500 text-white py-2 rounded text-[10px] font-black shadow-md hover:bg-cyan-600 transition">
                  <Sparkles size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> SHOW BANNER
                </button>
              </div>
            </div>

            {/* ── BROADCAST TICKER CONTROLS ──────────────────────── */}
            <div className="space-y-2 pt-3 border-t mt-2">
              <h3 className="text-[9px] font-black text-slate-400 tracking-widest uppercase"><Tv size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Broadcast Ticker</h3>
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
                  <option value="banner">Tournament</option>
                  <option value="breaking">Breaking News</option>
                </select>
                <select
                  className="border rounded text-[10px] p-1.5 font-black bg-white uppercase"
                  value={tickerPreset}
                  onChange={(e) => { setTickerPreset(e.target.value); pushTicker({ preset: e.target.value }); }}
                >
                  <option value="final">Final (Gold)</option>
                  <option value="semi">Semi Final (Blue)</option>
                  <option value="custom">Custom (Teal)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => pushTicker({ message: tickerMsg })}
                  className="bg-slate-700 text-white py-2 rounded text-[10px] font-black hover:bg-slate-800 transition"
                >
                  <Save size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Save Message
                </button>
                <button
                  onClick={() => { const newVis = !tickerVisible; setTickerVisible(newVis); pushTicker({ visible: newVis }); }}
                  className={`py-2 rounded text-[10px] font-black transition ${tickerVisible
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                >
                  {tickerVisible
                    ? <><Circle size="1em" fill="currentColor" className="text-red-300" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> HIDE TICKER</>
                    : <><Circle size="1em" fill="currentColor" className="text-green-200" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> SHOW TICKER</>}
                </button>
              </div>
            </div>

            {/* ── TEAM LOGO UPLOAD ─────────────────────────────────────── */}
            <div className="space-y-3 pt-2 border-t">
              <h3 className="text-[9px] font-black text-slate-400 tracking-widest uppercase"><ImageIcon size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Team Logos</h3>

              {/* Hidden file inputs */}
              <input ref={fileInputA} type="file" className="hidden" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml" onChange={(e) => handleLogoUpload(e, 'A')} />
              <input ref={fileInputB} type="file" className="hidden" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml" onChange={(e) => handleLogoUpload(e, 'B')} />

              {/* Team A Logo */}
              <div className="bg-blue-50 rounded border border-blue-100 p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  {/* Preview */}
                  <div className="w-12 h-12 rounded-full border-2 border-blue-200 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                    {match.battingLogo
                      ? <img src={getAbsoluteUrl(match.battingLogo)} className="w-full h-full object-contain" alt="A" onError={(e) => { e.target.style.display='none'; }} />
                      : <span className="text-blue-300 text-[9px] font-black">LOGO A</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      className="w-full border p-1.5 rounded font-bold bg-white text-sm border-blue-200 mb-1"
                      value={match.battingTeam}
                      onChange={(e) => setMatch({ ...match, battingTeam: e.target.value.toUpperCase() })}
                    />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        id="upload-logo-a-btn"
                        onClick={() => fileInputA.current?.click()}
                        disabled={logoUploadStatus.A === 'uploading'}
                        className={`flex-1 py-1 rounded text-[9px] font-black uppercase transition border ${
                          logoUploadStatus.A === 'uploading' ? 'bg-blue-200 text-blue-400 border-blue-200 cursor-wait' :
                          logoUploadStatus.A === 'success'   ? 'bg-green-500 text-white border-green-600' :
                          logoUploadStatus.A === 'error'     ? 'bg-red-100 text-red-600 border-red-300' :
                          'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
                        }`}
                      >
                        {logoUploadStatus.A === 'uploading' ? <><Hourglass size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Uploading…</> :
                         logoUploadStatus.A === 'success'   ? <><Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Uploaded!</> :
                         logoUploadStatus.A === 'error'     ? <><X size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Retry</> :
                         <><Folder size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Upload Team A Logo</>}
                      </button>
                      {match.battingLogo && (
                        <button
                          type="button"
                          onClick={() => setMatch(prev => ({ ...prev, battingLogo: '' }))}
                          className="px-2 py-1 rounded text-[9px] font-black bg-white border border-blue-200 text-blue-400 hover:text-red-500 hover:border-red-300 transition"
                          title="Remove logo"
                        >
                          <X size="1em" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    {logoUploadStatus.A === 'error' && logoUploadError.A && (
                      <p className="text-[8px] text-red-500 font-bold mt-0.5 leading-tight">{logoUploadError.A}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Team B Logo */}
              <div className="bg-red-50 rounded border border-red-100 p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  {/* Preview */}
                  <div className="w-12 h-12 rounded-full border-2 border-red-200 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                    {match.leagueLogo
                      ? <img src={getAbsoluteUrl(match.leagueLogo)} className="w-full h-full object-contain" alt="B" onError={(e) => { e.target.style.display='none'; }} />
                      : <span className="text-red-300 text-[9px] font-black">LOGO B</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      className="w-full border p-1.5 rounded font-bold bg-white text-sm border-red-200 mb-1"
                      value={match.bowlingTeam}
                      onChange={(e) => setMatch({ ...match, bowlingTeam: e.target.value.toUpperCase() })}
                    />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        id="upload-logo-b-btn"
                        onClick={() => fileInputB.current?.click()}
                        disabled={logoUploadStatus.B === 'uploading'}
                        className={`flex-1 py-1 rounded text-[9px] font-black uppercase transition border ${
                          logoUploadStatus.B === 'uploading' ? 'bg-red-200 text-red-400 border-red-200 cursor-wait' :
                          logoUploadStatus.B === 'success'   ? 'bg-green-500 text-white border-green-600' :
                          logoUploadStatus.B === 'error'     ? 'bg-red-100 text-red-600 border-red-300' :
                          'bg-red-600 text-white border-red-700 hover:bg-red-700'
                        }`}
                      >
                        {logoUploadStatus.B === 'uploading' ? <><Hourglass size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Uploading…</> :
                         logoUploadStatus.B === 'success'   ? <><Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Uploaded!</> :
                         logoUploadStatus.B === 'error'     ? <><X size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Retry</> :
                         <><Folder size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Upload Team B Logo</>}
                      </button>
                      {match.leagueLogo && (
                        <button
                          type="button"
                          onClick={() => setMatch(prev => ({ ...prev, leagueLogo: '', eventTrigger: prev.eventTrigger, eventTime: prev.eventTime }))}
                          className="px-2 py-1 rounded text-[9px] font-black bg-white border border-red-200 text-red-400 hover:text-red-600 hover:border-red-400 transition"
                          title="Remove logo"
                        >
                          <X size="1em" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    {logoUploadStatus.B === 'error' && logoUploadError.B && (
                      <p className="text-[8px] text-red-500 font-bold mt-0.5 leading-tight">{logoUploadError.B}</p>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-[8px] text-slate-400 font-medium leading-tight">PNG / JPG / WEBP · Max 5 MB · Auto-compressed for OBS</p>
            </div>
          </div>

          {/* COLUMN 2: ACTIVE SQUAD */}
          <div className="space-y-4 border-r pr-4">
            <h2 className="font-bold text-blue-600 border-b pb-1 uppercase text-xs tracking-widest">{t("admin.section.activeSquad")}</h2>
            <div className="bg-slate-50 p-2 rounded border border-blue-100">
              <label className="text-[8px] font-black text-slate-400 uppercase">Striker</label>
              <ComboboxPlayerInput 
                options={match.battingSquad} 
                className="w-full bg-white border p-2 rounded font-black text-sm uppercase focus:outline-blue-500" 
                value={match.player1.name} 
                onChange={(e) => setMatch({ ...match, player1: { ...match.player1, name: e.target.value } })} 
              />
            </div>
            <div className="bg-slate-50 p-2 rounded border border-blue-100">
              <label className="text-[8px] font-black text-slate-400 uppercase">Non-Striker</label>
              <ComboboxPlayerInput 
                options={match.battingSquad} 
                className="w-full bg-white border p-2 rounded font-black text-sm uppercase focus:outline-blue-500" 
                value={match.player2.name} 
                onChange={(e) => setMatch({ ...match, player2: { ...match.player2, name: e.target.value } })} 
              />
            </div>
            <button onClick={swapStrike} className="w-full py-2 bg-yellow-400 font-black text-xs rounded shadow-md border-b-4 border-yellow-600 active:translate-y-1 text-black">Swap Strike (S)</button>
            <div className="pt-4 border-t">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 text-center">Active Bowler</label>
              <ComboboxPlayerInput 
                options={match.bowlingSquad} 
                className="w-full border p-2 rounded font-black text-sm bg-slate-50 border-red-200 shadow-inner text-red-600 uppercase focus:outline-red-500" 
                value={match.bowler.name} 
                onChange={(e) => setMatch({ ...match, bowler: { ...match.bowler, name: e.target.value } })} 
              />
            </div>
          </div>

          {/* COLUMN 3: SCORING */}
          <div className="space-y-4">
            <h2 className="font-bold text-blue-600 border-b pb-1 uppercase text-xs tracking-widest">{t("admin.section.scoring")}</h2>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2, 3].map((r) => <button key={r} onClick={() => addRun(r)} className="bg-slate-800 text-white py-3 rounded font-black hover:bg-black transition text-xl shadow-md border-b-4 border-slate-950">+{r}</button>)}
              <button onClick={() => addBoundary(4)} className="bg-slate-800 text-white py-3 rounded font-black hover:bg-black transition text-xl shadow-md border-b-4 border-slate-950">+4</button>
              <button onClick={() => addBoundary(6)} className="bg-slate-800 text-white py-3 rounded font-black hover:bg-black transition text-xl shadow-md border-b-4 border-slate-950">+6</button>
            </div>
            {(match.extrasConfig?.wd !== false || match.extrasConfig?.nb !== false) && (
              <div className="p-3 bg-slate-50 rounded border border-slate-200 text-center">
                <p className="text-[9px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Extras Engine</p>
                <div className="flex gap-2 mb-3">
                  <select className="bg-white border rounded text-[10px] p-1 font-black" value={customExtraType} onChange={(e) => setCustomExtraType(e.target.value)}>
                    {match.extrasConfig?.wd !== false && <option value="WD">WIDE</option>}
                    {match.extrasConfig?.nb !== false && <option value="NB">NO BALL</option>}
                  </select>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4].map(num => (
                      <button key={num} onClick={() => setCustomExtraRuns(num)} className={`px-2 py-1 border rounded text-[10px] font-black transition ${customExtraRuns === num ? 'bg-blue-600 text-white' : 'bg-white'}`}>{num}</button>
                    ))}
                  </div>
                </div>
                <button onClick={() => addExtra(customExtraType, customExtraRuns)} className="w-full bg-orange-500 text-white py-2 rounded font-black text-[10px] uppercase shadow-md border-b-4 border-orange-700 active:translate-y-0.5">Add {customExtraType} + {customExtraRuns}</button>
              </div>
            )}
            {match.extrasConfig?.lb !== false && (
              <div className="p-3 bg-green-50 rounded border border-green-200 text-center">
                <p className="text-[9px] font-bold text-green-700 uppercase mb-2 tracking-widest">Leg Byes</p>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((r) => (
                    <button key={r} onClick={() => addLegBye(r)} className="bg-green-600 text-white py-2 rounded font-black text-xs shadow-md border-b-4 border-green-800 active:translate-y-0.5 hover:bg-green-700 transition">LB +{r}</button>
                  ))}
                </div>
              </div>
            )}
            {showRunOutPanel ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-center">
                <p className="text-[9px] font-bold text-red-700 uppercase mb-2 tracking-widest">Run Out Config</p>
                <div className="flex gap-2 justify-center mb-3">
                  <div className="flex flex-col text-left">
                    <label className="text-[10px] font-bold text-red-600">Runs Completed</label>
                    <select className="border border-red-300 rounded p-1 text-[11px] font-black outline-none" value={runOutRuns} onChange={(e) => setRunOutRuns(parseInt(e.target.value))}>
                      {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n} Runs</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col text-left">
                    <label className="text-[10px] font-bold text-red-600">Who is Out?</label>
                    <select className="border border-red-300 rounded p-1 text-[11px] font-black outline-none" value={runOutPlayer} onChange={(e) => setRunOutPlayer(e.target.value)}>
                      <option value="striker">Striker</option>
                      <option value="non-striker">Non-Striker</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowRunOutPanel(false)} className="flex-1 bg-white text-red-600 border border-red-200 py-2 rounded font-black text-[10px] uppercase shadow-sm">Cancel</button>
                  <button onClick={handleRunOut} className="flex-1 bg-red-600 text-white py-2 rounded font-black text-[10px] uppercase shadow-md border-b-2 border-red-800 active:translate-y-px">Confirm Run Out</button>
                </div>
              </div>
            ) : showWicketPanel ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-center">
                <p className="text-[9px] font-bold text-red-700 uppercase mb-2 tracking-widest">Wicket Details</p>
                <div className="flex flex-col gap-2 mb-3">
                  <div className="flex flex-col text-left">
                    <label className="text-[10px] font-bold text-red-600">How Out?</label>
                    <select className="border border-red-300 rounded p-1 text-[11px] font-black outline-none" value={wicketDismissal} onChange={(e) => setWicketDismissal(e.target.value)}>
                      <option value="Bowled">Bowled</option>
                      <option value="Caught">Caught</option>
                      <option value="Stumped">Stumped</option>
                      <option value="LBW">LBW</option>
                      <option value="Hit Wicket">Hit Wicket</option>
                      <option value="Retired Hurt">Retired Hurt</option>
                      <option value="Run Out">Run Out (use Run Out panel for run tracking)</option>
                    </select>
                  </div>
                  {(wicketDismissal === 'Caught' || wicketDismissal === 'Stumped') && (
                    <div className="flex flex-col text-left">
                      <label className="text-[10px] font-bold text-red-600">Fielder Name</label>
                      <input 
                        list="bowling-squad-list"
                        type="text" 
                        placeholder="Type or select fielder..." 
                        className="border border-red-300 rounded p-1 text-[11px] font-black outline-none" 
                        value={wicketFielder} 
                        onChange={(e) => setWicketFielder(e.target.value)} 
                      />
                      <datalist id="bowling-squad-list">
                        {(match.bowlingSquad || []).map((player, idx) => (
                          <option key={idx} value={player.name} />
                        ))}
                      </datalist>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowWicketPanel(false)} className="flex-1 bg-white text-red-600 border border-red-200 py-2 rounded font-black text-[10px] uppercase shadow-sm">Cancel</button>
                  <button onClick={() => handleWicket(wicketDismissal, wicketFielder)} className="flex-1 bg-red-600 text-white py-2 rounded font-black text-[10px] uppercase shadow-md border-b-2 border-red-800 active:translate-y-px">Confirm Wicket</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setShowWicketPanel(true)} className="flex-2 bg-red-600 text-white py-3 rounded font-black shadow-md border-b-4 border-red-800 active:translate-y-1 text-lg uppercase w-full">WKT (W)</button>
                <button onClick={() => setShowRunOutPanel(true)} className="flex-1 bg-red-800 text-white py-3 rounded font-black shadow-md border-b-4 border-red-950 active:translate-y-1 text-sm uppercase whitespace-nowrap px-2 flex flex-col justify-center items-center leading-none">
                  <span>RUN</span><span>OUT</span>
                </button>
              </div>
            )}

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
                  <TriangleAlert size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> OVER COMPLETE ({legalBallCount}/{match.ballsPerOver}) — Click OVER COMPLETED below!
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
                {overCooldown
                  ? <><Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> OVER LOCKED</>
                  : isOverReady
                    ? <><Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> OVER COMPLETED ({legalBallCount}/{match.ballsPerOver})</>
                    : <><Hourglass size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> {legalBallCount}/{match.ballsPerOver} BALLS</>}
              </button>
            </div>

            {/* CRR & RRR DISPLAY */}
            <div className="bg-slate-800 p-3 rounded shadow-lg border border-slate-700 text-white">
              <div className="flex justify-between items-center">
                <div className="text-center flex-1">
                  <p className="text-[8px] uppercase font-black tracking-widest text-slate-400">CRR</p>
                  <p className="text-xl font-black text-cyan-400">
                    {match.totalBalls > 0 ? (match.score / (match.totalBalls / 6)).toFixed(2) : "0.00"}
                  </p>
                </div>
                <div className="w-px h-10 bg-slate-600"></div>
                <div className="text-center flex-1">
                  <p className="text-[8px] uppercase font-black tracking-widest text-slate-400">RRR</p>
                  <p className="text-xl font-black text-orange-400">
                    {match.isSecondInnings && remainingBalls > 0
                      ? ((match.targetScore - match.score) / (remainingBalls / 6)).toFixed(2)
                      : "--"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {showNextMatch && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl text-white">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h2 className="font-bold text-lg text-yellow-400"><Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> DEPLOY NEXT MATCH</h2>
              <button onClick={() => setShowNextMatch(false)} className="text-slate-400 hover:text-white"><X size="1em" aria-hidden="true" /></button>
            </div>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target;
              const body = {
                battingTeam: form.battingTeam.value.toUpperCase(),
                bowlingTeam: form.bowlingTeam.value.toUpperCase(),
                maxOvers: parseInt(form.maxOvers.value) || 20,
                ballsPerOver: parseInt(form.ballsPerOver.value) || 6,
                matchType: form.matchType.value,
                matchTitle: form.matchTitle.value,
                themeID: form.themeID.value,
                matchDate: new Date().toISOString().split('T')[0],
              };

              try {
                const tId = typeof match.tournamentId === 'object' ? (match.tournamentId?.id || match.tournamentId?._id) : match.tournamentId;
                const res = await tournamentsApi.nextMatch(tId, body);
                setShowNextMatch(false);
                if (res.matchId) {
                  navigate(`/admin/${res.matchId}`);
                  window.location.reload();
                }
              } catch (err) {
                alert(err.message || "Failed to switch match");
              }
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col text-left">
                  <label className="text-[10px] font-bold text-slate-400 mb-1">BATTING TEAM</label>
                  <input name="battingTeam" required placeholder="e.g. COLOMBIA XI" className="bg-slate-800 border border-slate-700 p-2 rounded text-sm text-white" />
                </div>
                <div className="flex flex-col text-left">
                  <label className="text-[10px] font-bold text-slate-400 mb-1">BOWLING TEAM</label>
                  <input name="bowlingTeam" required placeholder="e.g. VAVUNIYA LIONS" className="bg-slate-800 border border-slate-700 p-2 rounded text-sm text-white" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col text-left">
                  <label className="text-[10px] font-bold text-slate-400 mb-1">FORMAT</label>
                  <select name="matchType" className="bg-slate-800 border border-slate-700 p-2 rounded text-sm text-white">
                    <option value="T20">T20</option>
                    <option value="T10">T10</option>
                    <option value="ODI">ODI</option>
                    <option value="Test">Test</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>
                <div className="flex flex-col text-left">
                  <label className="text-[10px] font-bold text-slate-400 mb-1">MAX OVERS</label>
                  <input name="maxOvers" type="number" defaultValue="20" className="bg-slate-800 border border-slate-700 p-2 rounded text-sm text-white" />
                </div>
                <div className="flex flex-col text-left">
                  <label className="text-[10px] font-bold text-slate-400 mb-1">BALLS/OVER</label>
                  <input name="ballsPerOver" type="number" defaultValue="6" className="bg-slate-800 border border-slate-700 p-2 rounded text-sm text-white" />
                </div>
              </div>

              <div className="flex flex-col text-left">
                <label className="text-[10px] font-bold text-slate-400 mb-1">STAGE / MATCH TITLE</label>
                <input name="matchTitle" placeholder="e.g. GRAND FINAL" className="bg-slate-800 border border-slate-700 p-2 rounded text-sm text-white" />
              </div>

              <div className="flex flex-col text-left">
                <label className="text-[10px] font-bold text-slate-400 mb-1">OVERLAY THEME</label>
                <select name="themeID" className="bg-slate-800 border border-slate-700 p-2 rounded text-sm text-white">
                  <option value="ICC_GLOBAL">ICC T20 Global Apex</option>
                  <option value="SKY_HYPERION">Sky Sports Hyperion Pro</option>
                  <option value="JIO_TITAN">Jio Premier Titan (IPL 4K)</option>
                  <option value="FOX_STRIKE">Fox Cricket BBL Strike</option>
                  <option value="SUPERSPORT_AURA">SuperSport Aura Glass</option>
                  <option value="APEX">Apex</option>
                  <option value="DIAMOND">Diamond</option>
                  <option value="VOLT">Volt</option>
                  <option value="THUNDER">Thunder</option>
                  <option value="BLITZ">Blitz</option>
                  <option value="ELITE">Elite</option>
                  <option value="FRANCHISE">Franchise</option>
                  <option value="SHAKTI">Shakti</option>
                  <option value="NEW_KS_COLOR">Emerald Cricket Pro</option>
                  <option value="NEW_IPL">Tata IPL Modern</option>
                  <option value="IPL_2026">IPL 2026 Stadium Capsule</option>
                  <option value="KS_PREMIUM">KS Premium (Broadcast)</option>
                  <option value="WC2026">T20 World Cup 2026</option>
                  <option value="APOGEE">Apogee Arena Pro</option>
                  <option value="GOLD_CHAMPIONSHIP">Gold Championship</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button type="button" onClick={() => setShowNextMatch(false)} className="bg-slate-800 px-4 py-2 rounded text-sm font-bold">Cancel</button>
                <button type="submit" className="bg-yellow-500 text-black px-4 py-2 rounded text-sm font-bold"><Rocket size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Switch Match</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
