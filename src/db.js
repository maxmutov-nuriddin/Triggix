const mongoose = require('mongoose');

async function connect() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ .env da MONGO_URI yozilmagan!');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('✅ MongoDB ga ulandi');
}

module.exports = { connect };
