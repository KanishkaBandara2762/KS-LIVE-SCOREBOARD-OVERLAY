import React, { useEffect, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { BASE_URL } from '../../api';

// Uploaded logos are served by the API, which may be on another origin.
export function logoUrl(logo) {
  if (!logo) return '';
  return logo.startsWith('/uploads') ? `${BASE_URL}${logo}` : logo;
}

// Small round avatar: the team logo when there is one, otherwise the short name.
export function TeamAvatar({ team, className = 'auction-team-avatar' }) {
  const src = logoUrl(team.logo);
  if (src) return <img className={`${className} has-logo`} src={src} alt="" />;
  return <div className={className}>{team.shortName || team.name.slice(0, 2).toUpperCase()}</div>;
}

// File picker with preview. `currentLogo` is shown until a new file is chosen.
export function TeamLogoPicker({ file, onFile, currentLogo = '', disabled = false }) {
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shown = previewUrl || logoUrl(currentLogo);

  return (
    <div className="auction-logo-picker">
      <div className="auction-logo-preview">
        {shown ? <img src={shown} alt="Team logo preview" /> : <ImagePlus size="1.3em" aria-hidden="true" />}
      </div>
      <label className={`auction-btn small ${disabled ? 'disabled' : ''}`}>
        {shown ? 'Change logo' : 'Add logo'}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          style={{ display: 'none' }}
          disabled={disabled}
          onChange={(event) => onFile(event.target.files?.[0] || null)}
        />
      </label>
      {file ? (
        <button type="button" className="auction-btn tiny ghost" onClick={() => onFile(null)} disabled={disabled}>Clear</button>
      ) : null}
    </div>
  );
}
