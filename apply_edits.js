const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'MiniAdmin.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replacement 1: Target Bar
content = content.replace(
    '<div className="ma-score-right">\n                    <span className="ma-score-big">{match.score}-{match.wickets}</span>\n                    <span className="ma-score-overs">({overs(match.totalBalls)})</span>\n                </div>\n            </div>',
    `<div className="ma-score-right">\n                    <span className="ma-score-big">{match.score}-{match.wickets}</span>\n                    <span className="ma-score-overs">({overs(match.totalBalls)})</span>\n                </div>\n            </div>\n\n            {/* Target bar — shown only in 2nd innings */}\n            {match.isSecondInnings && match.targetScore > 0 && (\n                <div className="ma-target-bar">\n                    🎯 TARGET: <b>{match.targetScore}</b> &nbsp;|&nbsp;\n                    Need <b>{Math.max(0, match.targetScore - match.score)}</b> runs\n                    {match.firstInningsScore != null && (\n                        <span className="ma-target-1st"> (1st: {match.firstInningsScore}/{match.firstInningsWickets || 0})</span>\n                    )}\n                </div>\n            )}`
);
content = content.replace(
    '<div className="ma-score-right">\r\n                    <span className="ma-score-big">{match.score}-{match.wickets}</span>\r\n                    <span className="ma-score-overs">({overs(match.totalBalls)})</span>\r\n                </div>\r\n            </div>',
    `<div className="ma-score-right">\r\n                    <span className="ma-score-big">{match.score}-{match.wickets}</span>\r\n                    <span className="ma-score-overs">({overs(match.totalBalls)})</span>\r\n                </div>\r\n            </div>\r\n\r\n            {/* Target bar — shown only in 2nd innings */}\r\n            {match.isSecondInnings && match.targetScore > 0 && (\r\n                <div className="ma-target-bar">\r\n                    🎯 TARGET: <b>{match.targetScore}</b> &nbsp;|&nbsp;\r\n                    Need <b>{Math.max(0, match.targetScore - match.score)}</b> runs\r\n                    {match.firstInningsScore != null && (\r\n                        <span className="ma-target-1st"> (1st: {match.firstInningsScore}/{match.firstInningsWickets || 0})</span>\r\n                    )}\r\n                </div>\r\n            )}`
);

// Replacement 2: Match Actions
const msStr = `{/* ── 1.5. INNINGS & SUPER OVER ────────────────────────── */}\n                <Section label="INNINGS & EXTRA" color="amber" icon="🔄" open={!!openSections.innings} onClick={() => toggle("innings")}>`;
const msRep = `{/* ── 1.4. MATCH ACTIONS ──────────────────────────────── */}\n                <Section label="MATCH ACTIONS" color="blue" icon="⚙️" open={!!openSections.matchActions} onClick={() => toggle("matchActions")}>\n                    <div className="ma-btn-row mb-2">\n                        <button\n                            className="ma-btn ma-btn-blue"\n                            onClick={handleNewMatch}\n                            title="Reset score/wickets/balls. Keeps team names."\n                        >🏏 NEW MATCH</button>\n                        <button\n                            className="ma-btn ma-btn-swap"\n                            onClick={handleNewInnings}\n                            title="Start 2nd innings. Auto-sets target = 1st innings score + 1."\n                        >🔄 NEW INNINGS</button>\n                    </div>\n                    <button\n                        className="ma-btn ma-btn-danger w-full"\n                        onClick={handleResetTournament}\n                        title="Full reset — clears teams, match and tournament data."\n                    >🗑 RESET TOURNAMENT</button>\n                    {!match.isSecondInnings && match.score > 0 && (\n                        <div className="ma-target-preview" style={{marginTop: '6px', textAlign: 'center', fontSize: '10px', color: '#60a5fa'}}>\n                            If innings ends now → Target: <b>{match.score + 1}</b>\n                        </div>\n                    )}\n                </Section>\n\n                {/* ── 1.5. INNINGS & SUPER OVER ────────────────────────── */}\n                <Section label="INNINGS & EXTRA" color="amber" icon="🔄" open={!!openSections.innings} onClick={() => toggle("innings")}>`;
content = content.replace(msStr, msRep);
content = content.replace(msStr.replace(/\n/g, '\r\n'), msRep.replace(/\n/g, '\r\n'));

