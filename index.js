require('dotenv').config();

const http = require('http');
const { connect } = require('./src/db');
const { bot } = require('./src/bot');
const { getActiveMonitoringUsers } = require('./src/storage');
const monitor = require('./src/monitor');

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

async function main() {
  await connect();

  const b = bot(BOT_TOKEN);

  // 409 Conflict bo'lsa (eski instance hali o'chmagan) — kutib qayta urinish
  let launched = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await b.launch({ dropPendingUpdates: true });
      launched = true;
      break;
    } catch (err) {
      if (err.response && err.response.error_code === 409) {
        console.log(`⏳ 409 Conflict, ${attempt}/5 urinish. 5 soniya kutilmoqda...`);
        await new Promise(r => setTimeout(r, 5000));
      } else {
        throw err;
      }
    }
  }
  if (!launched) throw new Error('Bot 5 ta urinishdan keyin ham ishlamadi (409 Conflict)');
  console.log('✅ Bot ishga tushdi!');

  // Avval yoqilgan monitoringlarni avtomatik tiklash
  const activeUsers = await getActiveMonitoringUsers();
  if (activeUsers.length > 0) {
    console.log(`🔄 ${activeUsers.length} ta foydalanuvchi uchun monitoring tiklanmoqda...`);
    for (const user of activeUsers) {
      monitor.startContinuous(b.telegram, user.userId).catch(err =>
        console.error(`❌ Monitoring tiklanmadi (${user.userId}):`, err.message)
      );
    }
  }

  process.once('SIGINT', () => b.stop('SIGINT'));
  process.once('SIGTERM', () => b.stop('SIGTERM'));
}

main().catch(err => {
  console.error('❌ Bot ishlamadi:', err.message);
  process.exit(1);
});
