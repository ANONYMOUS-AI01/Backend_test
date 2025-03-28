import express from 'express';
import Leader from '../models/Leader.js';
import { uploadToFirebase, deleteFromFirebase } from '../utils/firebaseUtils.js';

const leaderRoutes = (upload, io) => {
  const router = express.Router();

  // Create Leader (Admin route)
  router.post('/', upload.single('teamLogo'), async (req, res) => {
    try {
      console.log(`📢 New leader registered: ${req.body.leaderName}, Team: ${req.body.teamName}`);

      const { leaderName, teamName, leaderVillage, leaderMobileNo, iconPlayer, iconPlayerMobileNo, password } = req.body;
      let teamLogoUrl = null;
      if (req.file) {
        teamLogoUrl = await uploadToFirebase(req.file, 'leaders'); // ✅ Specify folder
      }

      if (!leaderName || !teamName) {
        return res.status(400).json({ message: 'Leader Name and Team Name are required' });
      }

      const existingLeader = await Leader.findOne({ leaderName });
      if (existingLeader) {
        return res.status(400).json({
          message: 'This leader already has a team! One leader cannot have multiple teams.',
        });
      }

      const leader = new Leader({
        leaderName,
        teamName,
        leaderVillage: leaderVillage || undefined,
        leaderMobileNo: leaderMobileNo || undefined,
        iconPlayer: iconPlayer || undefined,
        iconPlayerMobileNo: iconPlayerMobileNo || undefined,
        password: password || undefined, // Optional for admin
        teamLogo: teamLogoUrl,
        teamNumber: (await Leader.countDocuments()) + 1,
      });

      await leader.save();
      res.status(201).json(leader);
    } catch (err) {
      console.error('Full Error:', err);
      res.status(500).json({ error: err.message, stack: err.stack });
    }
  });

  // Public leader registration route
  router.post('/public', upload.single('teamLogo'), async (req, res) => {
    try {
      console.log(`📢 New leader registered: ${req.body.leaderName}, Team: ${req.body.teamName}`);
      const {
        teamName,
        leaderName,
        village,
        leaderMobileNo,
        password,
        iconPlayerName,
        iconPlayerMobileNo,
      } = req.body;

      // Custom validation for public route
      if (!leaderName || !teamName) {
        return res.status(400).json({ message: 'Leader Name and Team Name are required' });
      }
      if (!village) {
        return res.status(400).json({ message: 'Village is required for public registration' });
      }
      if (!password) {
        return res.status(400).json({ message: 'Password is required for public registration' });
      }

      const existingLeader = await Leader.findOne({
        $or: [
          { leaderMobileNo },
          { teamName: { $regex: new RegExp(`^${teamName}$`, 'i') } }, // ✅ Case-insensitive match
        ],
      });
      
      if (existingLeader) {
        return res.status(400).json({ message: 'A leader with this mobile number or team name already exists' });
      }

      let teamLogoUrl = null;
      if (req.file) {
        teamLogoUrl = await uploadToFirebase(req.file, 'leaders'); // ✅ Specify folder
      }

      const leader = new Leader({
        teamName: teamName || '',
        leaderName: leaderName || '',
        leaderVillage: village,
        leaderMobileNo: leaderMobileNo || undefined,
        password, // Required for public
        iconPlayer: iconPlayerName || undefined,
        iconPlayerMobileNo: iconPlayerMobileNo || undefined,
        teamLogo: teamLogoUrl,
        teamNumber: (await Leader.countDocuments()) + 1,
      });

      await leader.save();
      console.log('Saved public leader:', leader);

      // Emit Socket.IO event
      io.emit('newLeader', leader.toObject());

      res.status(201).json({ message: 'Leader registered successfully', leader });
    } catch (error) {
      console.error('Error creating public leader:', error);
      res.status(400).json({ error: error.message, details: error.errors || 'Unknown error' });
    }
  });

  // Leader login
  router.post('/login', async (req, res) => {
    try {
      const { leaderMobileNo, password, teamName, leaderName } = req.body;

      let leader;
      if (leaderMobileNo && password) {
        leader = await Leader.findOne({ leaderMobileNo });
        if (!leader || leader.password !== password) { // Compare plain text passwords directly
          return res.status(401).json({ message: 'Invalid credentials' });
        }
      } else if (teamName && leaderName) {
        leader = await Leader.findOne({ teamName, leaderName });
        if (!leader) {
          return res.status(401).json({ message: 'Invalid credentials' });
        }
      } else {
        return res.status(400).json({ message: 'Provide either leaderMobileNo/password or teamName/leaderName' });
      }

      res.json({ message: 'Login successful', leader: leader.toObject() });
    } catch (error) {
      console.error('Error logging in leader:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Set max amount for all leaders
  router.put('/set-max-amount', async (req, res) => {
    try {
      const { maxAmount } = req.body;
      if (!maxAmount || maxAmount < 0 || isNaN(maxAmount)) {
        return res.status(400).json({ message: 'Invalid max amount. Must be a positive number.' });
      }
      await Leader.updateMany({}, { $set: { maxAmount: parseFloat(maxAmount) } });
      res.status(200).json({ message: `Max amount set to ₹${maxAmount} for all teams` });
    } catch (error) {
      console.error('Error setting max amount:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Get all leaders
  router.get('/', async (req, res) => {
    try {
      const leaders = await Leader.find()
        .populate({
          path: 'players',
          select: 'name category',
        })
        .sort({ teamNumber: 1 }); // Sort by teamNumber for consistency
      console.log('Sending leaders:', leaders);
      res.json(leaders);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get single leader by ID
  router.get('/:id', async (req, res) => {
    try {
      const leader = await Leader.findById(req.params.id).populate({
        path: 'players',
        select: 'name category profilePhoto dob age soldPrice soldAt createdAt status',
      });
      if (!leader) {
        return res.status(404).json({ message: 'Leader not found' });
      }
      res.json(leader);
    } catch (err) {
      console.error('Error fetching leader:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Update leader (including adding/removing players)
  router.put('/:id', upload.single('teamLogo'), async (req, res) => {
    try {
      const { id } = req.params;
      const { leaderName, teamName, leaderVillage, leaderMobileNo, iconPlayer, iconPlayerMobileNo, password } = req.body;

      const leader = await Leader.findById(id);
      if (!leader) {
        return res.status(404).json({ message: 'Leader not found' });
      }

      const updateData = {};
      if (leaderName !== undefined) updateData.leaderName = leaderName;
      if (teamName !== undefined) updateData.teamName = teamName;
      if (leaderVillage !== undefined) updateData.leaderVillage = leaderVillage;
      if (leaderMobileNo !== undefined) updateData.leaderMobileNo = leaderMobileNo;
      if (iconPlayer !== undefined) updateData.iconPlayer = iconPlayer;
      if (iconPlayerMobileNo !== undefined) updateData.iconPlayerMobileNo = iconPlayerMobileNo;
      if (password !== undefined) updateData.password = password; // Allow updating password if provided

      if (req.file) {
        if (leader.teamLogo) {
          await deleteFromFirebase(leader.teamLogo);
        }
        updateData.teamLogo = await uploadToFirebase(req.file, 'leaders'); // ✅ Fix applied
      }


      const updatedLeader = await Leader.findByIdAndUpdate(id, updateData, { new: true }).populate({
        path: 'players',
        select: 'name category profilePhoto',
      });

      res.json(updatedLeader);
    } catch (error) {
      console.error('Error updating leader:', error);
      res.status(500).json({ message: error.message });
    }
  });


  // Delete leader
  router.delete('/:id', async (req, res) => {
    try {
      const leader = await Leader.findById(req.params.id);
      if (!leader) {
        return res.status(404).json({ message: 'Leader not found' });
      }

      if (leader.teamLogo && typeof leader.teamLogo === 'string') {
        await deleteFromFirebase(leader.teamLogo);
      }


      await Leader.findByIdAndDelete(req.params.id);
      res.json({ message: 'Leader deleted successfully' });
    } catch (err) {
      console.error('Error deleting leader:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};

export default leaderRoutes;