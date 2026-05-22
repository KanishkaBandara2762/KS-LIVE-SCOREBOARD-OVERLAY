import { useEffect, useRef } from "react";

// Default: 30 minutes of inactivity triggers logout.
// Change TIMEOUT_MS to adjust. For testing, try 30_000 (30 seconds).
const TIMEOUT_MS = 30 * 60 * 1000;

export function useActivityTimeout(onTimeout, enabled = true) {
    const timerRef = useRef(null);

    useEffect(() => {
        if (!enabled) return;

        const reset = () => {
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(onTimeout, TIMEOUT_MS);
        };

        const events = ["mousemove", "mousedown", "keypress", "scroll", "touchstart", "click"];
        events.forEach((e) => window.addEventListener(e, reset));

        // Start the timer immediately
        reset();

        return () => {
            clearTimeout(timerRef.current);
            events.forEach((e) => window.removeEventListener(e, reset));
        };
    }, [onTimeout, enabled]);
}
