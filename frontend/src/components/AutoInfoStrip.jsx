import React, { useEffect, useRef, useState } from "react";
import "./AutoInfoStrip.css";

/**
 * AutoInfoStrip — the TV-style "info flash" that pops up above the scorebar
 * on its own: once a minute and at the end of every over. It cycles through
 * the chase target line (second innings), run rates and the partnership.
 * One card for every theme; hidden while a full-screen graphic is showing.
 */
const SLIDE_MS = 5500;
const EVERY_MS = 60000;
const FIRST_MS = 20000;
const up = (s) => String(s || "").toUpperCase();

export default function AutoInfoStrip({ match, getOvers, suppressed }) {
  const [slide, setSlide] = useState(-1);
  const timers = useRef([]);
  const slidesRef = useRef([]);

  const bpo = match.ballsPerOver || 6;
  const legal = match.legalBallCount ?? match.totalBalls ?? 0;
  const maxOvers = match.maxOvers || 20;
  const totalBalls = match.targetBalls > 0 ? match.targetBalls : maxOvers * bpo;
  const ballsLeft = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, totalBalls - legal);
  const chasing = !!match.isSecondInnings && match.targetScore > 0;
  const runsNeeded = chasing ? Math.max(0, match.targetScore - match.score) : 0;
  const crr = legal > 0 ? match.score / (legal / bpo) : 0;
  const rrr = chasing && ballsLeft > 0 ? runsNeeded / (ballsLeft / bpo) : 0;
  const projected = Math.round(crr * maxOvers);
  const p = match.partnership || {};
  const bats = [match.player1, match.player2].filter((x) => x?.name);

  const slides = [];
  if (chasing && runsNeeded > 0) slides.push({ key: "need", tag: "TARGET " + match.targetScore });
  if (legal > 0) slides.push({ key: "rates", tag: "RUN RATE" });
  if ((p.runs ?? 0) > 0 || (p.balls ?? 0) > 0) slides.push({ key: "pship", tag: "PARTNERSHIP" });
  slidesRef.current = slides;

  const run = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const n = slidesRef.current.length;
    if (!n) return;
    setSlide(0);
    for (let i = 1; i < n; i++) timers.current.push(setTimeout(() => setSlide(i), i * SLIDE_MS));
    timers.current.push(setTimeout(() => setSlide(-1), n * SLIDE_MS));
  };

  // Once a minute (the first one shortly after the overlay opens)
  useEffect(() => {
    const first = setTimeout(run, FIRST_MS);
    const every = setInterval(run, EVERY_MS);
    return () => { clearTimeout(first); clearInterval(every); timers.current.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // End of every over
  const prevLegal = useRef(legal);
  useEffect(() => {
    if (legal > prevLegal.current && legal % bpo === 0 && legal > 0) run();
    prevLegal.current = legal;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legal]);

  const cur = slides[slide];
  if (suppressed || !cur) return null;

  return (
    <div className="ai-card" key={cur.key}>
      <div className="ai-tag">{cur.tag}</div>
      <div className="ai-body">
        {cur.key === "need" && (
          <div className="ai-need">
            <span>{up(match.battingTeam)} NEED</span>
            <b>{runsNeeded}</b><span>RUNS FROM</span><b>{ballsLeft}</b><span>BALLS</span>
          </div>
        )}
        {cur.key === "rates" && (
          <div className="ai-rates">
            <div><span>CURRENT RR</span><b>{crr.toFixed(2)}</b></div>
            {chasing
              ? <div className="is-hot"><span>REQUIRED RR</span><b>{rrr.toFixed(2)}</b></div>
              : <div className="is-hot"><span>PROJECTED</span><b>{projected}</b></div>}
          </div>
        )}
        {cur.key === "pship" && (
          <div className="ai-pship">
            <div className="ai-pship-total"><b>{p.runs ?? 0}</b><span>({p.balls ?? 0})</span></div>
            <div className="ai-pship-bats">
              {bats.map((b, i) => (
                <div key={i}><span>{up(b.name)}</span><b>{b.runs ?? 0}</b><em>({b.balls ?? 0})</em></div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="ai-bar"><i key={cur.key} style={{ animationDuration: `${SLIDE_MS}ms` }} /></div>
    </div>
  );
}
