import React, { useEffect, useState } from 'react';
import { ImagePlus } from 'lucide-react';

// Shared player form, used by the owner's "Add a player" and the public registration page.
export const POSITIONS = ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'];
export const BATTING_STYLES = ['Right-hand bat', 'Left-hand bat'];
export const BOWLING_STYLES = [
  'Right-arm fast',
  'Right-arm medium',
  'Right-arm off-spin',
  'Right-arm leg-spin',
  'Left-arm fast',
  'Left-arm spin',
  'Does not bowl',
];

export const EMPTY_PLAYER_FORM = {
  shirtNo: '',
  name: '',
  role: 'Batsman',
  currentClub: '',
  age: '',
  battingStyle: '',
  bowlingStyle: '',
};

// Builds multipart data so the optional photo can travel with the fields.
export function playerFormToFormData(values, photoFile) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.append(key, value ?? ''));
  if (photoFile) data.append('photo', photoFile);
  return data;
}

export default function PlayerDetailsFields({ values, onChange, photoFile, onPhotoChange, disabled = false }) {
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!photoFile) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(photoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const set = (field) => (event) => onChange({ ...values, [field]: event.target.value });

  return (
    <div className="auction-form">
      <div className="auction-form-row">
        <div className="auction-field" style={{ flex: '0 0 30%' }}>
          <label>No (optional)</label>
          <input value={values.shirtNo} onChange={set('shirtNo')} placeholder="001" maxLength={10} disabled={disabled} />
        </div>
        <div className="auction-field" style={{ flex: 1 }}>
          <label>Player name *</label>
          <input value={values.name} onChange={set('name')} placeholder="Full name" maxLength={120} required disabled={disabled} />
        </div>
      </div>

      <div className="auction-field">
        <label>Position</label>
        <select value={values.role} onChange={set('role')} disabled={disabled}>
          {POSITIONS.map((position) => <option key={position}>{position}</option>)}
        </select>
      </div>

      <div className="auction-field">
        <label>Current club</label>
        <input value={values.currentClub} onChange={set('currentClub')} placeholder="e.g. Mumbai Indians" maxLength={80} disabled={disabled} />
      </div>

      <div className="auction-field">
        <label>Age (optional)</label>
        <input type="number" min="10" max="80" value={values.age} onChange={set('age')} placeholder="e.g. 28" disabled={disabled} />
      </div>

      <div className="auction-field">
        <label>Batting style (optional)</label>
        <select value={values.battingStyle} onChange={set('battingStyle')} disabled={disabled}>
          <option value="">Select batting style</option>
          {BATTING_STYLES.map((style) => <option key={style}>{style}</option>)}
        </select>
      </div>

      <div className="auction-field">
        <label>Bowling style (optional)</label>
        <select value={values.bowlingStyle} onChange={set('bowlingStyle')} disabled={disabled}>
          <option value="">Select bowling style</option>
          {BOWLING_STYLES.map((style) => <option key={style}>{style}</option>)}
        </select>
      </div>

      <div className="auction-field">
        <label>Player photo (optional, under 3 MB)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              border: '1px dashed #cbd5e1',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: '0 0 auto',
            }}
          >
            {previewUrl ? <img src={previewUrl} alt="Selected player" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImagePlus size="1.4em" aria-hidden="true" />}
          </div>
          <label className="auction-btn small primary" style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}>
            Upload image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
              disabled={disabled}
              onChange={(event) => onPhotoChange(event.target.files?.[0] || null)}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
