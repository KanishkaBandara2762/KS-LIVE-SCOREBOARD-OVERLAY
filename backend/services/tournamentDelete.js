const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const OverlaySettings = require('../models/OverlaySettings');
const ScoreEvent = require('../models/ScoreEvent');
const Auction = require('../models/Auction');
const User = require('../models/User');

/**
 * Deletes a tournament and everything that belongs to it: its matches,
 * their overlay settings and score events. Linked auctions are kept (they
 * were a separate credit) but unlinked. Credit history is never touched.
 * Returns the number of matches deleted.
 */
async function deleteTournamentCascade(tournament, io) {
  const tournamentId = tournament._id;
  const matches = await Match.find({ tournamentId }).select('matchId ownerUid').lean();
  const matchIds = matches.map((m) => m.matchId);

  await Promise.all([
    Match.deleteMany({ tournamentId }),
    OverlaySettings.deleteMany({ matchId: { $in: matchIds } }),
    ScoreEvent.deleteMany({ matchId: { $in: matchIds } }),
    Auction.updateMany({ tournamentId }, { $set: { tournamentId: null } }),
    Tournament.deleteOne({ _id: tournamentId }),
  ]);

  // Keep each owner's match counter in step (same counter deleteMatch uses).
  const perOwner = new Map();
  for (const m of matches) {
    const key = String(m.ownerUid);
    perOwner.set(key, (perOwner.get(key) || 0) + 1);
  }
  await Promise.all([...perOwner].map(([ownerId, count]) =>
    User.updateOne({ _id: ownerId }, { $inc: { matchCount: -count } })));

  // Take any open OBS overlay off air.
  if (io) {
    const payload = { tournamentId: String(tournamentId), currentMatchId: null, match: null, offAir: true };
    io.of('/overlay').to(`tournament:${tournamentId}`).emit('matchSwitched', payload);
    io.of('/admin').to(`tournament:${tournamentId}`).emit('matchSwitched', payload);
  }

  return matches.length;
}

module.exports = { deleteTournamentCascade };
