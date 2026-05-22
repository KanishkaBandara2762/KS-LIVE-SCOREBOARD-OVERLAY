const cron = require('node-cron');
const Match = require('../models/Match');
const OverlaySettings = require('../models/OverlaySettings');
const ScoreEvent = require('../models/ScoreEvent');

function initCleanupJob() {
  // Run everyday at midnight (0 0 * * *)
  cron.schedule('0 0 * * *', async () => {
    console.log('[CLEANUP JOB] Running daily automatic database cleanup...');
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Find all completed or abandoned matches older than 30 days
      const matchesToDelete = await Match.find({
        matchStatus: { $in: ['completed', 'abandoned', 'Match Ended', 'ended'] },
        updatedAt: { $lt: thirtyDaysAgo }
      }).select('matchId');

      if (matchesToDelete.length === 0) {
        console.log('[CLEANUP JOB] No matches older than 30 days found for deletion.');
        return;
      }

      const matchIds = matchesToDelete.map(m => m.matchId);
      console.log(`[CLEANUP JOB] Found ${matchIds.length} completed/abandoned matches to delete:`, matchIds);

      // Perform clean deletions
      const [matchRes, settingsRes, eventsRes] = await Promise.all([
        Match.deleteMany({ matchId: { $in: matchIds } }),
        OverlaySettings.deleteMany({ matchId: { $in: matchIds } }),
        ScoreEvent.deleteMany({ matchId: { $in: matchIds } })
      ]);

      console.log(`[CLEANUP JOB] Successfully pruned completed matches older than 30 days:`);
      console.log(` - Matches deleted: ${matchRes.deletedCount}`);
      console.log(` - Overlay settings deleted: ${settingsRes.deletedCount}`);
      console.log(` - Score events deleted: ${eventsRes.deletedCount}`);

    } catch (err) {
      console.error('[CLEANUP JOB] Error running database cleanup job:', err.message);
    }
  });

  console.log('✅ Daily automatic database cleanup job scheduled at 00:00');
}

module.exports = initCleanupJob;
