const storage = require('./storage');
const scraper = require('./scraper');

// userId → { timer, lastSeenId }
const userMonitors = new Map();

function isRunning(userId) {
  const m = userMonitors.get(userId);
  return !!(m && m.timer);
}

function matchesSections(text, sections) {
  if (sections.length === 0) return true;
  const lower = (text || '').toLowerCase();
  return sections.some(s =>
    s.keywords.length === 0 || s.keywords.every(kw => lower.includes(kw))
  );
}

function matchedSection(text, sections) {
  const lower = (text || '').toLowerCase();
  return sections.find(s =>
    s.keywords.length === 0 || s.keywords.every(kw => lower.includes(kw))
  ) || null;
}

function getLastSeen(userId) {
  if (!userMonitors.has(userId)) userMonitors.set(userId, { timer: null, lastSeenId: {} });
  return userMonitors.get(userId).lastSeenId;
}

async function sendMsg(telegram, userId, msg, section, compact) {
  const clean = msg.username.replace('@', '');
  const link = `https://t.me/${clean}/${msg.id}`;

  let text;
  if (compact) {
    const preview = (msg.text || '').substring(0, 300);
    text = `📢 @${clean}`;
    if (section) text += ` · ${section.name}`;
    if (preview) text += `\n${preview}${msg.text && msg.text.length > 300 ? '...' : ''}`;
    text += `\n🔗 <a href="${link}">Ko'rish</a>`;
  } else {
    const dateStr = msg.date
      ? msg.date.toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })
      : '';
    text = `📢 <b>@${clean}</b>`;
    if (dateStr) text += `   🕐 ${dateStr}`;
    if (section) text += `\n📂 <b>${section.name}</b>`;
    if (msg.text) {
      const preview = msg.text.length > 900 ? msg.text.substring(0, 900) + '...' : msg.text;
      text += `\n\n${preview}`;
    }
    if (msg.hasMedia && !msg.text) text += '\n\n📎 Media';
    text += `\n\n🔗 <a href="${link}">Kanalda ko'rish →</a>`;
  }

  try {
    await telegram.sendMessage(userId, text, {
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    });
  } catch (err) {
    console.error(`sendMsg error (${userId}):`, err.message);
  }
}

async function fetchHistory(telegram, userId) {
  const channels = await storage.getChannels(userId);
  const sections = await storage.getSections(userId);
  const settings = await storage.getSettings(userId);
  const lastSeenId = getLastSeen(userId);
  const cutoffMs = settings.historyDays * 24 * 60 * 60 * 1000;

  let totalSent = 0;

  for (const channel of channels) {
    try {
      const messages = await scraper.fetchRecentMessages(channel.username, cutoffMs);

      if (messages.length > 0)
        lastSeenId[channel.username] = Math.max(...messages.map(m => m.id));
      else {
        const latest = await scraper.fetchMessages(channel.username);
        if (latest.length > 0)
          lastSeenId[channel.username] = Math.max(...latest.map(m => m.id));
      }

      const filtered = messages.filter(m => matchesSections(m.text, sections));

      for (const msg of filtered) {
        const sec = matchedSection(msg.text, sections);
        await sendMsg(telegram, userId, msg, sec, settings.compact);
        await new Promise(r => setTimeout(r, 600));
        totalSent++;
      }
    } catch (err) {
      console.error(`History error ${channel.username}:`, err.message);
    }
  }

  const days = settings.historyDays;
  if (totalSent > 0) {
    await telegram.sendMessage(userId,
      `✅ So'nggi <b>${days} kun</b>da <b>${totalSent} ta</b> mos habar topildi.`,
      { parse_mode: 'HTML' }
    );
  } else {
    await telegram.sendMessage(userId,
      `ℹ️ So'nggi <b>${days} kun</b>da mos habar topilmadi.\n\nYangi habarlar kuzatilmoqda...`,
      { parse_mode: 'HTML' }
    );
  }
}

async function pollNewMessages(telegram, userId) {
  const channels = await storage.getChannels(userId);
  const sections = await storage.getSections(userId);
  const settings = await storage.getSettings(userId);
  const lastSeenId = getLastSeen(userId);

  for (const channel of channels) {
    try {
      const messages = await scraper.fetchMessages(channel.username);
      if (!messages.length) continue;

      const maxId = Math.max(...messages.map(m => m.id));
      const prevId = lastSeenId[channel.username] || 0;
      const newMsgs = messages.filter(m => m.id > prevId);
      if (!newMsgs.length) continue;

      lastSeenId[channel.username] = maxId;

      const filtered = newMsgs
        .filter(m => matchesSections(m.text, sections))
        .sort((a, b) => a.id - b.id);

      for (const msg of filtered) {
        const sec = matchedSection(msg.text, sections);
        await sendMsg(telegram, userId, msg, sec, settings.compact);
        await new Promise(r => setTimeout(r, 600));
      }
    } catch (err) {
      console.error(`Poll error (${channel.username}, ${userId}):`, err.message);
    }
  }
}

async function startOnce(telegram, userId) {
  await fetchHistory(telegram, userId);
  await telegram.sendMessage(userId, `✅ <b>Bir martalik monitoring tugadi.</b>`, { parse_mode: 'HTML' });
}

async function startContinuous(telegram, userId) {
  if (isRunning(userId)) return;

  const entry = { timer: null, lastSeenId: {} };
  userMonitors.set(userId, entry);

  await fetchHistory(telegram, userId);

  const settings = await storage.getSettings(userId);
  const interval = (settings.pollInterval || 60) * 1000;

  entry.timer = setInterval(async () => {
    const channels = await storage.getChannels(userId);
    if (channels.length > 0)
      await pollNewMessages(telegram, userId).catch(console.error);
  }, interval);
}

function stopContinuous(userId) {
  const m = userMonitors.get(userId);
  if (m && m.timer) {
    clearInterval(m.timer);
    m.timer = null;
    return true;
  }
  return false;
}

async function restartInterval(telegram, userId) {
  if (!isRunning(userId)) return;
  stopContinuous(userId);
  await startContinuous(telegram, userId);
}

async function triggerPoll(telegram, userId) {
  if (!isRunning(userId)) return;
  await pollNewMessages(telegram, userId).catch(console.error);
}

module.exports = { startOnce, startContinuous, stopContinuous, restartInterval, isRunning, triggerPoll };
