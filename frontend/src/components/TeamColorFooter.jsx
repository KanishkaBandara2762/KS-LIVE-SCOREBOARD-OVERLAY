import React from "react";
import "./TeamColorFooter.css";
import { explicitTeamColors } from "../utils/teamColors";

/** Thin team-colour line along the bottom of the scorebar: batting colour on the left, bowling colour on the right. */
export default function TeamColorFooter({ match }) {
  const c = explicitTeamColors(match);
  if (!c) return null;
  return (
    <div className="tcf">
      <i style={{ background: c.batting }} />
      <i style={{ background: c.bowling }} />
    </div>
  );
}
