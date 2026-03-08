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
function statusLine(userId) {
  const ch = storage.getChannels(userId).length;
  const sec = storage.getSections(userId).length;
  const running = monitor.isRunning(userId);
  const icon = running ? '🟢' : '⚪';
  return `${icon} ${ch} kanal · ${sec} bo'lim · monitoring ${running ? 'yoqiq' : 'o\'chiq'}`;
}

function bot(token) {
  const b = new Telegraf(token);

  // ════════════════════════════════════════════
  // START
  // ════════════════════════════════════════════
  b.start(async (ctx) => {
    clearState(ctx.from.id);
    await ctx.reply(
      `👋 Salom, <b>${ctx.from.first_name}</b>!\n\n` +
      `Bu bot Telegram kanallardan habarlarni bo'limlar bo'yicha filtrlaydi.\n\n` +
      `<b>Qanday ishlaydi:</b>\n` +
      `1️⃣  <b>Kanal qo'shing</b> — qaysi kanallarni kuzatish kerak\n` +
      `2️⃣  <b>Bo'lim yarating</b> — filtr nomi va kalit so'zlar\n` +
      `3️⃣  <b>Monitoring boshlang</b> — mos habarlar sizga keladi\n\n` +
      `💡 Biror bo'limning <i>barcha</i> kalit so'zlari habardan topilsa — u habar sizga yuboriladi.\n\n` +
      `Quyidagi menyudan boshlang 👇`,
      { parse_mode: 'HTML', ...mainMenu() }
    );
  });

  // ════════════════════════════════════════════
  // ASOSIY MENYU
  // ════════════════════════════════════════════
  b.hears('📡 Kanallar', async (ctx) => {
    clearState(ctx.from.id);
    const channels = storage.getChannels(ctx.from.id);
    let text = `📡 <b>Kanallar</b>\n<i>${statusLine(ctx.from.id)}</i>\n\n`;
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
    const channels = storage.getChannels(userId);
    if (channels.length === 0) {
      return ctx.reply(
        `❌ Avval kanal qo'shing!\n\n📡 Kanallar menyusiga o'ting.`,
        channelMenu()
      );
    }
    const sections = storage.getSections(userId);
    const settings = storage.getSettings(userId);
    const running = monitor.isRunning(userId);

    let text = `▶️ <b>Monitoring</b>\n<i>${statusLine(userId)}</i>\n\n`;
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

  b.hears('⚙️ Sozlamalar', (ctx) => {
    clearState(ctx.from.id);
    return renderSettings(ctx);
  });

  b.hears('🔙 Orqaga', (ctx) => {
    clearState(ctx.from.id);
    return ctx.reply(`${statusLine(ctx.from.id)}\n\nAsosiy menyu:`, { parse_mode: 'HTML', ...mainMenu() });
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

  b.hears('❌ Kanal o\'chirish', (ctx) => {
    const channels = storage.getChannels(ctx.from.id);
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

  b.hears('❌ Bo\'lim o\'chirish', (ctx) => {
    const sections = storage.getSections(ctx.from.id);
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
  b.hears('⏱ Yangilanish oralig\'i', (ctx) => {
    setState(ctx.from.id, 'set_poll');
    const s = storage.getSettings(ctx.from.id);
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

  b.hears('📅 Tarix chuqurligi', (ctx) => {
    setState(ctx.from.id, 'set_history');
    const s = storage.getSettings(ctx.from.id);
    return ctx.reply(
      `📅 <b>Tarix chuqurligi</b>\n\nJoriy qiymat: <b>${s.historyDays} kun</b>\n\n` +
      `Monitoring boshlanganida necha kunlik habarlarni yuklash kerak?\n\n` +
      `Sonini yuboring (1–14):`,
      { parse_mode: 'HTML', ...backMenu() }
    );
  });

  b.hears('📋 Xabar formati', async (ctx) => {
    const s = storage.getSettings(ctx.from.id);
    const current = s.compact;
    storage.updateSetting(ctx.from.id, 'compact', !current);
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
      await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null,
        check.ok
          ? (storage.addChannel(userId, { username, title: username })
              ? `✅ <b>${username}</b> qo'shildi!`
              : `⚠️ <b>${username}</b> allaqachon bor.`)
          : `❌ <b>${username}</b> topilmadi.\nKanal public bo'lishi kerak.`,
        { parse_mode: 'HTML' }
      );
      return ctx.reply(`📡 <b>Kanallar</b>\n\n` + storage.getChannels(userId).map((c, i) => `${i + 1}. ${c.username}`).join('\n') || 'Hali yo\'q',
        { parse_mode: 'HTML', ...channelMenu() });
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
      const added = storage.addSection(userId, data.name, keywords);
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
      const added = keywords.filter(kw => storage.addKeywordToSection(userId, data.name, kw));
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
        return ctx.reply('❌ Noto\'g\'ri qiymat. Kamida 30 soniya bo\'lishi kerak.', settingsMenu(ctx.from.id));
      }
      storage.updateSetting(userId, 'pollInterval', val);
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
        return ctx.reply('❌ 1 dan 14 gacha son kiriting.', settingsMenu(ctx.from.id));
      }
      storage.updateSetting(userId, 'historyDays', val);
      await ctx.reply(`✅ Tarix chuqurligi: <b>${val} kun</b>`, { parse_mode: 'HTML' });
      return renderSettings(ctx);
    }
  });

  // ════════════════════════════════════════════
  // INLINE CALLBACKLAR
  // ════════════════════════════════════════════

  // Monitoring
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
    const settings = storage.getSettings(userId);
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

  // Kanal o'chirish
  b.action(/^del_ch:(.+)$/, async (ctx) => {
    storage.removeChannel(ctx.from.id, ctx.match[1]);
    await ctx.answerCbQuery('✅ O\'chirildi');
    await ctx.editMessageText(`✅ <b>${ctx.match[1]}</b> o'chirildi.`, { parse_mode: 'HTML' });
  });

  // Bo'lim o'chirish
  b.action(/^del_sec:(.+)$/, async (ctx) => {
    storage.removeSection(ctx.from.id, ctx.match[1]);
    monitor.triggerPoll(ctx.telegram, ctx.from.id);
    await ctx.answerCbQuery('✅ O\'chirildi');
    await ctx.editMessageText(`✅ <b>${ctx.match[1]}</b> bo'limi o'chirildi.`, { parse_mode: 'HTML' });
  });

  // Bo'lim tafsiloti
  b.action(/^sec:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    return renderSectionDetail(ctx, ctx.match[1]);
  });

  // Bo'limga kalit so'z qo'shish
  b.action(/^kw_add:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    setState(ctx.from.id, 'kw_add', { name: ctx.match[1] });
    return ctx.reply(
      `➕ <b>${ctx.match[1]}</b> bo'limiga kalit so'z:\n\nVergul bilan: <code>yangi so'z, boshqa so'z</code>`,
      { parse_mode: 'HTML' }
    );
  });

  // Bo'limdan kalit so'z o'chirish
  b.action(/^kw_del:([^|]+)\|(.+)$/, async (ctx) => {
    const [, secName, kw] = ctx.match;
    storage.removeKeywordFromSection(ctx.from.id, secName, kw);
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
  const sections = storage.getSections(ctx.from.id);
  let text = `📂 <b>Bo'limlar</b>\n<i>${statusLine(ctx.from.id)}</i>\n\n`;

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
  const sections = storage.getSections(ctx.from.id);
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
  const s = storage.getSettings(userId);
  const text =
    `⚙️ <b>Sozlamalar</b>\n\n` +
    `⏱ <b>Yangilanish oralig'i:</b> ${s.pollInterval} soniya\n` +
    `📅 <b>Tarix chuqurligi:</b> ${s.historyDays} kun\n` +
    `📋 <b>Xabar formati:</b> ${s.compact ? 'Qisqa' : 'To\'liq'}\n\n` +
    `O'zgartirish uchun quyidagi tugmalardan foydalaning:`;
  return ctx.reply(text, { parse_mode: 'HTML', ...settingsMenu(userId) });
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

function settingsMenu(userId) {
  const s = storage.getSettings(userId);
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
