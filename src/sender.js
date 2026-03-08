const axios = require('axios');

let BOT_TOKEN;

function init(token) {
  BOT_TOKEN = token;
}

function apiUrl(method) {
  return `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
}

// Matn yuborish
async function sendMessage(chatId, text, options = {}) {
  try {
    await axios.post(apiUrl('sendMessage'), {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      ...options,
    });
  } catch (err) {
    console.error('sendMessage xato:', err.response?.data?.description || err.message);
  }
}

// Habarni formatlash va yuborish
async function sendFilteredMessage(chatId, channelUsername, msg) {
  const clean = channelUsername.replace('@', '');
  const link = `https://t.me/${clean}/${msg.id}`;
  const dateStr = msg.date
    ? msg.date.toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })
    : '';

  let text = `📢 <b>@${clean}</b>`;
  if (dateStr) text += `\n🕐 ${dateStr}`;
  text += '\n';

  if (msg.text) {
    // Matnni 800 belgiga qisqartirish
    const preview = msg.text.length > 800
      ? msg.text.substring(0, 800) + '...'
      : msg.text;
    text += `\n${preview}`;
  }

  if (msg.hasMedia) {
    text += msg.text ? '\n📎 [Media]' : '\n📎 Media';
  }

  text += `\n\n🔗 <a href="${link}">Kanalda ko'rish</a>`;

  await sendMessage(chatId, text);
}

module.exports = { init, sendMessage, sendFilteredMessage };
