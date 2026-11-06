import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { auctionApi } from '../../api';
import './Auction.css';

export default function AuctionJoinPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const attemptedTokenRef = useRef(null);

  useEffect(() => {
    // React StrictMode runs effects twice in development. The invite endpoint
    // is single-use, so only send one request per token.
    if (attemptedTokenRef.current === token) return undefined;
    attemptedTokenRef.current = token;

    let cancelled = false;
    auctionApi
      .join(token)
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not accept invite.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="auction-page auction-join-page">
      <div className="auction-panel auction-join-card">
        <div className="auction-empty-icon">{loading ? '⏳' : error ? '⚠️' : '🤝'}</div>
        {loading ? (
          <>
            <h1>Joining auction…</h1>
            <p>Checking your invite link.</p>
          </>
        ) : error ? (
          <>
            <h1>Invite could not be accepted</h1>
            <p>{error}</p>
            <button className="auction-btn" onClick={() => navigate('/auctions')}>Go to auctions</button>
          </>
        ) : (
          <>
            <h1>You’re in!</h1>
            <p>{result.message}</p>
            <div className="auction-join-actions">
              <button className="auction-btn primary" onClick={() => navigate(`/auctions/${result.auctionId}/live`)}>
                Open bid room
              </button>
              <button className="auction-btn" onClick={() => navigate(`/auctions/${result.auctionId}/results`)}>
                View results
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
