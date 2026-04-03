import React, { useEffect, useState } from "react";
import ScorecardDisplay from "./ScorecardDisplay";
import { useLanguage } from "../i18n/LanguageContext";
import { db } from "../firebase";
import { ref, onValue } from "firebase/database";

const OverlayPage = () => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const overlayUrl = typeof window !== "undefined" ? `${window.location.origin}/overlay` : "/overlay";

  useEffect(() => {
    const unsubscribe = onValue(ref(db, "live_match"), () => {
      setRefreshTick((tick) => tick + 1);
    });
    return () => unsubscribe();
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error("Overlay URL copy failed", error);
    }
  };

  return (
    <>
      <ScorecardDisplay />
      <div className="fixed top-4 left-4 z-[250] flex flex-col gap-2 pointer-events-auto opacity-0 hover:opacity-100 transition-opacity">
        <div className="rounded-xl border border-white/15 bg-black/70 px-4 py-2 text-[10px] font-black uppercase tracking-wide text-white/80 backdrop-blur-md">
          <div>{t("overlay.copyTitle")}: {overlayUrl}</div>
          <div className="text-cyan-300">{t("overlay.copyInstruction")}</div>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="w-fit rounded-full bg-cyan-600 px-4 py-2 text-[10px] font-black uppercase text-white shadow-lg hover:bg-cyan-700"
        >
          {copied ? t("common.copied") : t("overlay.copyButton")}
        </button>
      </div>
      <div data-obs-refresh={refreshTick} style={{ position: "fixed", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
    </>
  );
};

export default OverlayPage;
