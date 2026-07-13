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
"              <div className=\"ipl26-wrapper anim-ipl2026\">\n" +
"                \n" +
"                {/* Floating Watermark */}\n" +
"                <div className=\"ipl26-watermark\">cricscoreboard.site</div>\n" +
"                \n" +
"                {/* Main Bar Container */}\n" +
"                <div className=\"ipl26-main-bar\">\n" +
"                  \n" +
"                  {/* Left Team block */}\n" +
"                  <div className=\"ipl26-side-block left\">{match.battingTeam ? match.battingTeam.substring(0, 3).toUpperCase() : 'BAT'}</div>\n" +
"                  \n" +
"                  {/* Batsmen block (Red Panel) */}\n" +
"                  <div className=\"ipl26-red-panel left-panel\">\n" +
"                    <div className=\"ipl26-batter\">\n" +
"                      <div className=\"ipl26-batter-info\">\n" +
"                        <span className=\"ipl26-striker-icon\">▶</span>\n" +
"                        <span>{striker?.name || 'STRIKER'}</span>\n" +
"                      </div>\n" +
"                      <div className=\"ipl26-batter-stats\">\n" +
"                        {striker?.runs || 0} <span className=\"ipl26-batter-balls\">({striker?.balls || 0})</span>\n" +
"                      </div>\n" +
"                    </div>\n" +
"                    <div className=\"ipl26-batter\" style={{ marginTop: '4px' }}>\n" +
"                      <div className=\"ipl26-batter-info\">\n" +
"                        <span className=\"ipl26-striker-icon\" style={{ visibility: 'hidden' }}>▶</span>\n" +
"                        <span>{nonStriker?.name || 'NON-STRIKER'}</span>\n" +
"                      </div>\n" +
"                      <div className=\"ipl26-batter-stats\">\n" +
"                        {nonStriker?.runs || 0} <span className=\"ipl26-batter-balls\">({nonStriker?.balls || 0})</span>\n" +
"                      </div>\n" +
"                    </div>\n" +
"                  </div>\n" +
"                  \n" +
"                  {/* Center Score Pill */}\n" +
"                  <div className=\"ipl26-center-block\">\n" +
"                    <div className=\"ipl26-center-pill\">\n" +
"                      <span>{match.battingTeam ? match.battingTeam.substring(0, 3).toUpperCase() : 'BAT'}</span>\n" +
"                      <span className=\"ipl26-center-score\">{match.score}-{match.wickets}</span>\n" +
"                      <span className=\"ipl26-center-overs\">{getOvers(legalDeliveries)} / {match.maxOvers || 5}</span>\n" +
"                    </div>\n" +
"                    <div className=\"ipl26-extras\">\n" +
"                      {match.isSecondInnings && remainIPL > 0 \n" +
"                          ? `NEED ${runsNeeded} RUNS IN ${remainIPL} BALLS` \n" +
"                          : `EXTRAS: ${match.extras?.total || 0}`}\n" +
"                    </div>\n" +
"                  </div>\n" +
"                  \n" +
"                  {/* Bowler block (Red Panel) */}\n" +
"                  <div className=\"ipl26-red-panel right-panel\">\n" +
"                    <div className=\"ipl26-bowler-top\">\n" +
"                      <span>{match.bowler?.name || 'BOWLER'}</span>\n" +
"                      <span>\n" +
"                        {match.bowler?.wickets || 0}-{match.bowler?.runs || 0} <span className=\"ipl26-batter-balls\">({getOvers(Math.round((match.bowler?.overs||0)*(match.ballsPerOver||6)))})</span>\n" +
"                      </span>\n" +
"                    </div>\n" +
"                    <div className=\"ipl26-recent-balls\">\n" +
"                      {Array.from({ length: Math.min(6, Math.max(bpo, balls.length)) }).map((_, i) => {\n" +
"                        const b = balls[balls.length - 1 - i] || ''; // Show most recent balls\n" +
"                        if (!b) return null;\n" +
"                        return <div key={i} className=\"ipl26-ball\">{b === '•' ? '0' : b}</div>;\n" +
"                      }).reverse()}\n" +
"                    </div>\n" +
"                  </div>\n" +
"                  \n" +
"                  {/* Right Team block */}\n" +
"                  <div className=\"ipl26-side-block right\">{match.bowlingTeam ? match.bowlingTeam.substring(0, 3).toUpperCase() : 'BOWL'}</div>\n" +
"\n" +
"                </div>\n" +
"              </div>\n" +
"            );\n" +
"          })() : active.isApogee ? (() => {";

code = code.substring(0, startIndex) + newBlock + code.substring(endIndex + endTag.length);

fs.writeFileSync(path, code);
console.log('Successfully patched ScorecardDisplay.jsx for IPL 2026');
