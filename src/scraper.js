const axios = require('axios');
const cheerio = require('cheerio');

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

// t.me/s/kanal sahifasidan habarlarni o'qish
async function fetchMessages(username, beforeId = null) {
  const clean = username.replace('@', '');
  let url = `https://t.me/s/${clean}`;
  if (beforeId) url += `?before=${beforeId}`;

  const { data } = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 15000,
  });

  const $ = cheerio.load(data);
  const messages = [];

  $('.tgme_widget_message').each((_, el) => {
    const $el = $(el);

    // Habar ID
    const dataPost = $el.attr('data-post') || '';
    const msgId = parseInt(dataPost.split('/')[1]) || 0;

    // Vaqt
    const datetime = $el.find('time').attr('datetime') || '';
    const date = datetime ? new Date(datetime) : null;

    // Matn
    const text = $el.find('.tgme_widget_message_text').text().trim();

    // Media bor yoq
    const hasMedia = $el.find('.tgme_widget_message_photo, .tgme_widget_message_video, .tgme_widget_message_document').length > 0;

    if (msgId > 0) {
      messages.push({ id: msgId, date, text, hasMedia, username: clean });
    }
  });

  return messages;
}

// So'nggi N kunlik habarlarni to'plash (sahifalar bo'ylab)
async function fetchRecentMessages(username, cutoffMs = TWO_DAYS_MS) {
  const clean = username.replace('@', '');
  const cutoff = new Date(Date.now() - cutoffMs);
  const allMessages = [];
  let beforeId = null;
  let attempts = 0;

  while (attempts < 10) {
    const msgs = await fetchMessages(clean, beforeId);
    if (msgs.length === 0) break;

    // Eng eski habar vaqti
    const oldest = msgs.reduce((min, m) => (!m.date || (min && min < m.date)) ? min : m.date, null);

    // 2 kundan yangi bo'lganlarni olish
    const recent = msgs.filter(m => m.date && m.date >= cutoff);
    allMessages.push(...recent);

    // Agar eng eski habar 2 kundan eski bo'lsa to'xtatish
    if (!oldest || oldest < cutoff) break;

    // Keyingi sahifa uchun eng kichik ID
    const minId = Math.min(...msgs.map(m => m.id));
    beforeId = minId;
    attempts++;

    await new Promise(r => setTimeout(r, 1000));
  }

  // Takrorlanganlarni olib tashlash va tartibga solish
  const unique = [...new Map(allMessages.map(m => [m.id, m])).values()];
  return unique.sort((a, b) => a.id - b.id);
}

// Kanal mavjudligini tekshirish
async function checkChannel(username) {
  try {
    const msgs = await fetchMessages(username);
    return { ok: true, count: msgs.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { fetchMessages, fetchRecentMessages, checkChannel };
