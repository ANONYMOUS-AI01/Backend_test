import express from 'express';
import Player from '../models/Player.js';
import Leader from '../models/Leader.js';
import mongoose from 'mongoose';
import { uploadToFirebase, deleteFromFirebase } from '../utils/firebaseUtils.js'; // ✅ Use helper functions

const playerRoutes = (upload, io) => {
  const router = express.Router();

  // ✅ Create new player (Admin route)
  router.post('/', upload.single('profilePhoto'), async (req, res) => {
    try {
      console.log('Received player data:', req.body);
      const { name, dob, age, category, serialNo, village, mobileNo, economicallyWeaker, basePrice, battingStyle, bowlingStyle, password } = req.body;

      if (!name) {
        return res.status(400).json({ message: 'Name is required' });
      }

      // ✅ Upload profile photo to Firebase
      let profilePhotoUrl = null;
      if (req.file) {
        profilePhotoUrl = await uploadToFirebase(req.file, 'players');
      }

      // ✅ Ensure unique `serialNo`
      let finalSerialNo;
      if (serialNo) {
        finalSerialNo = parseInt(serialNo);
      } else {
        const lastPlayer = await Player.findOne().sort({ serialNo: -1 }).lean();
        finalSerialNo = lastPlayer ? lastPlayer.serialNo + 1 : 1;
      }

      const player = new Player({
        name,
        dob: dob ? new Date(dob) : undefined,
        age: age ? parseInt(age) : undefined,
        category: category || undefined,
        serialNo: finalSerialNo,
        village: village || undefined,
        mobileNo: mobileNo || undefined,
        economicallyWeaker: economicallyWeaker || 'No',
        basePrice: parseFloat(basePrice) || 0,
        profilePhoto: profilePhotoUrl, // ✅ Save Firebase URL
        battingStyle: battingStyle || undefined,
        bowlingStyle: bowlingStyle || undefined,
        password,
        status: 'Available',
      });

      await player.save();
      console.log('✅ Saved player:', player);
      res.status(201).json(player);
    } catch (error) {
      console.error('❌ Error creating player:', error);
      res.status(400).json({ error: error.message, details: error.errors || 'Unknown error' });
    }
  });

  // ✅ Public player registration route
  router.post('/public', upload.single('profilePhoto'), async (req, res) => {
    try {
      console.log('Received public player data:', req.body);
      const { name, dob, village, mobileNo, password, category, battingStyle, bowlingStyle, economicallyWeaker } = req.body;

      if (!name || !village || !password) {
        return res.status(400).json({ message: 'Name, Village, and Password are required' });
      }

      // ✅ Calculate age from DOB
      const birthDate = dob ? new Date(dob) : null;
      let age;
      if (birthDate) {
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
      }

      // ✅ Upload profile photo
      let profilePhotoUrl = null;
      if (req.file) {
        profilePhotoUrl = await uploadToFirebase(req.file, 'players');
      }

      const player = new Player({
        name,
        dob: birthDate,
        age,
        category: category || undefined,
        serialNo: (await Player.countDocuments()) + 1,
        village,
        mobileNo: mobileNo || undefined,
        password,
        battingStyle: battingStyle || undefined,
        bowlingStyle: bowlingStyle || undefined,
        economicallyWeaker: economicallyWeaker || 'No',
        profilePhoto: profilePhotoUrl,
        status: 'Available',
      });

      await player.save();
      console.log('✅ Saved public player:', player);

      io.emit('newPlayer', player.toObject());

      res.status(201).json({ message: 'Player registered successfully', player });
    } catch (error) {
      console.error('❌ Error creating public player:', error);
      res.status(400).json({ error: error.message, details: error.errors || 'Unknown error' });
    }
  });

  // ✅ Update player (Admin route)
  router.put('/:id', upload.single('profilePhoto'), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, dob, age, category, serialNo, village, mobileNo, economicallyWeaker, battingStyle, bowlingStyle, password } = req.body;

      const player = await Player.findById(id);
      if (!player) {
        return res.status(404).json({ message: 'Player not found' });
      }

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (dob !== undefined) updateData.dob = dob ? new Date(dob) : undefined;
      if (age !== undefined) updateData.age = age ? parseInt(age) : undefined;
      if (category !== undefined) updateData.category = category;
      if (serialNo !== undefined) updateData.serialNo = serialNo ? parseInt(serialNo) : undefined;
      if (village !== undefined) updateData.village = village;
      if (mobileNo !== undefined) updateData.mobileNo = mobileNo;
      if (economicallyWeaker !== undefined) updateData.economicallyWeaker = economicallyWeaker;
      if (battingStyle !== undefined) updateData.battingStyle = battingStyle;
      if (bowlingStyle !== undefined) updateData.bowlingStyle = bowlingStyle;
      if (password !== undefined) updateData.password = password;

      // ✅ Handle profile photo update
      if (req.file) {
        if (player.profilePhoto) {
          await deleteFromFirebase(player.profilePhoto);
        }
        updateData.profilePhoto = await uploadToFirebase(req.file, 'players');
      }

      const updatedPlayer = await Player.findByIdAndUpdate(id, updateData, { new: true }).populate('soldTo');
      res.json(updatedPlayer);
    } catch (error) {
      console.error('❌ Error updating player:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ✅ Delete player
  router.delete('/:id', async (req, res) => {
    try {
      const player = await Player.findById(req.params.id);
      if (!player) {
        return res.status(404).json({ message: 'Player not found' });
      }

      if (player.profilePhoto) {
        await deleteFromFirebase(player.profilePhoto);
      }

      await Player.findByIdAndDelete(req.params.id);
      res.json({ message: 'Player deleted successfully' });
    } catch (error) {
      console.error('❌ Delete error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  return router;
};

export default playerRoutes;
