import mongoose from 'mongoose';

const leaderSchema = new mongoose.Schema({
  teamName: { type: String, required: true, index: true }, // Faster searches
  leaderName: { type: String, required: true, index: true },
  leaderVillage: { type: String },
  leaderMobileNo: { type: String, index: true }, // Fast login lookup
  password: { type: String },
  iconPlayer: { type: String },
  iconPlayerMobileNo: { type: String },
  teamLogo: { type: String, required: true },
  teamNumber: { type: Number, required: true, unique: true, index: true },
  maxAmount: { type: Number, default: 0 },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
}, {
  timestamps: true,
});

// Pagination function for fetching leaders
leaderSchema.statics.getLeaders = async function (page = 1, pageSize = 10) {
  return this.find()
    .limit(pageSize)
    .skip((page - 1) * pageSize)
    .sort({ teamNumber: 1 })
    .lean(); // Faster performance
};

// Count total leaders
leaderSchema.statics.countLeaders = async function () {
  return this.countDocuments();
};

const Leader = mongoose.model('Leader', leaderSchema);
export default Leader;
