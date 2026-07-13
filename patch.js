const fs = require('fs');

const path = 'frontend/src/components/MiniAdmin.jsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add import
if (!code.includes("import { NextMatchModal } from './Dashboard';")) {
    code = code.replace(
        "import NewBatterModal from './NewBatterModal';",
        "import NewBatterModal from './NewBatterModal';\nimport { NextMatchModal } from './Dashboard';"
    );
}

// 2. Fix socket score:update
const oldSocketHandler = "socket.on('score:update', (data) => setMatch(prev => prev ? { ...prev, ...data } : data));";
const newSocketHandler = `socket.on('score:update', (data) => setMatch(prev => {
                    const merged = prev ? { ...prev, ...data } : data;
                    if (data.overlaySettings) {
                        if (data.overlaySettings.battingLogo) merged.battingLogo = data.overlaySettings.battingLogo;
                        if (data.overlaySettings.leagueLogo) merged.leagueLogo = data.overlaySettings.leagueLogo;
                        if (data.overlaySettings.themeID) merged.themeID = data.overlaySettings.themeID;
                    }
                    return merged;
                }));`;
code = code.replace(oldSocketHandler, newSocketHandler);

// 3. Fix batting logo
const oldBattingLogo1 = `{match.overlaySettings?.battingLogo && (
                                        <img src={getAbsoluteUrl(match.overlaySettings.battingLogo)}`;
const newBattingLogo1 = `{(match.battingLogo || match.overlaySettings?.battingLogo) && (
                                        <img src={getAbsoluteUrl(match.battingLogo || match.overlaySettings?.battingLogo)}`;
code = code.replace(oldBattingLogo1, newBattingLogo1);

const oldBattingUpload = `currentUrl={match.overlaySettings?.battingLogo}
                                        isMongoDB={isMongoDB(matchId)}
                                        onUploaded={(url) => push({ overlaySettings: { ...match.overlaySettings, battingLogo: url } })}`;
const newBattingUpload = `currentUrl={match.battingLogo || match.overlaySettings?.battingLogo}
                                        isMongoDB={isMongoDB(matchId)}
                                        onUploaded={(url) => push({ battingLogo: url })}`;
code = code.replace(oldBattingUpload, newBattingUpload);

// 4. Fix bowling logo
const oldBowlingLogo1 = `{match.overlaySettings?.leagueLogo && (
                                        <img src={getAbsoluteUrl(match.overlaySettings.leagueLogo)}`;
const newBowlingLogo1 = `{(match.leagueLogo || match.overlaySettings?.leagueLogo) && (
                                        <img src={getAbsoluteUrl(match.leagueLogo || match.overlaySettings?.leagueLogo)}`;
code = code.replace(oldBowlingLogo1, newBowlingLogo1);

const oldBowlingUpload = `currentUrl={match.overlaySettings?.leagueLogo}
                                        isMongoDB={isMongoDB(matchId)}
                                        onUploaded={(url) => push({ overlaySettings: { ...match.overlaySettings, leagueLogo: url } })}`;
const newBowlingUpload = `currentUrl={match.leagueLogo || match.overlaySettings?.leagueLogo}
                                        isMongoDB={isMongoDB(matchId)}
                                        onUploaded={(url) => push({ leagueLogo: url })}`;
code = code.replace(oldBowlingUpload, newBowlingUpload);

// 5. Replace Next Match Modal
const modalStart = '{showNextMatch && (';
const modalEndMarker = ')}';
const startIdx = code.indexOf(modalStart, code.indexOf('DEPLOY NEXT MATCH MODAL'));
if (startIdx !== -1) {
    // Find the matching closing brace for this block
    let endIdx = startIdx;
    let braceCount = 0;
    let started = false;
    for (let i = startIdx; i < code.length; i++) {
        if (code[i] === '{') {
            braceCount++;
            started = true;
        } else if (code[i] === '}') {
            braceCount--;
        }
        if (started && braceCount === 0) {
            endIdx = i + 1;
            break;
        }
    }
    
    // Check for trailing `)`
    if (code[endIdx] === ')') {
        endIdx++;
    }

    const newModal = `{showNextMatch && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <NextMatchModal
                        tournament={{ 
                            id: typeof match.tournamentId === 'object' ? (match.tournamentId?.id || match.tournamentId?._id) : match.tournamentId,
                            name: match.tournamentName || "Next Match" 
                        }}
                        onClose={(newMatchId) => {
                            setShowNextMatch(false);
                            if (newMatchId && typeof newMatchId === 'string') {
                                window.location.href = \`/mini-admin/\${newMatchId}\`;
                            }
                        }}
                        onSubmit={async (tId, data) => {
                            return await tournamentsApi.nextMatch(tId, data);
                        }}
                    />
                </div>
            )}`;
    
    code = code.substring(0, startIdx) + newModal + code.substring(endIdx);
}

fs.writeFileSync(path, code);
console.log('Successfully patched MiniAdmin.jsx');
