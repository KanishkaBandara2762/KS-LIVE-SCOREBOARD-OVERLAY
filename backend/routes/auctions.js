/**
 * KS Live — Auction routes
 *
 * Mounted at /api/auctions BEFORE the generic /api router in server.js.
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  loadAuction,
  requireAuctionOwner,
  requireAuctionAccess,
} = require('../middleware/auctionAccess');
const requireMatchCredit = require('../middleware/creditGate');
const controller = require('../controllers/auctionController');
const registration = require('../controllers/auctionRegistrationController');

// ── Public / invite routes (no auction membership required) ─────────────────
router.get('/public/:slug', controller.getPublicAuction);
router.post('/join/:token', authMiddleware, controller.joinAuction);
// Player registration form (public link; photo upload allowed).
router.get('/register/:token', registration.getPlayerRegistration);
router.post('/register/:token', registration.handlePlayerPhoto, registration.submitPlayerRequest);

// Everything below requires login.
router.use(authMiddleware);

// Captain link: any logged-in user holding the link can request a team.
router.get('/captain/:token', registration.getCaptainTeams);
router.post('/captain/:token/request', registration.requestCaptainTeam);

router.get('/', controller.listAuctions);
// Creating an auction costs 1 credit (same pool as matches and tournaments).
router.post('/', requireMatchCredit, controller.createAuction);

router.get('/:id', loadAuction, requireAuctionAccess, controller.getAuction);
router.patch('/:id', loadAuction, requireAuctionOwner, controller.updateAuction);
router.delete('/:id', loadAuction, requireAuctionOwner, controller.deleteAuction);

// Lifecycle
router.post('/:id/start', loadAuction, requireAuctionOwner, controller.startAuction);
router.post('/:id/pause', loadAuction, requireAuctionOwner, controller.pauseAuction);
router.post('/:id/resume', loadAuction, requireAuctionOwner, controller.resumeAuction);
router.post('/:id/complete', loadAuction, requireAuctionOwner, controller.completeAuction);

// Teams
router.post('/:id/teams', loadAuction, requireAuctionOwner, controller.addTeam);
router.patch('/:id/teams/:teamId', loadAuction, requireAuctionOwner, controller.updateTeam);
router.delete('/:id/teams/:teamId', loadAuction, requireAuctionOwner, controller.deleteTeam);
router.post('/:id/teams/:teamId/invite', loadAuction, requireAuctionOwner, controller.createInvite);
router.post('/:id/teams/:teamId/captain/approve', loadAuction, requireAuctionOwner, registration.approveCaptain);
router.post('/:id/teams/:teamId/captain/reject', loadAuction, requireAuctionOwner, registration.rejectCaptain);

// Links (main is the public display; player and captain links are secret tokens)
router.get('/:id/links', loadAuction, requireAuctionOwner, registration.getLinks);
router.post('/:id/links/regenerate', loadAuction, requireAuctionOwner, registration.regenerateLink);

// Player registration requests
router.get('/:id/player-requests', loadAuction, requireAuctionOwner, registration.listPlayerRequests);
router.post('/:id/player-requests/:reqId/approve', loadAuction, requireAuctionOwner, registration.approvePlayerRequest);
router.post('/:id/player-requests/:reqId/reject', loadAuction, requireAuctionOwner, registration.rejectPlayerRequest);

// Players
router.post('/:id/players', loadAuction, requireAuctionOwner, controller.addPlayer);
router.post('/:id/players/import', loadAuction, requireAuctionOwner, controller.importPlayers);
router.patch('/:id/players/:playerId', loadAuction, requireAuctionOwner, controller.updatePlayer);
router.delete('/:id/players/:playerId', loadAuction, requireAuctionOwner, controller.deletePlayer);
router.post('/:id/players/reorder', loadAuction, requireAuctionOwner, controller.reorderPlayers);

// Lots
router.post('/:id/lots/next', loadAuction, requireAuctionOwner, controller.openNextLot);
router.post('/:id/lots/open', loadAuction, requireAuctionOwner, controller.openLot);
router.post('/:id/lots/:playerId/close', loadAuction, requireAuctionOwner, controller.closeLot);
router.post('/:id/lots/:playerId/withdraw', loadAuction, requireAuctionOwner, controller.withdrawLot);
router.post('/:id/players/:playerId/reauction', loadAuction, requireAuctionOwner, controller.reauctionPlayer);

// Bids and results
router.post('/:id/bids', loadAuction, requireAuctionAccess, controller.placeBid);
router.get('/:id/bids', loadAuction, requireAuctionAccess, controller.getBids);
router.get('/:id/results', loadAuction, requireAuctionAccess, controller.getResults);
router.get('/:id/teams/:teamId/squad', loadAuction, requireAuctionAccess, controller.getTeamSquad);

module.exports = router;