// Replacement 3: No Ball + 6
const nbStr = `{/* No Balls */}\n                    {match.extrasConfig?.nb !== false && (\n                    <>\n                        <div className="ma-label">NO BALL +</div>\n                        <div className="ma-grid ma-grid-5">\n                            {[0, 1, 2, 3, 4].map(r => (`
const nbRep = `{/* No Balls */}\n                    {match.extrasConfig?.nb !== false && (\n                    <>\n                        <div className="ma-label">NO BALL + (ball count NOT incremented)</div>\n                        <div className="ma-grid ma-grid-6">\n                            {[0, 1, 2, 3, 4, 6].map(r => (`
content = content.replace(nbStr, nbRep);
content = content.replace(nbStr.replace(/\n/g, '\r\n'), nbRep.replace(/\n/g, '\r\n'));

// Replacement 4: Recent Balls nb/wd
const rStr = `{/* Recent balls display */}\n                    <div className="ma-recent">\n                        {(match.recentBalls || []).map((b, i) => (\n                            <span key={i} className={\`ma-ball \${b === "W" ? "ma-ball-w" : b === "•" ? "ma-ball-dot" : ""}\`}>{b}</span>\n                        ))}\n                    </div>`;
const rRep = `{/* Recent balls display */}\n                    <div className="ma-recent">\n                        {(match.recentBalls || []).map((b, i) => (\n                            <span key={i} className={\`ma-ball \${\n                                b === "W" ? "ma-ball-w" :\n                                b === "•" ? "ma-ball-dot" :\n                                (b?.startsWith?.("NB") || b === "NB") ? "ma-ball-nb" :\n                                (b?.startsWith?.("WD")) ? "ma-ball-wd" :\n                                ""\n                            }\`}>{b}</span>\n                        ))}\n                    </div>`;
content = content.replace(rStr, rRep);
content = content.replace(rStr.replace(/\n/g, '\r\n'), rRep.replace(/\n/g, '\r\n'));

// Replacement 5: Sticky bar + hints
const sStr = `<button className="ma-sq ma-sq-six" onClick={() => addBoundary(6)}>6</button>\n                <button className="ma-sq ma-sq-wkt" onClick={handleWicket}>W</button>\n                <button className="ma-sq ma-sq-wd" onClick={() => addExtra("WD")}>WD</button>\n                <button className={\`ma-sq \${isOverReady ? 'ma-sq-over-ready' : 'ma-sq-undo'}\`} onClick={isOverReady ? handleOverCompleted : handleUndo}>{isOverReady ? '⚡' : '↶'}</button>\n            </div>\n\n            {/* Keyboard hint */}\n            <div className="ma-hints">Keys: 0-4,6 = Runs · W = Wicket · S = Swap · U = Undo</div>\n        </div>`;
const sRep = `<button className="ma-sq ma-sq-six" onClick={() => addBoundary(6)}>6</button>\n                <button className="ma-sq ma-sq-wkt" onClick={handleWicket}>W</button>\n                <button className="ma-sq ma-sq-wd" onClick={() => addExtra("WD")}>WD</button>\n                <button className="ma-sq ma-sq-nb" onClick={() => addExtra("NB")}>NB</button>\n                <button className={\`ma-sq \${isOverReady ? 'ma-sq-over-ready' : 'ma-sq-undo'}\`} onClick={isOverReady ? handleOverCompleted : handleUndo}>{isOverReady ? '⚡' : '↶'}</button>\n            </div>\n\n            {/* Keyboard hint */}\n            <div className="ma-hints">Keys: 0-4,6 = Runs · W = Wicket · S = Swap · U = Undo · NB = No Ball (no ball count)</div>\n        </div>`;
content = content.replace(sStr, sRep);
content = content.replace(sStr.replace(/\n/g, '\r\n'), sRep.replace(/\n/g, '\r\n'));

fs.writeFileSync(filePath, content, 'utf8');
console.log('Edits applied successfully!');
