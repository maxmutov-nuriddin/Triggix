require('dotenv').config();

const http = require('http');
const { bot } = require('./src/bot');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('❌ .env da BOT_TOKEN yozilmagan!');
  process.exit(1);
}

// Render uchun minimal HTTP server (port ochish)
http.createServer((_req, res) => {
  res.writeHead(200);
  res.end('OK');
}).listen(PORT, () => {
  console.log(`🌐 HTTP server: port ${PORT}`);
});

const b = bot(BOT_TOKEN);

b.launch()
  .then(() => console.log('✅ Bot ishga tushdi!'))
  .catch(err => {
    console.error('❌ Bot ishlamadi:', err.message);
    process.exit(1);
  });

process.once('SIGINT', () => b.stop('SIGINT'));
process.once('SIGTERM', () => b.stop('SIGTERM'));
