import React, { useState, useEffect } from "react";
import "./BroadcastTicker.css";
import { Star, Zap } from "lucide-react";

/**
 * BroadcastTicker
 * ─────────────────────────────────────────────────
 * Props:
 *   matchId     — ID of the match
 *   tickerData  — use this object directly (MongoDB matches via Socket.IO)
 *
 * Two modes:
 *   "breaking"  — red flash banner
 *   "banner"    — gold/blue gradient
 *
 * Wrapped in React.memo — only re-renders when ticker data actually changes.
 */
const BroadcastTicker = React.memo(({ matchId, tickerData }) => {
    const [ticker, setTicker] = useState(tickerData || null);

    useEffect(() => {
        setTicker(tickerData || null);
    }, [tickerData]);

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
    const scrollItems = [0, 1, 2].map((index) => (
        <React.Fragment key={index}>
            {ticker.message}     <Star size="1em" style={{ verticalAlign: '-0.125em' }} fill="currentColor" aria-hidden="true" />
        </React.Fragment>
    ));

    const animKey = ticker.timestamp || ticker.updatedAt || "ticker-default";

    const handleAnimationEnd = () => {
        // Ticker visibility changes are controlled via the Admin Panel REST APIs and Socket.IO
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
                    {scrollItems}
                </span>
            </div>
            {mode === "breaking" && (
                <div className="ticker-breaking-badge"><Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> BREAKING</div>
            )}
        </div>
    );
});

BroadcastTicker.displayName = "BroadcastTicker";
export default BroadcastTicker;
