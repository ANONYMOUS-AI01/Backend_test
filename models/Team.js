import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  budget: {
    type: Number,
    required: true,
    default: 1000000
  },
  players: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  }], // ✅ Correct array field

  leader: {  // ✅ Fixed leader field
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Leader'
  },

  remainingBudget: {
    type: Number,
    default: 1000000
  }
}, {
  timestamps: true
});

// ✅ Use ES Module export
const Team = mongoose.model('Team', teamSchema);
export default Team;
