import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { ChevronDown } from 'lucide-react';

const ComboboxPlayerInput = ({ value, onChange, options = [], placeholder, className = "", squadOnly = false }) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || "");
  const [customPlayers, setCustomPlayers] = useState([]);
  const [dbPlayers, setDbPlayers] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [saveStatus, setSaveStatus] = useState("");
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  useEffect(() => {
    // FIX (Fix 3 & 4): When squadOnly=true, skip localStorage caches entirely.
    // This ensures the current match's squad players are shown exclusively,
    // without names leaking in from previous matches or tournaments.
    if (squadOnly) return;
    const loadCustom = () => {
      try {
        const stored = JSON.parse(localStorage.getItem('ks_custom_players') || "[]");
        setCustomPlayers(Array.isArray(stored) ? stored : []);
      } catch (error) {
        setCustomPlayers([]);
      }
    };

    loadCustom();
    window.addEventListener('storage', loadCustom);
    window.addEventListener('ks_players_updated', loadCustom);

    return () => {
      window.removeEventListener('storage', loadCustom);
      window.removeEventListener('ks_players_updated', loadCustom);
    };
  }, [squadOnly]);

  useEffect(() => {
    if (squadOnly) return; // FIX: skip db players when squadOnly
    const loadDbPlayers = () => {
      try {
        const stored = JSON.parse(localStorage.getItem("player_database") || "[]");
        const next = Array.isArray(stored) ? stored.map((player) => player.name).filter(Boolean) : [];
        setDbPlayers(next);
      } catch {
        setDbPlayers([]);
      }
    };
    loadDbPlayers();
    window.addEventListener('ks_players_updated', loadDbPlayers);
    return () => window.removeEventListener('ks_players_updated', loadDbPlayers);
  }, [squadOnly]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        // Bug 2 fix: just close dropdown on outside click; don't auto-commit
        // (avoids stale-closure issue where handleCommit could add an already-existing
        //  player to customPlayers because allOptions was captured in an old closure)
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allOptions = Array.from(
    new Set([
      ...options.map((option) => option?.name).filter(Boolean),
      ...dbPlayers,
      ...customPlayers,
    ])
  );

  const normalizedInput = inputValue.trim().toUpperCase();
  const filteredOptions = allOptions.filter((option) => option.toLowerCase().includes(inputValue.toLowerCase()));
  const canSavePlayer = normalizedInput && !allOptions.some((option) => option.toUpperCase() === normalizedInput);

  const persistCustomPlayer = (name) => {
    const updated = Array.from(new Set([...customPlayers, name]));
    localStorage.setItem('ks_custom_players', JSON.stringify(updated));
    setCustomPlayers(updated);
    window.dispatchEvent(new Event('ks_players_updated'));
  };

  const handleInputChange = (event) => {
    setInputValue(event.target.value);
    setSaveStatus("");
    setIsOpen(true);
    setActiveIndex(-1);
  };

  const handleCommit = (finalValue) => {
    const trimmed = finalValue.trim();
    if (trimmed) {
      if (!allOptions.find((option) => option.toUpperCase() === trimmed.toUpperCase())) {
        persistCustomPlayer(trimmed);
      }
      onChange({ target: { value: trimmed } });
      setInputValue(trimmed);
    } else {
      onChange({ target: { value: "" } });
      setInputValue("");
    }
    setIsOpen(false);
  };

  const handleSelect = (option) => {
    setInputValue(option);
    handleCommit(option);
  };

  const savePlayerToDatabase = async () => {
    if (!canSavePlayer) {
      setSaveStatus(normalizedInput ? t("common.playerExists") : "");
      return;
    }

    try {
      const playerId = Date.now();
      const stored = JSON.parse(localStorage.getItem("player_database") || "[]");
      const updated = [...stored, { id: playerId, name: normalizedInput, photo: "" }];
      localStorage.setItem("player_database", JSON.stringify(updated));
      window.dispatchEvent(new Event('ks_players_updated'));

      persistCustomPlayer(normalizedInput);
      setSaveStatus(t("common.playerSaved"));
      handleCommit(normalizedInput);
    } catch (error) {
      console.error("Player save failed", error);
      setSaveStatus(t("common.playerSaveFailed"));
    }
  };

  const scrollIntoView = (index) => {
    if (listRef.current && listRef.current.children[index]) {
      listRef.current.children[index].scrollIntoView({ block: 'nearest' });
    }
  };

  const handleKeyDown = (event) => {
    if (!isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') setIsOpen(true);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      // Bug 3 fix: compute next index first, then pass it to scrollIntoView
      // (reading activeIndex after setActiveIndex returns stale value)
      const nextIndex = activeIndex < filteredOptions.length - 1 ? activeIndex + 1 : activeIndex;
      setActiveIndex(nextIndex);
      scrollIntoView(nextIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = activeIndex > 0 ? activeIndex - 1 : activeIndex;
      setActiveIndex(nextIndex);
      scrollIntoView(nextIndex);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
        handleSelect(filteredOptions[activeIndex]);
      } else {
        handleCommit(inputValue);
      }
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full text-left" ref={wrapperRef}>
      <div className="relative flex items-center w-full">
        <input
          ref={inputRef}
          type="text"
          className={className}
          placeholder={placeholder || t("common.typeOrSelect")}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (inputValue.trim()) handleCommit(inputValue); }}
          onClick={() => setIsOpen(true)}
          style={{ paddingRight: '24px' }}
        />
        <div
          className="absolute right-1 cursor-pointer text-slate-400 select-none flex items-center justify-center w-6 h-6 hover:text-slate-600 bg-transparent"
          onClick={() => { inputRef.current?.focus(); setIsOpen(!isOpen); }}
          style={{ position: 'absolute', right: '4px' }}
        >
          <ChevronDown size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />
        </div>
      </div>

      {canSavePlayer && (
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
          <span className="text-slate-500">{t("common.selectOrTypePlayer")}</span>
          <button
            type="button"
            onClick={savePlayerToDatabase}
            className="rounded border border-blue-300 bg-blue-50 px-2 py-1 font-bold uppercase text-blue-700 hover:bg-blue-100"
          >
            {t("common.savePlayer")}
          </button>
        </div>
      )}

      {saveStatus && <div className="mt-1 text-[10px] font-bold uppercase text-emerald-600">{saveStatus}</div>}

      {isOpen && (
        <ul ref={listRef} className="absolute z-50 w-full mt-1 bg-white border border-slate-300 shadow-xl max-h-48 overflow-y-auto rounded-md text-sm text-black !p-0 !m-0 list-none text-left">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => (
              // Bug 1 fix: key must be a JSX prop, not plain text after the tag
              <li
                key={`${option}-${index}`}
                className={`p-2 cursor-pointer transition-colors border-b border-slate-100 last:border-0 ${index === activeIndex ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50'} uppercase text-left`}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setActiveIndex(index)}
                style={{ textAlign: 'left', margin: 0, padding: '8px 10px' }}
              >
                {option}
              </li>
            ))
          ) : (
            <li className="p-2 text-slate-500 italic text-center border-0 m-0" style={{ padding: '8px 10px' }}>
              {t("common.noMatchPressEnter")}
            </li>
          )}
          {canSavePlayer && (
            <li
              className="cursor-pointer border-t border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-bold uppercase text-blue-700 hover:bg-blue-50"
              onClick={savePlayerToDatabase}
            >
              {t("common.savePlayer")}: {normalizedInput}
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default ComboboxPlayerInput;
