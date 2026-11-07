import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getToken, auctionApi, BASE_URL } from '../../api';

export const API_BASE = BASE_URL;

export const AUCTION_CURRENCIES = [
  { code: 'LKR', label: 'LKR — Sri Lankan Rupee' },
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'GBP', label: 'GBP — Pound Sterling' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
];

export const PLAYER_CATEGORIES = [
  'Marquee',
  'Batsman',
  'Bowler',
  'All-Rounder',
  'Wicket-Keeper',
  'Uncapped',
  'Other',
];

const CURRENCY_FORMAT = {
  LKR: { locale: 'en-LK', prefix: 'Rs. ' },
  USD: { locale: 'en-US', prefix: '$' },
  INR: { locale: 'en-IN', prefix: '₹' },
  GBP: { locale: 'en-GB', prefix: '£' },
  AUD: { locale: 'en-AU', prefix: 'A$' },
};

export function formatMoney(value, currency = 'LKR') {
  const number = Number(value) || 0;
  const config = CURRENCY_FORMAT[currency] || CURRENCY_FORMAT.LKR;
  return `${config.prefix}${new Intl.NumberFormat(config.locale, {
    maximumFractionDigits: 0,
  }).format(number)}`;
}

export function statusLabel(status) {
  return String(status || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatCountdown(ms) {
  const safe = Math.max(0, Number(ms) || 0);
  const seconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function useServerOffset(serverTime) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (serverTime) setOffset(Number(serverTime) - Date.now());
  }, [serverTime]);
  return offset;
}

export function Countdown({ endsAt, serverTime, className = '', label = true }) {
  const offset = useServerOffset(serverTime);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, []);

  if (!endsAt) {
    return (
      <span className={`auction-countdown ${className}`}>
        {label ? <small>TIMER</small> : null}
        <strong>--:--</strong>
      </span>
    );
  }

  const remaining = new Date(endsAt).getTime() - (now + offset);
  const urgency = remaining <= 0 ? 'ended' : remaining <= 10000 ? 'urgent' : '';

  return (
    <span className={`auction-countdown ${urgency} ${className}`}>
      {label ? <small>TIMER</small> : null}
      <strong>{formatCountdown(remaining)}</strong>
    </span>
  );
}

// Production builds default to polling because Netlify Functions cannot host a
// persistent Socket.IO server. Set VITE_REALTIME_MODE=socket to opt back in
// (local development defaults to socket automatically).
export const REALTIME_MODE = String(
  import.meta.env.VITE_REALTIME_MODE || (import.meta.env.PROD ? 'polling' : 'socket')
).toLowerCase();

export const isPollingMode = REALTIME_MODE !== 'socket';

const POLL_INTERVAL_MS = Math.max(
  1000,
  Number(import.meta.env.VITE_AUCTION_POLL_MS) || 3000
);

/**
 * Turn two REST snapshots into the same event shapes the Socket.IO server
 * emits. Components already listen to `lastEvent`, so they work unchanged.
 */
function diffSnapshot(previous, next) {
  if (!previous || !next) return null;

  const prevAuction = previous.auction || {};
  const nextAuction = next.auction || {};

  if (prevAuction.status && nextAuction.status && prevAuction.status !== nextAuction.status) {
    return {
      type: 'state-changed',
      payload: { status: nextAuction.status },
      at: Date.now(),
    };
  }

  const prevLot = previous.currentLot || null;
  const nextLot = next.currentLot || null;
  const prevLotId = prevLot?.id || null;
  const nextLotId = nextLot?.id || null;

  // A lot finished between two polls.
  if (prevLotId && prevLotId !== nextLotId) {
    const finished = (next.players || []).find((player) => player.id === prevLotId);
    if (finished) {
      const team = (next.teams || []).find(
        (item) => item.id === String(finished.soldToTeamId || '')
      );
      return {
        type: 'lot-closed',
        payload: {
          result:
            finished.status === 'sold'
              ? 'sold'
              : finished.status === 'withdrawn'
                ? 'withdrawn'
                : 'unsold',
          playerId: finished.id,
          playerName: finished.name,
          soldToTeamId: finished.soldToTeamId || null,
          soldToTeamName: team?.name || null,
          price: finished.soldPrice ?? null,
          reason: finished.unsoldReason || finished.withdrawnReason || '',
          serverTime: next.serverTime,
        },
        at: Date.now(),
      };
    }
  }

  // A new lot opened.
  if (nextLot && prevLotId !== nextLotId) {
    return {
      type: 'lot-opened',
      payload: {
        player: nextLot,
        minNextBid: next.minNextBid,
        timerEndsAt: nextLot.timerEndsAt,
        serverTime: next.serverTime,
      },
      at: Date.now(),
    };
  }

  // Same lot: detect a new bid or a timer extension.
  if (prevLot && nextLot && prevLot.id === nextLot.id) {
    if (nextLot.currentBid !== null && nextLot.currentBid !== prevLot.currentBid) {
      const team = (next.teams || []).find(
        (item) => item.id === String(nextLot.currentBidderTeamId || '')
      );
      return {
        type: 'bid-accepted',
        payload: {
          amount: nextLot.currentBid,
          team,
          player: nextLot,
          minNextBid: next.minNextBid,
          timerEndsAt: nextLot.timerEndsAt,
          serverTime: next.serverTime,
        },
        at: Date.now(),
      };
    }

    if (prevLot.timerEndsAt !== nextLot.timerEndsAt) {
      return {
        type: 'timer-extended',
        payload: {
          playerId: nextLot.id,
          timerEndsAt: nextLot.timerEndsAt,
          serverTime: next.serverTime,
        },
        at: Date.now(),
      };
    }
  }

  return null;
}

