/**
 * KS Live — Match Routes
 *
 * POST   /create-match
 * GET    /matches
 * GET    /match/:id
 * PUT    /update-score/:id
 * PUT    /update-players/:id
 * PUT    /toggle-ticker/:id
 * PUT    /manual-ball-correction/:id
 * GET    /overlay/:matchId          ← public, no auth
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
} = require('../controllers/matchController');
const authMiddleware = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

const checkSubscription = require('../middleware/subscriptionCheck');

// ── Public: OBS overlay endpoint (no auth required) ───────────────────────
router.get('/overlay/:matchId', getOverlay);

// ── All other routes require auth ─────────────────────────────────────────
router.use(authMiddleware);

// ── GET /matches and /match/:id (allowed for viewing, but creation/updates need sub) ──
router.get('/matches', getMatches);
router.get('/match/:id', getMatch);

// ── Protect mutating routes with subscription check ───────────────────────
router.use(checkSubscription);

// ── POST /create-match ────────────────────────────────────────────────────
router.post(
  '/create-match',
  [
    body('battingTeam').optional().isString().trim().notEmpty().withMessage('Batting team name is required.'),
    body('bowlingTeam').optional().isString().trim().notEmpty().withMessage('Bowling team name is required.'),
    body('maxOvers').optional().isInt({ min: 1, max: 50 }).withMessage('Max overs must be 1–50.'),
    body('ballsPerOver').optional().isInt({ min: 4, max: 8 }).withMessage('Balls per over must be 4–8.'),
    body('matchType').optional().isIn(['T20', 'ODI', 'T10', 'Custom', 'Test']).withMessage('Invalid match type.'),
    validate,
  ],
  createMatch
);



// ── DELETE /match/:id ─────────────────────────────────────────────
router.delete('/match/:id', deleteMatch);

// ── PUT /match/:id ──────────────────────────────────────────────────────────
router.put('/match/:id', updateMatch);

// ── PUT /update-score/:id ─────────────────────────────────────────────────
router.put(
  '/update-score/:id',
  [
    param('id').notEmpty().withMessage('Match ID is required.'),
    body('delivery')
      .isIn(['dot', '1', '2', '3', '4', '5', '6', 'wide', 'noball', 'wicket', 'runout', 'lb', 'byes', 'deadball'])
      .withMessage('Invalid delivery type.'),
    body('extraRuns').optional().isInt({ min: 0 }).withMessage('Extra runs must be a non-negative integer.'),
    validate,
  ],
  updateScore
);

// ── PUT /update-players/:id ───────────────────────────────────────────────
router.put('/update-players/:id', updatePlayers);

// ── PUT /toggle-ticker/:id ────────────────────────────────────────────────
router.put(
  '/toggle-ticker/:id',
  [
    body('message').optional().isString().trim(),
    body('visible').optional().isBoolean().withMessage('visible must be a boolean.'),
    body('mode').optional().isIn(['banner', 'ticker', 'alert', 'breaking']).withMessage('Invalid ticker mode.'),
    body('autoRepeat').optional().isBoolean(),
    validate,
  ],
  toggleTicker
);

// ── PUT /manual-ball-correction/:id ──────────────────────────────────────
router.put(
  '/manual-ball-correction/:id',
  [
    body('scoreDelta').optional().isInt().withMessage('scoreDelta must be an integer.'),
    body('wicketsDelta').optional().isInt({ min: -10, max: 10 }).withMessage('wicketsDelta is out of range.'),
    body('ballsDelta').optional().isInt().withMessage('ballsDelta must be an integer.'),
    body('manualBallsValue').optional().isInt({ min: 0 }).withMessage('manualBallsValue must be >= 0.'),
    body('manualBallsOverride').optional().isBoolean(),
    validate,
  ],
  manualBallCorrection
);

module.exports = router;
