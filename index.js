require('dotenv').config();

const { bot } = require('./src/bot');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ .env da BOT_TOKEN yozilmagan!');
  process.exit(1);
}

const b = bot(BOT_TOKEN);

b.launch()
  .then(() => console.log('✅ Bot ishga tushdi!'))
  .catch(err => {
    console.error('❌ Bot ishlamadi:', err.message);
    process.exit(1);
  });

process.once('SIGINT', () => b.stop('SIGINT'));
process.once('SIGTERM', () => b.stop('SIGTERM'));
