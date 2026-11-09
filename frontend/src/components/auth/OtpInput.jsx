import React, { useRef } from 'react';
import './otp.css';

const LENGTH = 6;

/**
 * Six separate digit boxes. `value` is a digit string (0–6 chars, no gaps).
 * Supports auto-advance, backspace, arrow keys and pasting a full code.
 */
export default function OtpInput({ value = '', onChange, onComplete, disabled = false, hasError = false }) {
  const refs = useRef([]);

  const commit = (next) => {
    onChange(next);
    if (next.length === LENGTH) onComplete?.(next);
  };

  const focusAt = (index) => refs.current[Math.max(0, Math.min(LENGTH - 1, index))]?.focus();

  const handleInput = (index, event) => {
    const digit = event.target.value.replace(/\D/g, '').slice(-1);
    if (!digit) return;
    const next = (value.slice(0, index) + digit).slice(0, LENGTH);
    commit(next);
    if (index < LENGTH - 1) focusAt(index + 1);
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (value[index] !== undefined) {
        commit(value.slice(0, index));
      } else if (index > 0) {
        commit(value.slice(0, index - 1));
        focusAt(index - 1);
      }
    } else if (event.key === 'ArrowLeft') {
      focusAt(index - 1);
    } else if (event.key === 'ArrowRight') {
      focusAt(index + 1);
    }
  };

  const handlePaste = (index, event) => {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData('text') || '').replace(/\D/g, '');
    if (!pasted) return;
    const next = (value.slice(0, index) + pasted).slice(0, LENGTH);
    commit(next);
    focusAt(Math.min(next.length, LENGTH - 1));
  };

  return (
    <div className={`otp-input-group${hasError ? ' otp-input-group--error' : ''}`} role="group" aria-label="6-digit verification code">
      {Array.from({ length: LENGTH }, (_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className="otp-box"
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1} of 6`}
          value={value[i] ?? ''}
          disabled={disabled}
          onChange={(e) => handleInput(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
