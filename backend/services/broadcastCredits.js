/**
 * Broadcast (OBS link) credits.
 * Creating matches, tournaments and auctions is free. Scoring is always free.
 * Each OBS link costs 1 credit and stays open for 24 hours. After that the
 * link is locked again until the owner spends another credit.
 *
 * Lock state per match or tournament:
 *   - broadcastExpiresAt set  → open while now < broadcastExpiresAt.
 *   - no expiry, broadcastLocked true → locked (never unlocked yet).
 *   - no expiry, broadcastLocked missing/false → open (legacy, created before this rule).
 * Tournament matches (tournamentId set) follow their tournament's state.
 */

const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const { isAdminRole } = require('../utils/roles');
const { consumeMatchCredit, refundMatchCredit } = require('./matchCredits');

const BROADCAST_WINDOW_MS = 24 * 60 * 60 * 1000;

// True when a match/tournament document's OBS link is locked at time `now`.
function isBroadcastLockedDoc(doc, now = new Date()) {
  if (!doc) return false;
  if (doc.broadcastExpiresAt) return new Date(doc.broadcastExpiresAt) <= now;
  return Boolean(doc.broadcastLocked);
}

// Resolves the lock state for a match (tournament matches use the tournament).
async function resolveMatchBroadcast(match) {
  if (!match) return { broadcastLocked: false, broadcastExpiresAt: null };
  if (match.tournamentId) {
    const tournament = await Tournament.findById(match.tournamentId)
      .select('broadcastLocked broadcastExpiresAt').lean();
    return {
      broadcastLocked: isBroadcastLockedDoc(tournament),
      broadcastExpiresAt: tournament?.broadcastExpiresAt ?? null,
    };
  }
  return {
    broadcastLocked: isBroadcastLockedDoc(match),
    broadcastExpiresAt: match.broadcastExpiresAt ?? null,
  };
}

async function isMatchBroadcastLocked(match) {
  return (await resolveMatchBroadcast(match)).broadcastLocked;
}

/**
 * Opens the OBS link for 24 hours. Returns:
 *   { status, charged, broadcastExpiresAt, code?, error? }
 * Already open → 200, charged:false, same expiry (no second charge).
 */
async function unlockBroadcast(Model, id, ownerField, userId, role) {
  const doc = await Model.findOne({ _id: id, [ownerField]: userId })
    .select('broadcastLocked broadcastExpiresAt').lean();
  if (!doc) return { status: 404, error: 'Not found.' };

  const now = new Date();
  if (!isBroadcastLockedDoc(doc, now)) {
    return { status: 200, charged: false, broadcastExpiresAt: doc.broadcastExpiresAt ?? null };
  }

  const isAdmin = isAdminRole(role);
  if (!isAdmin) {
    const taken = await consumeMatchCredit(userId);
    if (!taken) {
      return {
        status: 402,
        code: 'CREDITS_REQUIRED',
        error: 'You need 1 credit to generate a broadcast (OBS) link. Buy a credit pack to continue.',
      };
    }
  }

  const expiresAt = new Date(now.getTime() + BROADCAST_WINDOW_MS);
  try {
    // Only succeeds if the link is still locked (no expiry in the future).
    const result = await Model.updateOne(
      { _id: id, $nor: [{ broadcastExpiresAt: { $gt: now } }] },
      { $set: { broadcastLocked: false, broadcastExpiresAt: expiresAt } }
    );
    if (result.modifiedCount === 0) {
      // Another request opened it first; give the credit back.
      if (!isAdmin) await refundMatchCredit(userId);
      const fresh = await Model.findById(id).select('broadcastExpiresAt').lean();
      return { status: 200, charged: false, broadcastExpiresAt: fresh?.broadcastExpiresAt ?? null };
    }
  } catch (err) {
    if (!isAdmin) await refundMatchCredit(userId);
    throw err;
  }

  return { status: 200, charged: !isAdmin, broadcastExpiresAt: expiresAt };
}

// Opens a match broadcast. Tournament matches open their tournament instead.
async function unlockMatchBroadcast(matchId, userId, role) {
  const match = await Match.findOne({ matchId, ownerUid: userId }).select('tournamentId').lean();
  if (!match) return { status: 404, error: 'Match not found.' };
  if (match.tournamentId) {
    return unlockBroadcast(Tournament, match.tournamentId, 'clientId', userId, role);
  }
  return unlockBroadcast(Match, match._id, 'ownerUid', userId, role);
}

module.exports = {
  BROADCAST_WINDOW_MS,
  isBroadcastLockedDoc,
  resolveMatchBroadcast,
  isMatchBroadcastLocked,
  unlockBroadcast,
  unlockMatchBroadcast,
};
