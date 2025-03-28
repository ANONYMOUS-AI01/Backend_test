import mongoose from 'mongoose';

const soldPlayerSchema = new mongoose.Schema({
  player: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    basePrice: { type: Number, required: true },
    profilePhoto: String
  },
  team: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Leader', required: true },
    name: { type: String, required: true },
    logo: String
  },
  leader: {
    name: { type: String, required: true }
  },
  saleDetails: {
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now }
  }
});

export default mongoose.model('SoldPlayer', soldPlayerSchema);