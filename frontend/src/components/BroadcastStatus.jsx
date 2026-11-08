import React, { useEffect, useState } from "react";

// A broadcast (OBS) link is open for 24 hours after it is generated.
// Expired or never-generated links are locked. Legacy docs without fields stay open.
export function isBroadcastLocked(doc) {
  if (!doc) return false;
  if (doc.broadcastExpiresAt) return new Date(doc.broadcastExpiresAt).getTime() <= Date.now();
  return Boolean(doc.broadcastLocked);
}

function formatRemaining(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

// Shows the OBS link timer. Calls onExpire once the 24h window ends.
export default function BroadcastStatus({ expiresAt, locked, onExpire, compact = false }) {
  const [now, setNow] = useState(() => Date.now());
  const expiry = expiresAt ? new Date(expiresAt).getTime() : null;

  useEffect(() => {
    if (!expiry) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiry]);

  useEffect(() => {
    if (expiry && expiry <= now && onExpire) onExpire();
  }, [expiry, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = { fontSize: compact ? "0.72rem" : "0.8rem", fontWeight: 700, whiteSpace: "nowrap" };

  if (!expiry) {
    return locked ? (
      <span style={{ ...base, color: "#f59e0b" }}>🔒 1 credit to share</span>
    ) : null;
  }

  const remaining = expiry - now;
  if (remaining <= 0) {
    return <span style={{ ...base, color: "#f59e0b" }}>⏰ OBS link expired · 1 credit to renew</span>;
  }
  return (
    <span style={{ ...base, color: remaining < 60 * 60 * 1000 ? "#f97316" : "#34d399" }}>
      ⏱ OBS link: {formatRemaining(remaining)} left
    </span>
  );
}
