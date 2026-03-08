const { Telegraf, Markup } = require('telegraf');
const storage = require('./storage');
const scraper = require('./scraper');
const monitor = require('./monitor');

// userId → { action, data }
const state = new Map();

function setState(userId, action, data = {}) { state.set(userId, { action, data }); }
function getState(userId) { return state.get(userId) || null; }
function clearState(userId) { state.delete(userId); }

// ─── Status satri ────────────────────────────
async function statusLine(userId) {
  const ch = (await storage.getChannels(userId)).length;
  const sec = (await storage.getSections(userId)).length;
  const running = monitor.isRunning(userId);
  const icon = running ? '🟢' : '⚪';
  return `${icon} ${ch} kanal · ${sec} bo'lim · monitoring ${running ? 'yoqiq' : 'o\'chiq'}`;
}

// ─── Foydalanuvchi ma'lumotlari satri ─────────
async function userInfoLine(userId) {
  const profile = await storage.getUserProfile(userId);
  if (!profile) return '';
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const uname = profile.username ? ` (@${profile.username})` : '';
  const date = profile.joinedAt
    ? profile.joinedAt.toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent' })
    : '';
  return `👤 <b>${name}</b>${uname}  |  ID: <code>${userId}</code>  |  📅 ${date}`;
}

function bot(token) {
  const b = new Telegraf(token);

  // ════════════════════════════════════════════
  // START
  // ════════════════════════════════════════════
  b.start(async (ctx) => {
    clearState(ctx.from.id);

    // Foydalanuvchi ma'lumotlarini MongoDB ga saqlash
    await storage.saveUserProfile(ctx.from.id, {
      firstName: ctx.from.first_name || '',
      lastName:  ctx.from.last_name  || '',
      username:  ctx.from.username   || '',
    });

    const info = await userInfoLine(ctx.from.id);
    const status = await statusLine(ctx.from.id);

    await ctx.reply(
      `👋 Salom, <b>${ctx.from.first_name}</b>!\n\n` +
      `${info}\n\n` +
      `Bu bot Telegram kanallardan habarlarni bo'limlar bo'yicha filtrlaydi.\n\n` +
      `<b>Qanday ishlaydi:</b>\n` +
      `1️⃣  <b>Kanal qo'shing</b> — qaysi kanallarni kuzatish kerak\n` +
      `2️⃣  <b>Bo'lim yarating</b> — filtr nomi va kalit so'zlar\n` +
      `3️⃣  <b>Monitoring boshlang</b> — mos habarlar sizga keladi\n\n` +
      `💡 Biror bo'limning <i>barcha</i> kalit so'zlari habardan topilsa — u habar sizga yuboriladi.\n\n` +
      `<i>${status}</i>\n\nQuyidagi menyudan boshlang 👇`,
      { parse_mode: 'HTML', ...mainMenu() }
    );
  });

  // ════════════════════════════════════════════
  // ASOSIY MENYU
  // ════════════════════════════════════════════
  b.hears('📡 Kanallar', async (ctx) => {
    clearState(ctx.from.id);
    const channels = await storage.getChannels(ctx.from.id);
    const info = await userInfoLine(ctx.from.id);
    const status = await statusLine(ctx.from.id);
    let text = `${info}\n\n📡 <b>Kanallar</b>\n<i>${status}</i>\n\n`;
    if (channels.length === 0) {
      text += `Hali hech qanday kanal qo'shilmagan.\nQuyidagi tugma orqali birinchi kanalingizni qo'shing.`;
    } else {
      text += channels.map((c, i) => `${i + 1}. ${c.username}`).join('\n');
    }
    return ctx.reply(text, { parse_mode: 'HTML', ...channelMenu() });
  });

  b.hears('📂 Bo\'limlar', async (ctx) => {
    clearState(ctx.from.id);
    return renderSectionList(ctx);
  });

  b.hears('▶️ Monitoring', async (ctx) => {
    clearState(ctx.from.id);
    const userId = ctx.from.id;
    const channels = await storage.getChannels(userId);
    if (channels.length === 0) {
      return ctx.reply(
        `❌ Avval kanal qo'shing!\n\n📡 Kanallar menyusiga o'ting.`,
        channelMenu()
      );
    }
    const sections = await storage.getSections(userId);
    const settings = await storage.getSettings(userId);
    const running = monitor.isRunning(userId);
    const info = await userInfoLine(userId);
    const status = await statusLine(userId);

    let text = `${info}\n\n▶️ <b>Monitoring</b>\n<i>${status}</i>\n\n`;
    text += `📡 <b>Kanallar:</b> ${channels.map(c => c.username).join(', ')}\n`;
    text += `📂 <b>Bo'limlar:</b> ${sections.length > 0 ? sections.map(s => s.name).join(', ') : 'yo\'q (hammasi keladi)'}\n`;
    text += `⏱ <b>Yangilanish:</b> har ${settings.pollInterval}s\n`;
    text += `📅 <b>Tarix:</b> ${settings.historyDays} kun\n\n`;
    if (running) {
      text += `🟢 Davomiy monitoring <b>ishlayapti</b>.`;
      return ctx.reply(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⏹ To\'xtatish', 'mon:stop')],
          [Markup.button.callback('⚡ Bir martalik yuklash', 'mon:once')],
        ]),
      });
    }
    text += `Monitoring turini tanlang:`;
    return ctx.reply(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⚡ Bir martalik', 'mon:once')],
        [Markup.button.callback('🔄 Davomiy (avtomatik)', 'mon:continuous')],
      ]),
    });
  });

  b.hears('⚙️ Sozlamalar', async (ctx) => {
    clearState(ctx.from.id);
    return renderSettings(ctx);
  });

  b.hears('🔙 Orqaga', async (ctx) => {
    clearState(ctx.from.id);
    const info = await userInfoLine(ctx.from.id);
    const status = await statusLine(ctx.from.id);
    return ctx.reply(`${info}\n\n<i>${status}</i>\n\nAsosiy menyu:`, { parse_mode: 'HTML', ...mainMenu() });
  });

  // ════════════════════════════════════════════
  // KANAL MENYUSI
  // ════════════════════════════════════════════
  b.hears('➕ Kanal qo\'shish', (ctx) => {
    setState(ctx.from.id, 'add_channel');
    return ctx.reply(
      `📥 <b>Kanal qo'shish</b>\n\n` +
      `Kanal username yuboring:\n<code>@kanal_nomi</code>  yoki  <code>kanal_nomi</code>\n\n` +
      `⚠️ Kanal <b>ochiq (public)</b> bo'lishi kerak.`,
      { parse_mode: 'HTML', ...backMenu() }
    );
  });

  b.hears('❌ Kanal o\'chirish', async (ctx) => {
    const channels = await storage.getChannels(ctx.from.id);
    if (channels.length === 0) return ctx.reply('Hali kanal qo\'shilmagan.');
    return ctx.reply(
      'O\'chirish uchun kanalni tanlang:',
      Markup.inlineKeyboard(channels.map(c =>
        [Markup.button.callback(`🗑 ${c.username}`, `del_ch:${c.username}`)]
      ))
    );
  });

  // ════════════════════════════════════════════
  // BO'LIM MENYUSI
  // ════════════════════════════════════════════
  b.hears('➕ Bo\'lim qo\'shish', (ctx) => {
    setState(ctx.from.id, 'sec_name');
    return ctx.reply(
      `📂 <b>Yangi bo'lim</b>\n\n` +
      `<b>1-qadam:</b> Bo'limga nom bering:\n\n` +
      `Misol: <code>3 xona ijaraga</code>`,
      { parse_mode: 'HTML', ...backMenu() }
    );
  });

  b.hears('❌ Bo\'lim o\'chirish', async (ctx) => {
    const sections = await storage.getSections(ctx.from.id);
    if (sections.length === 0) return ctx.reply('Hali bo\'lim yo\'q.');
    return ctx.reply(
      'O\'chirish uchun bo\'limni tanlang:',
      Markup.inlineKeyboard(sections.map(s =>
        [Markup.button.callback(`🗑 ${s.name}`, `del_sec:${s.name}`)]
      ))
    );
  });

  // ════════════════════════════════════════════
  // SOZLAMALAR MENYUSI
  // ════════════════════════════════════════════
  b.hears(/^⏱ Yangilanish oralig'i/, async (ctx) => {
    setState(ctx.from.id, 'set_poll');
    const s = await storage.getSettings(ctx.from.id);
    return ctx.reply(
      `⏱ <b>Yangilanish oralig'i</b>\n\nJoriy qiymat: <b>${s.pollInterval} soniya</b>\n\n` +
      `Yangi qiymat yuboring (soniyada, min: 30):\n\n` +
      `Tavsiya etilganlar:\n` +
      `<code>30</code>  — 30 soniya\n` +
      `<code>60</code>  — 1 daqiqa\n` +
      `<code>300</code> — 5 daqiqa`,
      { parse_mode: 'HTML', ...backMenu() }
    );
  });

  b.hears(/^📅 Tarix chuqurligi/, async (ctx) => {
    setState(ctx.from.id, 'set_history');
    const s = await storage.getSettings(ctx.from.id);
    return ctx.reply(
      `📅 <b>Tarix chuqurligi</b>\n\nJoriy qiymat: <b>${s.historyDays} kun</b>\n\n` +
      `Monitoring boshlanganida necha kunlik habarlarni yuklash kerak?\n\n` +
      `Sonini yuboring (1–14):`,
      { parse_mode: 'HTML', ...backMenu() }
    );
  });

  b.hears(/^📋 Xabar formati/, async (ctx) => {
    const s = await storage.getSettings(ctx.from.id);
    const current = s.compact;
    await storage.updateSetting(ctx.from.id, 'compact', !current);
    await ctx.reply(
      `📋 <b>Xabar formati o'zgartirildi:</b>\n\n` +
      (!current ? `📄 Qisqa — faqat kanal nomi va qisqa matn` : `📃 To'liq — sana, bo'lim, to'liq matn`),
      { parse_mode: 'HTML' }
    );
    return renderSettings(ctx);
  });

  // ════════════════════════════════════════════
  // MATN KIRITISH (STATE)
  // ════════════════════════════════════════════
  b.on('text', async (ctx) => {
    const s = getState(ctx.from.id);
    if (!s) return;

    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const { action, data } = s;

    // ── Kanal qo'shish
    if (action === 'add_channel') {
      clearState(userId);
      const username = '@' + text.replace('@', '');
      const loading = await ctx.reply('⏳ Kanal tekshirilmoqda...');
      const check = await scraper.checkChannel(username).catch(() => ({ ok: false, error: 'Xato' }));
      const added = check.ok ? await storage.addChannel(userId, { username, title: username }) : false;
      await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null,
        check.ok
          ? (added ? `✅ <b>${username}</b> qo'shildi!` : `⚠️ <b>${username}</b> allaqachon bor.`)
          : `❌ <b>${username}</b> topilmadi.\nKanal public bo'lishi kerak.`,
        { parse_mode: 'HTML' }
      );
      const channels = await storage.getChannels(userId);
      return ctx.reply(
        `📡 <b>Kanallar</b>\n\n` + (channels.map((c, i) => `${i + 1}. ${c.username}`).join('\n') || 'Hali yo\'q'),
        { parse_mode: 'HTML', ...channelMenu() }
      );
    }

    // ── Bo'lim nomi
    if (action === 'sec_name') {
      setState(userId, 'sec_keywords', { name: text });
      return ctx.reply(
        `📂 Bo'lim: <b>${text}</b>\n\n` +
        `<b>2-qadam:</b> Kalit so'zlarni yuboring\n\n` +
        `Vergul bilan ajrating:\n<code>3 xona, ijaraga, Toshkent</code>\n\n` +
        `💡 Habar <i>barcha</i> so'zlarni o'z ichiga olsa topiladi.`,
        { parse_mode: 'HTML' }
      );
    }

    // ── Bo'lim kalit so'zlari
    if (action === 'sec_keywords') {
      clearState(userId);
      const keywords = text.split(',').map(k => k.trim()).filter(k => k);
      if (keywords.length === 0) {
        return ctx.reply('❌ Kamida bitta kalit so\'z kiriting.', sectionMenu());
      }
      const added = await storage.addSection(userId, data.name, keywords);
      await ctx.reply(
        added
          ? `✅ <b>${data.name}</b> bo'limi yaratildi!\n\n🔑 Kalit so'zlar: ${keywords.map(k => `<code>${k}</code>`).join(' · ')}`
          : `⚠️ <b>${data.name}</b> allaqachon mavjud.`,
        { parse_mode: 'HTML', ...sectionMenu() }
      );
      if (added) monitor.triggerPoll(ctx.telegram, userId);
      return;
    }

    // ── Bo'limga kalit so'z qo'shish
    if (action === 'kw_add') {
      clearState(userId);
      const keywords = text.split(',').map(k => k.trim()).filter(k => k);
      const results = await Promise.all(keywords.map(kw => storage.addKeywordToSection(userId, data.name, kw)));
      const added = keywords.filter((_, i) => results[i]);
      await ctx.reply(
        added.length > 0
          ? `✅ Qo'shildi: ${added.map(k => `<code>${k}</code>`).join(', ')}`
          : `⚠️ Hech narsa qo'shilmadi.`,
        { parse_mode: 'HTML' }
      );
      if (added.length > 0) monitor.triggerPoll(ctx.telegram, userId);
      return renderSectionDetail(ctx, data.name);
    }

    // ── Sozlamalar: yangilanish oralig'i
    if (action === 'set_poll') {
      clearState(userId);
      const val = parseInt(text);
      if (isNaN(val) || val < 30) {
        return ctx.reply('❌ Noto\'g\'ri qiymat. Kamida 30 soniya bo\'lishi kerak.', await settingsMenu(ctx.from.id));
      }
      await storage.updateSetting(userId, 'pollInterval', val);
      await ctx.reply(`✅ Yangilanish oralig'i: <b>${val} soniya</b>`, { parse_mode: 'HTML' });
      if (monitor.isRunning(userId)) {
        monitor.restartInterval(ctx.telegram, userId);
        await ctx.reply('🔄 Monitoring yangi interval bilan qayta ishga tushdi.');
      }
      return renderSettings(ctx);
    }

    // ── Sozlamalar: tarix chuqurligi
    if (action === 'set_history') {
      clearState(userId);
      const val = parseInt(text);
      if (isNaN(val) || val < 1 || val > 14) {
        return ctx.reply('❌ 1 dan 14 gacha son kiriting.', await settingsMenu(ctx.from.id));
      }
      await storage.updateSetting(userId, 'historyDays', val);
      await ctx.reply(`✅ Tarix chuqurligi: <b>${val} kun</b>`, { parse_mode: 'HTML' });
      return renderSettings(ctx);
    }
  });

  // ════════════════════════════════════════════
  // INLINE CALLBACKLAR
  // ════════════════════════════════════════════

  b.action('mon:once', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply('⚡ <b>Bir martalik monitoring boshlandi...</b>', { parse_mode: 'HTML' });
    monitor.startOnce(ctx.telegram, ctx.from.id).catch(console.error);
  });

  b.action('mon:continuous', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    if (monitor.isRunning(userId)) {
      return ctx.answerCbQuery('Allaqachon ishlayapti!', { show_alert: true });
    }
    const settings = await storage.getSettings(userId);
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply(
      `🔄 <b>Davomiy monitoring boshlandi!</b>\n\n⏱ Har <b>${settings.pollInterval}s</b>da tekshiriladi.\nTo'xtatish: ▶️ Monitoring → ⏹ To'xtatish`,
      { parse_mode: 'HTML' }
    );
    monitor.startContinuous(ctx.telegram, userId).catch(console.error);
  });

  b.action('mon:stop', async (ctx) => {
    await ctx.answerCbQuery();
    const stopped = monitor.stopContinuous(ctx.from.id);
    await ctx.editMessageReplyMarkup(undefined);
    return ctx.reply(
      stopped ? '⏹ <b>Monitoring to\'xtatildi.</b>' : '⚠️ Monitoring ishlamayapti.',
      { parse_mode: 'HTML' }
    );
  });

  b.action(/^del_ch:(.+)$/, async (ctx) => {
    await storage.removeChannel(ctx.from.id, ctx.match[1]);
    await ctx.answerCbQuery('✅ O\'chirildi');
    await ctx.editMessageText(`✅ <b>${ctx.match[1]}</b> o'chirildi.`, { parse_mode: 'HTML' });
  });

  b.action(/^del_sec:(.+)$/, async (ctx) => {
    await storage.removeSection(ctx.from.id, ctx.match[1]);
    monitor.triggerPoll(ctx.telegram, ctx.from.id);
    await ctx.answerCbQuery('✅ O\'chirildi');
    await ctx.editMessageText(`✅ <b>${ctx.match[1]}</b> bo'limi o'chirildi.`, { parse_mode: 'HTML' });
  });

  b.action(/^sec:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    return renderSectionDetail(ctx, ctx.match[1]);
  });

  b.action(/^kw_add:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    setState(ctx.from.id, 'kw_add', { name: ctx.match[1] });
    return ctx.reply(
      `➕ <b>${ctx.match[1]}</b> bo'limiga kalit so'z:\n\nVergul bilan: <code>yangi so'z, boshqa so'z</code>`,
      { parse_mode: 'HTML' }
    );
  });

  b.action(/^kw_del:([^|]+)\|(.+)$/, async (ctx) => {
    const [, secName, kw] = ctx.match;
    await storage.removeKeywordFromSection(ctx.from.id, secName, kw);
    monitor.triggerPoll(ctx.telegram, ctx.from.id);
    await ctx.answerCbQuery(`✅ "${kw}" o'chirildi`);
    return renderSectionDetail(ctx, secName, true);
  });

  return b;
}

