import express from 'express';
import Team from '../models/Team.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Create a new team (protected)
router.post('/', auth, async (req, res) => {
  try {
    const existingTeam = await Team.findOne({ name: req.body.name });
    if (existingTeam) {
      return res.status(400).json({ message: 'Team already exists' });
    }
    
    const team = new Team(req.body);
    await team.save();
    res.status(201).json(team);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all teams (public)
router.get('/', async (req, res) => {
  try {
    const teams = await Team.find().populate('players');
    res.json(teams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update team (protected)
router.put('/:id', auth, async (req, res) => {
  try {
    const team = await Team.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    res.json(team);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete team (protected)
router.delete('/:id', auth, async (req, res) => {
  try {
    const team = await Team.findByIdAndDelete(req.params.id);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Make sure this export is present
export default router;
