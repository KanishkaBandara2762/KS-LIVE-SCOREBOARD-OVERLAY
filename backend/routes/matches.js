/**
 * KS Live — Match Routes v2.0
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
} = require('../controllers/matchController');
const authMiddleware = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
const checkSubscription = require('../middleware/subscriptionCheck');

// ── Public endpoints ──────────────────────────────────────────────────────────
router.get('/overlay/:matchId', getOverlay);
router.get('/public/matches', getPublicMatches);
router.get('/public/match/:idOrSlug', getPublicMatch);

// ── Serve uploaded logos as static ───────────────────────────────────────────
router.use('/uploads', express.static(require('path').join(__dirname, '../uploads')));

// ── All other routes require auth ─────────────────────────────────────────────
router.use(authMiddleware);

router.get('/matches', getMatches);
router.get('/match/:id', getMatch);

// ── Protect mutating routes with subscription check ───────────────────────────
router.use(checkSubscription);

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
router.post('/upload-logo/:id', logoUploadMiddleware.single('logo'), uploadLogo);

module.exports = router;