// ════════════════════════════════════════════
// RENDER FUNKSIYALARI
// ════════════════════════════════════════════

async function renderSectionList(ctx) {
  const sections = await storage.getSections(ctx.from.id);
  const info = await userInfoLine(ctx.from.id);
  const status = await statusLine(ctx.from.id);
  let text = `${info}\n\n📂 <b>Bo'limlar</b>\n<i>${status}</i>\n\n`;

  if (sections.length === 0) {
    text += `Hali bo'lim yo'q.\n\n💡 Bo'lim — bu filtr guruhi. Har bir bo'limda\nkalit so'zlar bo'ladi. Habar ularning\n<i>barchasiga</i> mos kelsa sizga yuboriladi.`;
    return ctx.reply(text, { parse_mode: 'HTML', ...sectionMenu() });
  }

  sections.forEach((s, i) => {
    text += `${i + 1}. <b>${s.name}</b>\n`;
    text += `   ${s.keywords.length > 0 ? s.keywords.map(k => `<code>${k}</code>`).join(' · ') : '<i>kalit so\'z yo\'q</i>'}\n\n`;
  });

  const buttons = sections.map(s => [Markup.button.callback(`📂 ${s.name}`, `sec:${s.name}`)]);
  await ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  return ctx.reply('Bo\'lim menyusi:', sectionMenu());
}

