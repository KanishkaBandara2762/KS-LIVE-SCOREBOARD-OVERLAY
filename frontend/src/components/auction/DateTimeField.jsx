import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import './AuctionAccess.css';

const pad = (n) => String(n).padStart(2, '0');

// Local date and time parts of an ISO string (what the user sees in their own timezone).
function partsFromIso(iso) {
  if (!iso) return { date: '', hour: '', minute: '', period: 'AM' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', hour: '', minute: '', period: 'AM' };
  const h24 = d.getHours();
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hour: String(h24 % 12 || 12),
    minute: pad(d.getMinutes()),
    period: h24 >= 12 ? 'PM' : 'AM',
  };
}

// Builds an ISO string from the parts, or '' while anything is missing or invalid.
function isoFromParts({ date, hour, minute, period }) {
  const h = Number(hour);
  const m = Number(minute);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  if (!Number.isInteger(h) || h < 1 || h > 12) return '';
  if (!Number.isInteger(m) || m < 0 || m > 59) return '';
  const h24 = (h % 12) + (period === 'PM' ? 12 : 0);
  const local = new Date(`${date}T${pad(h24)}:${pad(m)}:00`);
  return Number.isNaN(local.getTime()) ? '' : local.toISOString();
}

// Date (calendar or typed) plus time (hour and minute with up/down buttons, or typed; AM/PM toggle).
// `value` is an ISO string or ''. `onChange` receives an ISO string or '' while incomplete.
export default function DateTimeField({ value, onChange, label, disabled = false }) {
  const [parts, setParts] = useState(() => partsFromIso(value));
  const lastEmitted = useRef(value || '');

  // Follow external changes (for example after a save or a reload) without fighting typing.
  useEffect(() => {
    if ((value || '') !== lastEmitted.current) {
      lastEmitted.current = value || '';
      setParts(partsFromIso(value));
    }
  }, [value]);

  const update = (next) => {
    setParts(next);
    const iso = isoFromParts(next);
    lastEmitted.current = iso;
    onChange(iso);
  };

  const stepHour = (delta) => {
    const current = Number(parts.hour) || 12;
    const next = ((current - 1 + delta + 12) % 12) + 1;
    update({ ...parts, hour: String(next) });
  };

  const stepMinute = (delta) => {
    const current = Number(parts.minute) || 0;
    update({ ...parts, minute: pad((current + delta + 60) % 60) });
  };

  // Typed values are cleaned up and clamped when the field loses focus.
  const commitHour = () => {
    const n = Math.min(12, Math.max(1, Number(parts.hour) || 12));
    update({ ...parts, hour: String(n) });
  };
  const commitMinute = () => {
    const n = Math.min(59, Math.max(0, Number(parts.minute) || 0));
    update({ ...parts, minute: pad(n) });
  };

  return (
    <div className="auction-datetime">
      {label ? <label className="auction-datetime-label">{label}</label> : null}
      <div className="auction-datetime-row">
        <input
          type="date"
          className="auction-datetime-date"
          value={parts.date}
          disabled={disabled}
          onChange={(e) => update({ ...parts, date: e.target.value })}
          aria-label="Date"
        />

        <div className="auction-time-box" aria-label="Time">
          <div className="auction-time-part">
            <button type="button" className="auction-spin" onClick={() => stepHour(1)} disabled={disabled} aria-label="Hour up">
              <ChevronUp size="1em" aria-hidden="true" />
            </button>
            <input
              className="auction-time-input"
              inputMode="numeric"
              value={parts.hour}
              placeholder="hh"
              maxLength={2}
              disabled={disabled}
              onChange={(e) => setParts({ ...parts, hour: e.target.value.replace(/\D/g, '').slice(0, 2) })}
              onBlur={commitHour}
              aria-label="Hour"
            />
            <button type="button" className="auction-spin" onClick={() => stepHour(-1)} disabled={disabled} aria-label="Hour down">
              <ChevronDown size="1em" aria-hidden="true" />
            </button>
          </div>

          <span className="auction-time-colon">:</span>

          <div className="auction-time-part">
            <button type="button" className="auction-spin" onClick={() => stepMinute(1)} disabled={disabled} aria-label="Minute up">
              <ChevronUp size="1em" aria-hidden="true" />
            </button>
            <input
              className="auction-time-input"
              inputMode="numeric"
              value={parts.minute}
              placeholder="mm"
              maxLength={2}
              disabled={disabled}
              onChange={(e) => setParts({ ...parts, minute: e.target.value.replace(/\D/g, '').slice(0, 2) })}
              onBlur={commitMinute}
              aria-label="Minute"
            />
            <button type="button" className="auction-spin" onClick={() => stepMinute(-1)} disabled={disabled} aria-label="Minute down">
              <ChevronDown size="1em" aria-hidden="true" />
            </button>
          </div>

          <div className="auction-period" role="group" aria-label="AM or PM">
            {['AM', 'PM'].map((period) => (
              <button
                key={period}
                type="button"
                className={parts.period === period ? 'active' : ''}
                disabled={disabled}
                onClick={() => update({ ...parts, period })}
              >
                {period}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Default for a new auction: the next full hour today.
export function defaultScheduleIso() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

// Readable label such as "Thu 20 Nov 2026, 2:00 PM".
export function formatSchedule(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
