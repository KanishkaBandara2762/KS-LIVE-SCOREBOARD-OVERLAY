import React from "react";
import "./TournamentBoundaries.css";

/**
 * Small boundary-count card shown on the right, just above the scorebar.
 * Counts every 4 and 6 in the tournament (including boundaries from byes,
 * leg-byes and wides), plus this match's own totals. Same card in every theme.
 */
export default function TournamentBoundaries({ boundaries, tournamentName }) {
  const t = boundaries?.tournament;
  const m = boundaries?.thisMatch;
  return (
    <div className="tb-card">
      <div className="tb-head">
        <span>BOUNDARIES</span>
        {tournamentName && <em>{String(tournamentName).toUpperCase()}</em>}
      </div>
      {!t ? (
        <div className="tb-wait">Loading…</div>
      ) : (
        <>
          <div className="tb-row tb-main">
            <div><b>{t.fours}</b><span>FOURS</span></div>
            <div><b>{t.sixes}</b><span>SIXES</span></div>
            <div className="tb-total"><b>{t.total}</b><span>TOTAL</span></div>
          </div>
          <div className="tb-row tb-match">
            <span>THIS MATCH</span>
            <b>{m?.fours ?? 0}×4</b>
            <b>{m?.sixes ?? 0}×6</b>
          </div>
        </>
      )}
    </div>
  );
}