async function renderSectionDetail(ctx, secName, edit = false) {
  const sections = await storage.getSections(ctx.from.id);
  const sec = sections.find(s => s.name === secName);
  if (!sec) return ctx.reply('❌ Bo\'lim topilmadi.');

  let text = `📂 <b>${sec.name}</b>\n\n`;
  text += `🔑 <b>Kalit so'zlar</b> (${sec.keywords.length} ta):\n`;
  text += sec.keywords.length > 0
    ? sec.keywords.map(k => `• <code>${k}</code>`).join('\n')
    : `<i>Hali yo'q</i>`;

  const kwBtns = sec.keywords.map(kw =>
    [Markup.button.callback(`❌ ${kw}`, `kw_del:${sec.name}|${kw}`)]
  );
  const btns = [
    ...kwBtns,
    [Markup.button.callback('➕ Kalit so\'z qo\'shish', `kw_add:${sec.name}`)],
    [Markup.button.callback('🗑 Bu bo\'limni o\'chirish', `del_sec:${sec.name}`)],
  ];

  if (edit) {
    try { return await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(btns) }); }
    catch { /* fall through */ }
  }
  return ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(btns) });
}

async function renderSettings(ctx) {
  const userId = ctx.from.id;
  const s = await storage.getSettings(userId);
  const info = await userInfoLine(userId);
  const text =
    `${info}\n\n` +
    `⚙️ <b>Sozlamalar</b>\n\n` +
    `⏱ <b>Yangilanish oralig'i:</b> ${s.pollInterval} soniya\n` +
    `📅 <b>Tarix chuqurligi:</b> ${s.historyDays} kun\n` +
    `📋 <b>Xabar formati:</b> ${s.compact ? 'Qisqa' : 'To\'liq'}\n\n` +
    `O'zgartirish uchun quyidagi tugmalardan foydalaning:`;
  return ctx.reply(text, { parse_mode: 'HTML', ...await settingsMenu(userId) });
}

