import express from 'express';
import SoldPlayer from '../models/SoldPlayer.js';
import Player from '../models/Player.js';
import Leader from '../models/Leader.js';

const router = express.Router();

// Add sold player
router.post('/', async (req, res) => {
  try {
    const { player, team, leader, saleDetails } = req.body;

    if (!player || !team || !leader || !saleDetails || !saleDetails.amount) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // ✅ Check if player is already sold
    const existingSale = await SoldPlayer.findOne({ player: player._id });
    if (existingSale) {
      return res.status(400).json({ message: 'Player is already sold' });
    }

    // Create sold player record
    const soldPlayer = new SoldPlayer({
      player: player._id,
      team: team._id,
      leader: leader._id,
      saleDetails
    });
    await soldPlayer.save();

    // Update player status
    await Player.findByIdAndUpdate(player._id, {
      $set: {
        isSold: true,
        soldTo: team._id,
        soldAmount: saleDetails.amount,
        soldToLeader: leader.name,
        teamName: team.name
      }
    });

    // Update team's player list
    await Leader.findByIdAndUpdate(team._id, {
      $push: {
        players: {
          playerId: player._id,
          playerName: player.name,
          soldAmount: saleDetails.amount,
          category: player.category
        }
      }
    });

    res.status(201).json(soldPlayer);
  } catch (error) {
    console.error('Error in Sold Player Route:', {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});  // ✅ This closing brace was missing

// ✅ GET route should be **outside** the POST route!
router.get('/', async (req, res) => {
  try {
    const soldPlayers = await SoldPlayer.find()
      .populate('player', 'name category profilePhoto')
      .populate('team', 'teamName')
      .populate('leader', 'leaderName')
      .lean();  // ✅ Faster performance by returning plain JavaScript objects

    res.json(soldPlayers);
  } catch (error) {
    console.error('Error fetching sold players:', {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

export default router;
