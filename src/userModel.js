const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId:    { type: Number, required: true, unique: true },
  firstName: { type: String, default: '' },
  lastName:  { type: String, default: '' },
  username:  { type: String, default: '' },
  joinedAt:  { type: Date, default: Date.now },
  channels:  [{ username: String, title: String }],
  sections:  [{ name: String, keywords: [String] }],
  settings: {
    pollInterval: { type: Number, default: 60 },
    historyDays:  { type: Number, default: 2 },
    compact:      { type: Boolean, default: false },
  },
});

module.exports = mongoose.model('User', userSchema);