/**
 * Shared live hook.
 *
 * - `socket` mode: Socket.IO with the JWT (local dev / always-on hosts).
 * - `polling` mode: REST snapshot refresh every few seconds (Netlify).
 *
 * Both modes expose the same `snapshot`, `connected`, `lastEvent` and
 * `setSnapshot` values. `canEmit` tells components whether Socket.IO actions
 * are available; when false they should call the REST method instead.
 */
export function useAuctionSocket(
  auctionId,
  { enabled = true, useAuthToken = true, publicSlug = null } = {}
) {
  const socketRef = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [lastEvent, setLastEvent] = useState(null);
  const prevSnapshotRef = useRef(null);

  useEffect(() => {
    if (!enabled || !auctionId) return undefined;

    if (isPollingMode) {
      let cancelled = false;
      let timer = null;
      let inFlight = false;

      const poll = async () => {
        if (cancelled || inFlight) return;
        inFlight = true;

        try {
          const hasToken = useAuthToken && Boolean(getToken());
          const res = hasToken
            ? await auctionApi.get(auctionId)
            : await auctionApi.publicGet(publicSlug || auctionId);

          if (cancelled) return;

          const event = diffSnapshot(prevSnapshotRef.current, res);
          prevSnapshotRef.current = res;
          setSnapshot(res);
          setConnected(true);
          setError('');
          if (event) setLastEvent(event);
        } catch (err) {
          if (!cancelled) {
            setConnected(false);
            setError(err?.message || 'Could not refresh the auction.');
          }
        } finally {
          inFlight = false;
          if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      poll();

      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }

    const socket = io(`${API_BASE}/auction`, {
      auth: { token: useAuthToken ? getToken() : null, auctionId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError('');
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => {
      setConnected(false);
      setError(err?.message || 'Could not connect to the auction channel.');
    });
    socket.on('auction:snapshot', (payload) => setSnapshot(payload));
    socket.on('auction:connected', (payload) => {
      setLastEvent({ type: 'connected', payload, at: Date.now() });
    });
    socket.on('auction:lot-opened', (payload) => {
      setLastEvent({ type: 'lot-opened', payload, at: Date.now() });
    });
    socket.on('auction:bid-accepted', (payload) => {
      setLastEvent({ type: 'bid-accepted', payload, at: Date.now() });
    });
    socket.on('auction:bid-rejected', (payload) => {
      setLastEvent({ type: 'bid-rejected', payload, at: Date.now() });
    });
    socket.on('auction:timer-extended', (payload) => {
      setLastEvent({ type: 'timer-extended', payload, at: Date.now() });
    });
    socket.on('auction:lot-closed', (payload) => {
      setLastEvent({ type: 'lot-closed', payload, at: Date.now() });
    });
    socket.on('auction:state-changed', (payload) => {
      setLastEvent({ type: 'state-changed', payload, at: Date.now() });
    });
    socket.on('auction:error', (payload) => {
      setError(payload?.error || 'Auction channel error.');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [auctionId, enabled, useAuthToken, publicSlug]);

  const emitWithAck = useCallback((event, payload = {}, timeout = 8000) => {
    return new Promise((resolve, reject) => {
      if (isPollingMode) {
        reject(new Error('Real-time actions are unavailable. Use the REST action.'));
        return;
      }

      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        reject(new Error('Not connected to the auction channel.'));
        return;
      }
      socket.timeout(timeout).emit(event, payload, (err, response) => {
        if (err) {
          reject(new Error('The server did not respond. Please retry.'));
          return;
        }
        resolve(response);
      });
    });
  }, []);

  return {
    snapshot,
    setSnapshot,
    connected,
    error,
    lastEvent,
    emitWithAck,
    canEmit: !isPollingMode,
    socket: socketRef,
  };
}

export function useAuctionSnapshot(auctionId, enabled = true) {
  const socket = useAuctionSocket(auctionId, { enabled });
  const [loading, setLoading] = useState(true);
  const [restError, setRestError] = useState('');
  const { setSnapshot } = socket;

  useEffect(() => {
    if (!auctionId || !enabled) return undefined;
    let cancelled = false;
    setLoading(true);
    auctionApi
      .get(auctionId)
      .then((res) => {
        if (!cancelled) {
          setSnapshot(res);
          setRestError('');
        }
      })
      .catch((err) => {
        if (!cancelled) setRestError(err.message || 'Failed to load auction.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auctionId, enabled, setSnapshot]);

  return { ...socket, loading, restError };
}
