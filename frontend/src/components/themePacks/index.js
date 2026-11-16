/* ================================================================
   Theme packs: per-theme full-screen overlays.

   Each pack maps a screen name to a component. Screens a pack does
   not define fall back to the shared design in ScorecardDisplay.

   Screen names:
     Versus, Toss, Winner, Summary, MatchSituation, NeedRun, Potm,
     Partnership, Squad, PointsTable, Leaders, LastOut, CustomText

   To give a theme its own screens: create themePacks/<theme>.jsx
   exporting a pack object, then register it below by theme ID.
   ================================================================ */
import iplGold from "./iplGold";
import ksPremium from "./ksPremium";
import ipl2026 from "./ipl2026";
import skyPro from "./skyPro";
import lightning from "./lightning";
import iccGlobal from "./iccGlobal";
import proBroadcastScreens from "./proBroadcastScreens";
import { ProVersusScreen, ProSquadScreen, ProPointsScreen, ProLeadersScreen } from "./proBroadcast";

const proBroadcast = {
  Versus: ProVersusScreen,
  Toss: ProVersusScreen,
  Squad: ProSquadScreen,
  PointsTable: ProPointsScreen,
  Leaders: ProLeadersScreen,
  ...proBroadcastScreens,
};

const THEME_PACKS = {
  IPL_GOLD: iplGold,
  KS_PREMIUM: ksPremium,
  IPL_2026: ipl2026,
  SKY_PRO: skyPro,
  ICC_GLOBAL: iccGlobal,
  LIGHTNING_BAR: lightning,
  ABUDHABI_T10: lightning,
  ABU_DHABI_T10: lightning,
  PRO_BROADCAST: proBroadcast,
};

export const getThemePack = (themeID) => THEME_PACKS[themeID] || {};
export { ProBroadcastBar } from "./proBroadcast";
