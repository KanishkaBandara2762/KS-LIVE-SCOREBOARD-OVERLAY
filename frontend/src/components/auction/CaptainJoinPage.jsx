import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Handshake, Hourglass, TriangleAlert } from 'lucide-react';
import { auctionApi } from '../../api';
import './Auction.css';

const EMPTY_DETAILS = { name: '', phone: '', nic: '' };

// Team owner link: pick a team, enter your details, and wait for the creator to approve.
export default function CaptainJoinPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await auctionApi.captainTeams(token));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'This team owner link is invalid.');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!selectedTeamId) {
      setError('Choose your team first.');
      return;
    }
    setSubmitting(true);
    try {
      await auctionApi.requestCaptainTeam(token, { teamId: selectedTeamId, ...details });
      await load();
    } catch (err) {
      setError(err.message || 'Could not send your request.');
    } finally {
      setSubmitting(false);
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
  const pendingTeam = data.teams.find((team) => team.pendingForMe);
  const availableTeams = data.teams.filter((team) => !team.claimed && !team.pending);

  let body;
  if (data.myTeamId) {
    const myTeam = data.teams.find((team) => team.id === data.myTeamId);
    body = (
      <>
        <div className="auction-alert success">
          You are approved as the owner of <strong>{myTeam?.name || 'your team'}</strong>.
        </div>
        <button className="auction-btn primary" onClick={() => navigate(`/auctions/${auctionId}/live`)}>
          Open bid room
        </button>
      </>
    );
  } else if (pendingTeam) {
    body = (
      <div className="auction-owner-waiting">
        <Hourglass size="1.4em" aria-hidden="true" />
        <div>
          <strong>Waiting for approval</strong>
          <p>Your request for <strong>{pendingTeam.name}</strong> has been sent. The auction creator will approve it and you will be assigned to the team.</p>
        </div>
      </div>
    );
  } else if (finished) {
    body = <div className="auction-empty small"><p>This auction has finished.</p></div>;
  } else if (data.teams.length === 0) {
    body = <div className="auction-empty small"><p>No teams have been added yet. Please check back later.</p></div>;
  } else if (availableTeams.length === 0) {
    body = <div className="auction-empty small"><p>All teams have an owner or a request waiting. Please contact the auction creator.</p></div>;
  } else {
    body = (
      <form className="auction-form auction-owner-form" onSubmit={submit}>
        <fieldset disabled={submitting} className="auction-fieldset">
          <div className="auction-field">
            <label>Choose your team *</label>
            <div className="auction-team-picker" role="radiogroup" aria-label="Teams">
              {availableTeams.map((team) => (
                <label key={team.id} className={`auction-team-option ${selectedTeamId === team.id ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="team"
                    value={team.id}
                    checked={selectedTeamId === team.id}
                    onChange={() => setSelectedTeamId(team.id)}
                  />
                  <span>
                    <strong>{team.name}</strong>
                    {team.shortName ? <small> ({team.shortName})</small> : null}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="auction-field">
            <label>Full name *</label>
            <input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} maxLength={80} required />
          </div>
          <div className="auction-form-row">
            <div className="auction-field">
              <label>Phone number *</label>
              <input value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} placeholder="e.g. +94 77 123 4567" required />
            </div>
            <div className="auction-field">
              <label>NIC number *</label>
              <input value={details.nic} onChange={(e) => setDetails({ ...details, nic: e.target.value })} placeholder="e.g. 901234567V or 199012345678" maxLength={20} required />
            </div>
          </div>

          {error ? <div className="auction-alert error">{error}</div> : null}
          <button type="submit" className="auction-btn primary" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send request'}
          </button>
        </fieldset>
      </form>
    );
  }

  return (
    <div className="auction-page">
      <div className="auction-panel auction-captain-card">
        <div className="auction-empty-icon"><Handshake size="1em" aria-hidden="true" /></div>
        <h1>Team owner — {data.auction.name}</h1>
        <p className="auction-access-note">
          Pick your team and enter your details. The creator will approve your request.
        </p>
        {body}
      </div>
    </div>
  );
}
