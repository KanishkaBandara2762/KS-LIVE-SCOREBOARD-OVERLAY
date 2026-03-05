import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { ref, onValue } from "firebase/database";
import "./BroadcastTicker.css";

/**
 * BroadcastTicker
 * ─────────────────────────────────────────────────
 * A standalone overlay component that:
 *   - Listens ONLY to Firebase `overlay_ticker` (not live_match)
 *   - Renders an animated scrolling text bar above the scoreboard
 *   - Two modes: "breaking" (red flash) and "banner" (gold/blue gradient)
 *   - Wrapped in React.memo — never re-renders from parent state changes
 */
const BroadcastTicker = React.memo(() => {
    const [ticker, setTicker] = useState(null);

    useEffect(() => {
        const tickerRef = ref(db, "overlay_ticker");
        const unsubscribe = onValue(tickerRef, (snapshot) => {
            setTicker(snapshot.val());
        });
        return () => unsubscribe();
    }, []);

    // Don't render anything if hidden or empty
    if (!ticker || !ticker.visible || !ticker.message) return null;

    const mode = ticker.mode || "banner";  // "breaking" or "banner"
    const preset = ticker.preset || "final"; // "final", "semi", "custom"

    // Determine background class based on mode + preset
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

    return (
        <div className={`broadcast-ticker ${bgClass} ${mode === "breaking" ? "ticker-flash" : ""}`}>
            <div className="ticker-glow-border" />
            <div className="ticker-scroll-track">
                <span className="ticker-scroll-text">
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
