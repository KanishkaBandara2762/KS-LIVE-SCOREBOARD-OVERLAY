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
const controller = require('../controllers/auctionController');

// ── Public / invite routes (no auction membership required) ─────────────────
router.get('/public/:slug', controller.getPublicAuction);
router.post('/join/:token', authMiddleware, controller.joinAuction);

// Everything below requires login.
router.use(authMiddleware);

router.get('/', controller.listAuctions);
router.post('/', controller.createAuction);

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
