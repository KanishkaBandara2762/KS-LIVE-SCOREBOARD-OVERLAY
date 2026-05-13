import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { ref, onValue, update } from "firebase/database";
import "./BroadcastTicker.css";

/**
 * BroadcastTicker
 * ─────────────────────────────────────────────────
 * Props:
 *   matchId     — if present, reads from matches/{matchId}/overlay_ticker (Firebase legacy)
 *   tickerData  — if present, use this object directly (MongoDB matches via Socket.IO)
 *
 * Two modes:
 *   "breaking"  — red flash banner
 *   "banner"    — gold/blue gradient
 *
 * Wrapped in React.memo — only re-renders when ticker data actually changes.
 */
const BroadcastTicker = React.memo(({ matchId, tickerData }) => {
    const [ticker, setTicker] = useState(tickerData || null);

    // If tickerData prop is provided (MongoDB/Socket.IO mode), use it directly
    useEffect(() => {
        if (tickerData !== undefined) {
            setTicker(tickerData);
            return;
        }

        // Legacy Firebase mode — read from Realtime Database
        const tickerPath = matchId ? `matches/${matchId}/overlay_ticker` : "overlay_ticker";
        const tickerRef = ref(db, tickerPath);
        const unsubscribe = onValue(tickerRef, (snapshot) => {
            setTicker(snapshot.val());
        });
        return () => unsubscribe();
    }, [matchId, tickerData]);

    // Don't render anything if hidden or empty
    if (!ticker || !ticker.visible || !ticker.message) return null;

    const mode = ticker.mode || "banner";
    const preset = ticker.preset || "final";
    const autoRepeat = ticker.autoRepeat === true;

    const bgClass =
        mode === "breaking"
            ? "ticker-breaking"
            : preset === "semi"
                ? "ticker-banner-semi"
                : preset === "final"
                    ? "ticker-banner-final"
                    : "ticker-banner-custom";

    // Triple the text for seamless infinite scroll
    const scrollText = `${ticker.message}     ★     ${ticker.message}     ★     ${ticker.message}     ★     `;

    const animKey = ticker.timestamp || ticker.updatedAt || "ticker-default";

    const handleAnimationEnd = () => {
        if (!autoRepeat) {
            if (tickerData !== undefined) {
                // MongoDB mode: can't write back to Firebase — ticker will hide on next socket update
                // The admin panel will handle hiding via /api/toggle-ticker
                return;
            }
            // Firebase legacy mode: write back to hide ticker
            const tickerPath = matchId ? `matches/${matchId}/overlay_ticker` : "overlay_ticker";
            update(ref(db, tickerPath), { visible: false });
        }
    };

    return (
        <div key={animKey} className={`broadcast-ticker ${bgClass} ${mode === "breaking" ? "ticker-flash" : ""}`}>
            <div className="ticker-glow-border" />
            <div className="ticker-scroll-track">
                <span
                    className="ticker-scroll-text"
                    style={{ animationIterationCount: autoRepeat ? "infinite" : 1, animationFillMode: "forwards" }}
                    onAnimationEnd={handleAnimationEnd}
                >
                    {scrollText}
                </span>
            </div>
            {mode === "breaking" && (
                <div className="ticker-breaking-badge">⚡ BREAKING</div>
            )}
        </div>
    );
});

BroadcastTicker.displayName = "BroadcastTicker";
export default BroadcastTicker;
