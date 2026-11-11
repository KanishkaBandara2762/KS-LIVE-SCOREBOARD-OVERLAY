/**
 * KS Live — Match Routes v3.0
 */

const express = require('express');
const { body, param } = require('express-validator');
const {
  createMatch,
  getMatch,
  getMatches,
  deleteMatch,
  updateScore,
  updatePlayers,
  toggleTicker,
  manualBallCorrection,
  getOverlay,
  updateMatch,
  getPublicMatch,
  getPublicMatches,
  undoLastBall,
  changeBowler,
  startSecondInnings,
  uploadLogo,
  logoUploadMiddleware,
  unlockBroadcastLink,
  // v3.0 new endpoints
  awardPenaltyRuns,
  recordOverthrow,
  getDeliveryHistory,
  updateMatchFormat,
  startSuperOver,
  declareInnings,
  getMatchRules,
} = require('../controllers/matchController');
const authMiddleware = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

// ── Public endpoints ──────────────────────────────────────────────────────────
router.get('/overlay/:matchId', getOverlay);
router.get('/public/matches', getPublicMatches);
router.get('/public/match/:idOrSlug', getPublicMatch);
const stats = require('../controllers/statsController');
router.get('/public/match/:id/leaderboards', stats.getPublicLeaderboards);

// ── Serve uploaded logos as static ───────────────────────────────────────────
router.use('/uploads', express.static(require('path').join(__dirname, '../uploads')));

// ── All other routes require auth ─────────────────────────────────────────────
router.use(authMiddleware);

router.get('/matches', getMatches);
// Awards & leaderboards (KS LIVE Impact Model)
router.get('/match/:id/awards', stats.getMatchAwards);
router.put('/match/:id/man-of-the-match', stats.setManOfTheMatch);
router.get('/stats/leaderboards', stats.getLeaderboards);
router.get('/match/:id', getMatch);

// NOTE: Creating and scoring matches is free. Generating the broadcast (OBS) link
// costs 1 credit per match, see POST /match/:id/unlock-broadcast.


// ── POST /create-match ────────────────────────────────────────────────────────
router.post(
  '/create-match',
  [
    body('battingTeam').optional().isString().trim().notEmpty(),
    body('bowlingTeam').optional().isString().trim().notEmpty(),
    body('maxOvers').optional().isInt({ min: 1, max: 50 }),
    body('ballsPerOver').optional().isInt({ min: 4, max: 8 }),
    body('matchType').optional().isIn(['T20', 'ODI', 'T10', 'Custom', 'Test']),
    validate,
  ],
  createMatch
);

// ── POST /match/:id/unlock-broadcast (1 credit, once per match) ──────────────
router.post('/match/:id/unlock-broadcast', unlockBroadcastLink);

// ── DELETE /match/:id ─────────────────────────────────────────────────────────
router.delete('/match/:id', deleteMatch);

// ── PUT /match/:id (generic settings) ────────────────────────────────────────
router.put('/match/:id', updateMatch);

// ── PUT /update-score/:id ─────────────────────────────────────────────────────
router.put(
  '/update-score/:id',
  [
    param('id').notEmpty(),
    body('delivery')
      .isIn(['dot', '1', '2', '3', '4', '5', '6', 'wide', 'noball', 'wicket', 'runout', 'lb', 'byes', 'deadball']),
    body('extraRuns').optional().isInt({ min: 0 }),
    validate,
  ],
  updateScore
);

// ── PUT /update-players/:id ───────────────────────────────────────────────────
router.put('/update-players/:id', updatePlayers);

// ── PUT /toggle-ticker/:id ────────────────────────────────────────────────────
router.put(
  '/toggle-ticker/:id',
  [
    body('message').optional().isString().trim(),
    body('visible').optional().isBoolean(),
    body('mode').optional().isIn(['banner', 'ticker', 'alert', 'breaking']),
    body('autoRepeat').optional().isBoolean(),
    validate,
  ],
  toggleTicker
);

// ── PUT /manual-ball-correction/:id ──────────────────────────────────────────
router.put(
  '/manual-ball-correction/:id',
  [
    body('scoreDelta').optional().isInt(),
    body('wicketsDelta').optional().isInt({ min: -10, max: 10 }),
    body('ballsDelta').optional().isInt(),
    body('manualBallsValue').optional().isInt({ min: 0 }),
    body('manualBallsOverride').optional().isBoolean(),
    validate,
  ],
  manualBallCorrection
);

// ── POST /undo/:id — Full undo of last delivery ───────────────────────────────
router.post('/undo/:id', undoLastBall);

// ── PUT /change-bowler/:id — Change bowler with history ──────────────────────
router.put('/change-bowler/:id', changeBowler);

// ── POST /second-innings/:id — Start 2nd innings with auto team swap ─────────
router.post('/second-innings/:id', startSecondInnings);

// ── POST /upload-logo/:id — Upload team logo ─────────────────────────────────
router.post('/upload-logo/:id', (req, res, next) => {
  logoUploadMiddleware.single('logo')(req, res, (err) => {
    if (err) {
      // Handle multer-specific errors with proper status codes
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'File too large. Maximum size is 3 MB.' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ success: false, error: 'Unexpected file field. Use "logo" as the field name.' });
      }
      return res.status(400).json({ success: false, error: err.message || 'File upload failed.' });
    }
    next();
  });
}, uploadLogo);

// ══════════════════════════════════════════════════════════════════════════════
// v3.0 NEW ROUTES — Additive only, no existing routes changed above.
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /penalty-runs/:id — Award 5-run penalty or custom ───────────────────
router.post(
  '/penalty-runs/:id',
  [
    body('runs').optional().isInt({ min: 1, max: 50 }),
    body('awardedTo').isIn(['batting', 'fielding']),
    body('reason').optional().isString().trim(),
    validate,
  ],
  awardPenaltyRuns
);

// ── POST /overthrow/:id — Record overthrow scenario ──────────────────────────
router.post(
  '/overthrow/:id',
  [
    body('runsBeforeOvertake').optional().isInt({ min: 0 }),
    body('runsAfterOvertake').optional().isInt({ min: 0 }),
    body('isBoundary').optional().isBoolean(),
    body('fromBat').optional().isBoolean(),
    body('deliveryType').optional().isIn(['legal', 'wide', 'noball']),
    validate,
  ],
  recordOverthrow
);

// ── GET /delivery-history/:id — Ball-by-ball log ─────────────────────────────
router.get('/delivery-history/:id', getDeliveryHistory);

// ── PUT /match-format/:id — Update match format / rules ──────────────────────
router.put(
  '/match-format/:id',
  [
    body('matchFormat').optional().isString(),
    body('bowlerMaxOversOverride').optional().isInt({ min: 1 }),
    body('freeHitEnabledOverride').optional().isBoolean(),
    body('maxOversOverride').optional().isInt({ min: 1, max: 200 }),
    validate,
  ],
  updateMatchFormat
);

// ── POST /super-over/:id — Start super over mode ─────────────────────────────
router.post(
  '/super-over/:id',
  [
    body('battingTeam').optional().isString().trim(),
    body('bowlingTeam').optional().isString().trim(),
    validate,
  ],
  startSuperOver
);

// ── POST /declare-innings/:id — Declare innings (Test/multi-day) ──────────────
router.post('/declare-innings/:id', declareInnings);

// ── GET /match-rules/:id — Get current match rules configuration ──────────────
router.get('/match-rules/:id', getMatchRules);

module.exports = router;
