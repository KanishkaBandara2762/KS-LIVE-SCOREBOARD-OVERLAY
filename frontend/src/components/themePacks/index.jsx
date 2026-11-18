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
import React from "react";
import { PanelContext } from "./common";
import iplGold from "./iplGold";
import ksPremium from "./ksPremium";
import ipl2026 from "./ipl2026";
import skyPro from "./skyPro";
import lightning from "./lightning";
import iccGlobal from "./iccGlobal";
import skyHyperion from "./skyHyperion";
import jioTitan from "./jioTitan";
import foxStrike from "./foxStrike";
import supersportAura from "./supersportAura";
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
  SKY_HYPERION: skyHyperion,
  JIO_TITAN: jioTitan,
  FOX_STRIKE: foxStrike,
  SUPERSPORT_AURA: supersportAura,
  LIGHTNING_BAR: lightning,
  ABUDHABI_T10: lightning,
  ABU_DHABI_T10: lightning,
  PRO_BROADCAST: proBroadcast,
};

// Versus, Toss and Summary stay full screen. Every other screen is a smaller centred panel.
const PANEL_SIZE = {
  Winner: 0.6, MatchSituation: 0.58, NeedRun: 0.58, Potm: 0.65, Partnership: 0.58,
  Squad: 0.75, PointsTable: 0.75, Leaders: 0.75,
};
const cache = {};
const withPanels = (pack) => {
  const out = { ...pack };
  for (const [name, size] of Object.entries(PANEL_SIZE)) {
    const Screen = pack[name];
    if (!Screen) continue;
    out[name] = (props) => <PanelContext.Provider value={size}><Screen {...props} /></PanelContext.Provider>;
  }
  return out;
};
export const getThemePack = (themeID) => {
  if (!THEME_PACKS[themeID]) return {};
  return (cache[themeID] ||= withPanels(THEME_PACKS[themeID]));
};
export { ProBroadcastBar } from "./proBroadcast";
