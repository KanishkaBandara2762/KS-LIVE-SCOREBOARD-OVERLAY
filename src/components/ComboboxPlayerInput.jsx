import React, { useState, useEffect, useRef } from 'react';

const ComboboxPlayerInput = ({ value, onChange, options = [], placeholder = "-- TYPE OR SELECT --", className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || "");
  const [customPlayers, setCustomPlayers] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  useEffect(() => {
    const loadCustom = () => {
      try {
        const stored = JSON.parse(localStorage.getItem('ks_custom_players') || "[]");
        if (Array.isArray(stored)) {
          setCustomPlayers(stored);
        }
      } catch (e) {
        setCustomPlayers([]);
      }
    };
    loadCustom();
    window.addEventListener('storage', loadCustom);
    
    // Custom event for same-window syncing
    const handleCustomSync = () => loadCustom();
    window.addEventListener('ks_players_updated', handleCustomSync);
    
    return () => {
      window.removeEventListener('storage', loadCustom);
      window.removeEventListener('ks_players_updated', handleCustomSync);
    };
  }, []);

  const handleClickOutside = (e) => {
    if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
      setIsOpen(false);
      handleCommit(inputValue);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputValue]);

  // Merge match options and custom players
  const allOptions = Array.from(new Set([...options.map(o => o.name), ...customPlayers]));
  const filteredOptions = allOptions.filter(o => o.toLowerCase().includes(inputValue.toLowerCase()));

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    setIsOpen(true);
    setActiveIndex(-1);
  };

  const handleCommit = (finalValue) => {
    const trimmed = finalValue.trim().toUpperCase();
    if (trimmed) {
      // Check if it's genuinely new
      const isExisting = allOptions.find(o => o.toUpperCase() === trimmed);
      if (!isExisting) {
        const updated = [...customPlayers, trimmed];
        localStorage.setItem('ks_custom_players', JSON.stringify(updated));
        setCustomPlayers(updated);
        window.dispatchEvent(new Event('ks_players_updated')); // Alert same-window components
      }
      onChange({ target: { value: trimmed } });
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

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setIsOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
      scrollIntoView(activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : prev));
      scrollIntoView(activeIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
        handleSelect(filteredOptions[activeIndex]);
      } else {
        handleCommit(inputValue);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const scrollIntoView = (index) => {
    if (listRef.current && listRef.current.children[index]) {
      listRef.current.children[index].scrollIntoView({ block: 'nearest' });
    }
  };

  return (
    <div className="relative w-full text-left" ref={wrapperRef}>
      <div className="relative flex items-center w-full">
        <input
          ref={inputRef}
          type="text"
          className={className}
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onClick={() => setIsOpen(true)}
          style={{ paddingRight: '24px' }}
        />
        <div 
          className="absolute right-1 cursor-pointer text-slate-400 select-none flex items-center justify-center w-6 h-6 hover:text-slate-600 bg-transparent"
          onClick={() => { inputRef.current?.focus(); setIsOpen(!isOpen); }}
          style={{ position: 'absolute', right: '4px' }}
        >
          ▼
        </div>
      </div>

      {isOpen && (
        <ul ref={listRef} className="absolute z-50 w-full mt-1 bg-white border border-slate-300 shadow-xl max-h-48 overflow-y-auto rounded-md text-sm text-black !p-0 !m-0 list-none text-left">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, i) => (
              <li
                key={i}
                className={`p-2 cursor-pointer transition-colors border-b border-slate-100 last:border-0 ${i === activeIndex ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50'} uppercase text-left`}
                onClick={() => handleSelect(opt)}
                onMouseEnter={() => setActiveIndex(i)}
                style={{ textAlign: 'left', margin: 0, padding: '8px 10px' }}
              >
                {opt}
              </li>
            ))
          ) : (
            <li className="p-2 text-slate-500 italic text-center border-0 m-0" style={{ padding: '8px 10px' }}>No match. Press Enter to add.</li>
          )}
        </ul>
      )}
    </div>
  );
};

export default ComboboxPlayerInput;
