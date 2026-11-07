import React, { useState } from "react";
import "./TournamentObsGuide.css";

// Shown right after a tournament is created. Gives the static overlay URL and OBS steps.
export default function TournamentObsGuide({ tournament, onClose }) {
  const [copied, setCopied] = useState(false);
  const id = tournament?.id || tournament?._id;
  const url = `${window.location.origin}/overlay/tournament/${id}`;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; the URL is still shown */
    }
  };

  return (
    <div className="obs-guide-overlay" onClick={onClose}>
      <div className="obs-guide-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="obs-guide-head">
          <span className="obs-guide-badge">✅ Tournament created</span>
          <h2>{tournament?.name || "Your tournament"} is ready</h2>
          <p>Add this link to OBS once. The scoreboard follows each new match automatically.</p>
        </div>

        <div className="obs-guide-url">
          <span className="obs-guide-url-label">Static Overlay OBS URL</span>
          <div className="obs-guide-url-row">
            <code>{url}</code>
            <button type="button" className="obs-guide-copy" onClick={copyUrl}>
              {copied ? "✓ Copied" : "📋 Copy"}
            </button>
          </div>
        </div>

        <div className="obs-guide-section">
          <h3>📡 OBS Browser Source Setup</h3>
          <ol className="obs-guide-steps">
            <li><span>1</span> In OBS: <strong>Sources → + → Browser Source</strong></li>
            <li><span>2</span> Paste your tournament's <strong>Static Overlay OBS URL</strong> (above)</li>
            <li><span>3</span> Set Width: <strong>1920</strong>, Height: <strong>1080</strong></li>
            <li><span>4</span> ✅ <strong>Shutdown source when not visible</strong> — <strong>OFF</strong></li>
            <li><span>5</span> When you move to a "Next Match", the scoreboard updates in real time without reloading.</li>
          </ol>
        </div>

        <div className="obs-guide-foot">
          <span>This tournament used 1 credit (1 Event).</span>
          <button type="button" className="obs-guide-done" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
