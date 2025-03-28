import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true }, // Faster search
  dob: { type: Date }, 
  age: { type: Number },
  category: { type: String, enum: ['Batsman', 'Bowler', 'All Rounder'] },
  profilePhoto: { type: String, required: true },
  serialNo: { type: Number, required: true, unique: true, index: true }, // Unique index
  village: { type: String, index: true }, 
  mobileNo: { type: String, index: true },
  password: { type: String },
  battingStyle: { type: String, enum: ['Right-Handed', 'Left-Handed'] },
  bowlingStyle: {
    type: String,
    enum: ['Right-Arm Fast', 'Right-Arm Medium', 'Right-Arm Spin', 'Left-Arm Fast', 'Left-Arm Medium', 'Left-Arm Spin'],
  },
  economicallyWeaker: { type: String, enum: ['Yes', 'No'], default: 'No' },
  soldTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Leader' },
  isSold: { type: Boolean, default: false },
  soldPrice: { type: Number },
  soldAt: { type: Date },
  teamName: { type: String, default: null },
  soldDate: { type: String },
  soldTime: { type: String },
  status: { type: String, default: 'Available', enum: ['Available', 'Sold', 'Unknown'], index: true },
  basePrice: { type: Number, default: 0 },
}, {
  timestamps: true,
});

// Pagination function for fetching players in pages
playerSchema.statics.getPlayers = async function (page = 1, pageSize = 20) {
  return this.find()
    .limit(pageSize)
    .skip((page - 1) * pageSize)
    .sort({ serialNo: 1 })
    .lean(); // Faster performance
};

// Get total player count
playerSchema.statics.countPlayers = async function () {
  return this.countDocuments();
};

const Player = mongoose.model('Player', playerSchema);
export default Player;
