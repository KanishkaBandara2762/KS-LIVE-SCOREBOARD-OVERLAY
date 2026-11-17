import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Handshake, TriangleAlert } from 'lucide-react';
import { auctionApi } from '../../api';
import './Auction.css';

export default function CaptainJoinPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyTeamId, setBusyTeamId] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await auctionApi.captainTeams(token));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'This captain link is invalid.');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const requestTeam = async (teamId) => {
    setBusyTeamId(teamId);
    setError('');
    setMessage('');
    try {
      const res = await auctionApi.requestCaptainTeam(token, teamId);
      setMessage(res.message || 'Request sent.');
      await load();
    } catch (err) {
      setError(err.message || 'Could not send the request.');
    } finally {
      setBusyTeamId(null);
    }
  };

  if (loadError) {
    return (
      <div className="auction-page auction-join-page">
        <div className="auction-panel auction-join-card">
          <div className="auction-empty-icon"><TriangleAlert size="1em" aria-hidden="true" /></div>
          <h1>Link not available</h1>
          <p>{loadError}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="auction-page auction-join-page">
        <div className="auction-panel auction-join-card"><h1>Loading…</h1></div>
      </div>
    );
  }

  const auctionId = data.auction.id;
  const finished = ['completed', 'cancelled'].includes(data.auction.status);

  return (
    <div className="auction-page">
      <div className="auction-panel auction-captain-card">
        <div className="auction-empty-icon"><Handshake size="1em" aria-hidden="true" /></div>
        <h1>Team captain — {data.auction.name}</h1>

        {data.myTeamId ? (
          <>
            <p>You are the captain of your team.</p>
            <button className="auction-btn primary" onClick={() => navigate(`/auctions/${auctionId}/live`)}>
              Open bid room
            </button>
          </>
        ) : (
          <p>Choose your team. The auction owner must approve your request before you can bid.</p>
        )}

        {message ? <div className="auction-alert success">{message}</div> : null}
        {error ? <div className="auction-alert error">{error}</div> : null}

        {!data.myTeamId && data.teams.length === 0 ? (
          <div className="auction-empty small"><p>No teams have been added yet.</p></div>
        ) : null}

        {!data.myTeamId ? (
          <ul className="auction-captain-teams">
            {data.teams.map((team) => {
              let label = 'Request this team';
              if (team.pendingForMe) label = 'Waiting for approval';
              else if (team.pending) label = 'Requested by another captain';
              else if (team.claimed) label = 'Already has a captain';
              const disabled = finished || team.claimed || team.pending || busyTeamId !== null;
              return (
                <li key={team.id} className="auction-captain-team">
                  <strong>{team.name}</strong>
                  {team.shortName ? <span> ({team.shortName})</span> : null}
                  <button className="auction-btn small" disabled={disabled} onClick={() => requestTeam(team.id)}>
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
