const fs = require('fs');

const path = 'frontend/src/components/ScorecardDisplay.jsx';
let code = fs.readFileSync(path, 'utf8');

const startTag = 'active.isIpl2026 ? (() => {';
const endTag = '})() : active.isApogee ? (() => {';

const startIndex = code.indexOf(startTag);
const endIndex = code.indexOf(endTag, startIndex);

if (startIndex === -1 || endIndex === -1) {
    console.log("Could not find blocks to replace.");
    process.exit(1);
}

const newBlock = "active.isIpl2026 ? (() => {\n" +
"            const bpo = match.ballsPerOver || 6;\n" +
"            const balls = match.recentBalls || [];\n" +
"            const legalDeliveries = match.legalBallCount ?? match.totalBalls ?? 0;\n" +
"            const totalMatchBallsKSP = (match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * (match.ballsPerOver || 6));\n" +
"            const remainIPL = match.manualBallsOverride ? (match.manualBallsValue || 0) : Math.max(0, totalMatchBallsKSP - legalDeliveries);\n" +
"            const runsNeeded = match.isSecondInnings ? Math.max(0, match.targetScore - match.score) : 0;\n" +
"            \n" +
"            const striker = match.player1?.onStrike ? match.player1 : match.player2;\n" +
"            const nonStriker = match.player1?.onStrike ? match.player2 : match.player1;\n" +
"\n" +
"            return (\n" +
"              <div className=\"scoreboard anim-ipl2026-entrance\">\n" +
"                \n" +
"                {/* LEFT TEAM */}\n" +
"                <div className=\"team team-left\">\n" +
"                    {match.battingTeam ? match.battingTeam.substring(0, 3).toUpperCase() : 'BAT'}\n" +
"                </div>\n" +
"\n" +
"                {/* BATSMAN PANEL */}\n" +
"                <div className=\"player-panel anim-ipl2026-panel-left\">\n" +
"\n" +
"                    <div className=\"striker-indicator\"></div>\n" +
"\n" +
"                    <div className=\"player-row\">\n" +
"                        <div className=\"player-name\">\n" +
"                            {striker?.name || 'STRIKER'}\n" +
"                        </div>\n" +
"                        <div className=\"player-score\">\n" +
"                            {striker?.runs || 0} <span className=\"balls\">({striker?.balls || 0})</span>\n" +
"                        </div>\n" +
"                    </div>\n" +
"\n" +
"                    <div className=\"player-row\">\n" +
"                        <div className=\"player-name\">\n" +
"                            {nonStriker?.name || 'NON-STRIKER'}\n" +
"                        </div>\n" +
"                        <div className=\"player-score\">\n" +
"                            {nonStriker?.runs || 0} <span className=\"balls\">({nonStriker?.balls || 0})</span>\n" +
"                        </div>\n" +
"                    </div>\n" +
"\n" +
"                </div>\n" +
"\n" +
"                {/* CENTER PANEL */}\n" +
"                <div className=\"center-section anim-ipl2026-center\">\n" +
"\n" +
"                    <div className=\"score-capsule anim-ipl2026-pop\">\n" +
"                        <span className=\"score-team\">{match.battingTeam ? match.battingTeam.substring(0, 3).toUpperCase() : 'BAT'}</span>\n" +
"                        <span className=\"score-main\">\n" +
"                            {match.score}-{match.wickets}\n" +
"                        </span>\n" +
"                        <span className=\"score-overs\">\n" +
"                            {getOvers(legalDeliveries)} / {match.maxOvers || 5}\n" +
"                        </span>\n" +
"                    </div>\n" +
"\n" +
"                    <div className=\"projected-score\">\n" +
"                        {match.isSecondInnings && remainIPL > 0\n" +
"                            ? `NEED ${runsNeeded} RUNS IN ${remainIPL} BALLS`\n" +
"                            : `EXTRAS: ${match.extras?.total || 0} | PROJ: ${Math.floor((match.score / Math.max(1, (legalDeliveries / 6))) * (match.maxOvers || 20))}`}\n" +
"                    </div>\n" +
"\n" +
"                </div>\n" +
"\n" +
"                {/* BOWLER PANEL */}\n" +
"                <div className=\"bowler-panel anim-ipl2026-panel-right\">\n" +
"\n" +
"                    <div className=\"branding anim-ipl2026-drop\">\n" +
"                        cricscoreboard.site\n" +
"                    </div>\n" +
"\n" +
"                    <div className=\"bowler-header\">\n" +
"                        <div className=\"bowler-name\">\n" +
"                            {match.bowler?.name || 'BOWLER'}\n" +
"                        </div>\n" +
"                        <div className=\"bowler-figures\">\n" +
"                            {match.bowler?.wickets || 0}-{match.bowler?.runs || 0} ({getOvers(Math.round((match.bowler?.overs||0)*(match.ballsPerOver||6)))})\n" +
"                        </div>\n" +
"                    </div>\n" +
"\n" +
"                    <div className=\"last-balls\">\n" +
"                        {Array.from({ length: Math.min(6, Math.max(bpo, balls.length)) }).map((_, i) => {\n" +
"                            const b = balls[balls.length - 1 - i] || '';\n" +
"                            if (!b) return null;\n" +
"                            let bClass = \"ball\";\n" +
"                            if (b === '4') bClass += \" four\";\n" +
"                            else if (b === '6') bClass += \" six\";\n" +
"                            else if (b.includes('W')) bClass += \" wicket\";\n" +
"                            return (\n" +
"                                <div key={i} className={bClass}>\n" +
"                                    {b === '•' ? '0' : b}\n" +
"                                </div>\n" +
"                            );\n" +
"                        }).reverse()}\n" +
"                    </div>\n" +
"\n" +
"                </div>\n" +
"\n" +
"                {/* RIGHT TEAM */}\n" +
"                <div className=\"team team-right\">\n" +
"                    {match.bowlingTeam ? match.bowlingTeam.substring(0, 3).toUpperCase() : 'BOWL'}\n" +
"                </div>\n" +
"\n" +
"              </div>\n" +
"            );\n" +
"          })() : active.isApogee ? (() => {";

code = code.substring(0, startIndex) + newBlock + code.substring(endIndex + endTag.length);

fs.writeFileSync(path, code);
console.log('Successfully updated ScorecardDisplay.jsx for new IPL 2026 structure.');
