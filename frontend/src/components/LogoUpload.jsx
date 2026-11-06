import React, { useState, useEffect, useRef, useCallback } from 'react';
import { matchesApi } from '../api';

const LogoUpload = ({ matchId, side, currentUrl, onUploaded, isMongoDB }) => {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const getAbsoluteUrl = useCallback((url) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
    const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);
    return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
  }, []);

  const [preview, setPreview] = useState(getAbsoluteUrl(currentUrl) || '');
  const [error, setError] = useState('');
  const fileRef = useRef();

  useEffect(() => {
    setPreview(getAbsoluteUrl(currentUrl));
  }, [currentUrl, getAbsoluteUrl]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;

    // Reset the file input so the same file can be re-selected
    if (fileRef.current) fileRef.current.value = '';

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      setError('Only PNG, JPG, WebP, GIF, SVG files are allowed.');
      return;
    }

    // Validate file size (3MB max, matching backend multer limit)
    if (file.size > 3 * 1024 * 1024) {
      setError('File too large. Maximum size is 3 MB.');
      return;
    }

    setError('');

    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    if (!matchId) {
      // No matchId yet (e.g. during match creation) — just show preview
      onUploaded && onUploaded(file, side);
      return;
    }

    // Upload to backend
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      formData.append('side', side);
      const res = await matchesApi.uploadLogo(matchId, formData);
      if (res.success && res.logoUrl) {
        // Store the relative URL - getAbsoluteUrl() in the overlay will resolve it to the correct full URL
        // This ensures logos work across different network IPs (OBS vs Admin panel)
        const relativeUrl = res.logoUrl; // e.g. '/uploads/logos/filename.png'
        const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);
        const fullUrl = `${API_BASE}${relativeUrl.startsWith('/') ? '' : '/'}${relativeUrl}`;
        setPreview(fullUrl); // Local preview uses full URL
        onUploaded && onUploaded(relativeUrl, side); // Push relative URL to backend/state
      } else {
        setError(res.error || 'Upload failed. Please try again.');
        // Revert to previous preview
        setPreview(getAbsoluteUrl(currentUrl));
      }
    } catch (err) {
      console.error('[LogoUpload] Upload error:', err);
      setError(err.message || 'Upload failed. Check your connection and try again.');
      // Revert to previous preview on error
      setPreview(getAbsoluteUrl(currentUrl));
    } finally {
      setUploading(false);
    }
  }, [matchId, side, onUploaded, currentUrl, getAbsoluteUrl]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleClick = useCallback((e) => {
    // Prevent double-fire if clicking on the remove button
    if (e.target.closest('button')) return;
    fileRef.current?.click();
  }, []);

  const label = side === 'bowling' ? 'Bowling Team' : 'Batting Team';
  const colorBadge = side === 'bowling' ? '#a78bfa' : '#4ade80';

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: colorBadge,
        letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6,
      }}>{label} Logo</div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={handleClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          border: `1.5px dashed ${dragging ? colorBadge : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 10,
          background: dragging ? `${colorBadge}18` : 'rgba(255,255,255,0.03)',
          cursor: 'pointer',
          transition: 'all 0.15s',
          position: 'relative',
          minHeight: 52,
        }}
      >
        {/* Preview */}
        {preview ? (
          <img
            src={preview}
            alt="logo"
            style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}
            onError={() => setPreview('')}
          />
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: 6,
            background: 'rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>🖼️</div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>
            {uploading ? '⏳ Uploading...' : dragging ? 'Drop to upload' : 'Click or drag logo'}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>PNG, JPG, WebP, SVG (max 3MB)</div>
        </div>
        {preview && (
          <button
            onClick={e => { e.stopPropagation(); setPreview(''); onUploaded && onUploaded('', side); }}
            style={{
              width: 18, height: 18, borderRadius: '50%',
              background: 'rgba(255,0,0,0.3)', border: 'none',
              color: '#fff', fontSize: 10, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>✕</button>
        )}
      </div>
      {error && <div style={{ color: '#f87171', fontSize: 10, marginTop: 4 }}>{error}</div>}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          handleFile(file);
        }}
      />
    </div>
  );
};

export default LogoUpload;