// ════════════════════════════════════════════
// KLAVIATURALAR
// ════════════════════════════════════════════

function mainMenu() {
  return Markup.keyboard([
    ['📡 Kanallar', '📂 Bo\'limlar'],
    ['▶️ Monitoring', '⚙️ Sozlamalar'],
  ]).resize();
}

function channelMenu() {
  return Markup.keyboard([
    ['➕ Kanal qo\'shish'],
    ['❌ Kanal o\'chirish'],
    ['🔙 Orqaga'],
  ]).resize();
}

function sectionMenu() {
  return Markup.keyboard([
    ['➕ Bo\'lim qo\'shish'],
    ['❌ Bo\'lim o\'chirish'],
    ['🔙 Orqaga'],
  ]).resize();
}

async function settingsMenu(userId) {
  const s = await storage.getSettings(userId);
  return Markup.keyboard([
    [`⏱ Yangilanish oralig'i`],
    [`📅 Tarix chuqurligi`],
    [`📋 Xabar formati: ${s.compact ? 'Qisqa ↔ To\'liq' : 'To\'liq ↔ Qisqa'}`],
    ['🔙 Orqaga'],
  ]).resize();
}

function backMenu() {
  return Markup.keyboard([['🔙 Orqaga']]).resize();
}

module.exports = { bot };
