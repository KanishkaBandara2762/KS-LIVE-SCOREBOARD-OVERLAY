import "./BroadcastScreens.css";

/* ================================================================
   LightningBar — the two-logo lightning scoreboard bar (ABUDHABI_T10
   and LIGHTNING_BAR themes). Pure view: give it the match and helpers.
   ================================================================ */
export default function LightningBar({ match, getOvers, getAbsoluteUrl, TeamLogo }) {
  const bpo = match.ballsPerOver || 6;
  const legalDeliveries = match.legalBallCount ?? match.totalBalls ?? 0;
  const maxOvers = match.maxOvers || 10;
  const oversStr = getOvers(legalDeliveries);
  const totalMatchBalls = match.targetBalls > 0 ? match.targetBalls : maxOvers * bpo;
  const remainBalls = match.manualBallsOverride
    ? (match.manualBallsValue || 0)
    : Math.max(0, totalMatchBalls - legalDeliveries);
  const runsNeeded = match.isSecondInnings ? Math.max(0, (match.targetScore || 0) - match.score) : 0;
  const crr = legalDeliveries > 0 ? (match.score / (legalDeliveries / bpo)).toFixed(2) : "0.00";

  const striker = match.player1?.onStrike ? match.player1 : match.player2;
  const nonStriker = match.player1?.onStrike ? match.player2 : match.player1;
  const bowler = match.bowler;
  const bowlerOversStr = bowler?.figures && bowler.figures !== '0-0 (0.0)'
    ? bowler.figures.split(' ')[1]?.replace(/[()]/g, '') || getOvers(Math.round((bowler?.overs || 0) * (match.ballsPerOver || 6)))
    : getOvers(Math.round((bowler?.overs || 0) * (match.ballsPerOver || 6)));

  const teamShort = match.battingTeam ? (match.battingTeam.length <= 4 ? match.battingTeam.toUpperCase() : match.battingTeam.substring(0, 3).toUpperCase()) : 'BAT';

  return (
    <div className="t10-outer-scaler">
      <div className="relative w-[1920px] h-[135px] overflow-hidden rounded-[12px] bg-transparent text-white font-['Barlow'] select-none t10-figma-bar">
        {/* Background Navy */}
        <div className="absolute inset-y-0 left-[150px] w-[1620px]" style={{ background: '#05091D' }} />

        {/* Left Team Logo (Batting Team) */}
        <div className="absolute left-0 top-0 h-[135px] w-[150px] bg-[#2f5be0] flex items-center justify-center p-2">
          <TeamLogo src={getAbsoluteUrl(match.battingLogo)} teamName={match.battingTeam} size={120} style={{ maxHeight: '125px', maxWidth: '140px', objectFit: 'contain' }} />
        </div>

        {/* Left Player Information */}
        <div className="absolute left-[150px] top-0 h-[135px] w-[550px]">
          {/* Striker Row */}
          <div className="absolute left-0 w-full h-[44px] flex items-center top-[20px]">
            <span className="w-[330px] pl-[70px] text-[34px] font-bold tracking-wide leading-none flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
              {striker?.name || 'KANISHKA'}
              {striker?.onStrike && <span className="text-[#C6A12B] text-[24px]">★</span>}
            </span>
            <span className="w-[90px] text-[40px] font-bold leading-none tabular-nums text-right pr-4">
              {striker?.runs ?? 0}
            </span>
            <span className="text-[19px] font-semibold leading-none tabular-nums opacity-90 text-slate-300">
              {striker?.balls ?? 0}
            </span>
          </div>

          {/* Non-Striker Row */}
          <div className="absolute left-0 w-full h-[44px] flex items-center top-[72px]">
            <span className="w-[330px] pl-[70px] text-[34px] font-bold tracking-wide leading-none overflow-hidden text-ellipsis whitespace-nowrap">
              {nonStriker?.name || 'SANJU'}
            </span>
            <span className="w-[90px] text-[40px] font-bold leading-none tabular-nums text-right pr-4">
              {nonStriker?.runs ?? 0}
            </span>
            <span className="text-[19px] font-semibold leading-none tabular-nums opacity-90 text-slate-300">
              {nonStriker?.balls ?? 0}
            </span>
          </div>
        </div>

        {/* Center White Lightning SVG */}
        <svg className="absolute left-[700px] top-0" width="520" height="135" viewBox="0 0 520 135">
          <polygon points="50,3 470,3 440,50 510,40 446,92 470,132 50,132 74,92 10,40 80,50" fill="#fff" />
          <polyline points="50,132 74,92 10,40 80,50 50,3" fill="none" stroke="#C6A12B" strokeWidth="5" strokeLinejoin="miter" />
          <polyline points="470,3 440,50 510,40 446,92 470,132" fill="none" stroke="#C6A12B" strokeWidth="5" strokeLinejoin="miter" />
          <line x1="50" y1="3" x2="470" y2="3" stroke="#C6A12B" strokeWidth="5" />
          <line x1="50" y1="132" x2="470" y2="132" stroke="#C6A12B" strokeWidth="5" />
        </svg>

        {/* Current Score */}
        <div className="absolute left-[780px] top-[14px] w-[360px] h-[64px] flex items-center justify-center gap-[40px] text-[#05091D] leading-none">
          <span className="font-['Roboto_Slab'] font-black text-[60px]">{teamShort}</span>
          <span className="font-['Roboto_Slab'] font-black text-[74px] tabular-nums">{match.score}-{match.wickets}</span>
        </div>

        {/* Target and Overs */}
        <div className="absolute left-[780px] top-[90px] w-[360px] flex justify-center gap-[30px] text-[#05091D] text-[25px] font-bold leading-none">
          <span>{match.isSecondInnings && match.targetScore > 0 ? `TARGET ${match.targetScore}` : `1ST INNINGS`}</span>
          <span>{oversStr} OVERS</span>
        </div>

        {/* Right Bowler Information */}
        <div className="absolute left-[1220px] top-[20px] w-[550px] h-[44px] flex items-center">
          <span className="w-[300px] text-center text-[34px] font-bold tracking-wide leading-none overflow-hidden text-ellipsis whitespace-nowrap">
            {bowler?.name || 'BOULT'}
          </span>
          <span className="w-[150px] text-[40px] font-bold leading-none tabular-nums text-right pr-4">
            {bowler?.wickets ?? 0}-{bowler?.runs ?? 0}
          </span>
          <span className="text-[19px] font-semibold leading-none tabular-nums opacity-90 text-slate-300">
            {bowlerOversStr}
          </span>
        </div>

        {/* Match Situation */}
        <div className="absolute left-[1230px] top-[72px] w-[530px] h-[44px] flex items-center justify-center whitespace-nowrap text-[30px] font-medium leading-none">
          {match.isSecondInnings ? (
            runsNeeded <= 0 ? (
              <span className="text-[#C6A12B] font-bold">{match.battingTeam ? match.battingTeam.toUpperCase() : 'BATTING TEAM'} WON</span>
            ) : (
              <span>To WIN <b className="font-bold text-white">{runsNeeded}</b> RUNS FROM <b className="font-bold text-white">{remainBalls}</b> BALLS</span>
            )
          ) : (
            <span>{match.tournamentName ? match.tournamentName.toUpperCase() : 'ABU DHABI T10'} • CRR <b className="font-bold text-white">{crr}</b></span>
          )}
        </div>

        {/* Right Team Logo (Bowling Team) */}
        <div className="absolute right-0 top-0 h-[135px] w-[150px] bg-[#cdb21f] flex items-center justify-center p-2">
          <TeamLogo src={getAbsoluteUrl(match.leagueLogo)} teamName={match.bowlingTeam} size={120} style={{ maxHeight: '125px', maxWidth: '140px', objectFit: 'contain' }} />
        </div>
      </div>
    </div>
  );
}
