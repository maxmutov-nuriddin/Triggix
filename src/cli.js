const readline = require('readline');
const storage = require('./storage');
const scraper = require('./scraper');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function printStatus() {
  const channels = storage.getChannels();
  const filters = storage.getFilters();
  console.log('\n' + '─'.repeat(46));
  console.log('📡 Kanallar:', channels.length > 0
    ? channels.map(c => c.title || c.username).join(', ')
    : 'yo\'q');
  console.log('🔍 Filterlar:', filters.length > 0
    ? filters.join(', ')
    : 'yo\'q (hammasi o\'tadi)');
  console.log('─'.repeat(46) + '\n');
}

async function setupMenu() {
  console.clear();
  console.log('╔════════════════════════════════════════════╗');
  console.log('║       📡 Kanal Filter Bot - Sozlash        ║');
  console.log('╚════════════════════════════════════════════╝');
  printStatus();

  console.log('1. ➕ Kanal qo\'shish');
  console.log('2. ➖ Kanal o\'chirish');
  console.log('3. ➕ Filter qo\'shish');
  console.log('4. ➖ Filter o\'chirish');
  console.log('5. 🗑  Filterlarni tozalash');
  console.log('6. ▶️  Monitoringni boshlash');
  console.log('0. 🚪 Chiqish\n');

  const choice = await ask('Tanlang: ');

  if (choice === '1') {
    const input = await ask('Kanal username kiriting (@kanal yoki kanal): ');
    const username = '@' + input.replace('@', '');

    process.stdout.write('   Tekshirilmoqda...');
    const check = await scraper.checkChannel(username).catch(() => ({ ok: false, error: 'Ulanmadi' }));

    if (!check.ok) {
      console.log(`\n❌ Kanal ochilmadi: ${check.error}`);
      console.log('   Kanal public bo\'lishi kerak!');
    } else {
      const added = storage.addChannel({ username, title: username });
      console.log(added ? `\n✅ ${username} qo'shildi!` : `\n⚠️  Allaqachon mavjud.`);
    }
    await ask('\nEnter bosing...');

  } else if (choice === '2') {
    const channels = storage.getChannels();
    if (channels.length === 0) {
      console.log('\n❌ Kanal yo\'q.');
    } else {
      channels.forEach((c, i) => console.log(`  ${i + 1}. ${c.title || c.username}`));
      const num = await ask('\nO\'chirish uchun raqam: ');
      const idx = parseInt(num) - 1;
      if (idx >= 0 && idx < channels.length) {
        storage.removeChannel(channels[idx].username);
        console.log('\n✅ O\'chirildi.');
      } else {
        console.log('\n❌ Noto\'g\'ri raqam.');
      }
    }
    await ask('\nEnter bosing...');

  } else if (choice === '3') {
    const input = await ask('Kalit so\'z(lar) (vergul bilan: sotiladi, ijaraga): ');
    const keywords = input.split(',').map(k => k.trim()).filter(k => k);
    const added = keywords.filter(kw => storage.addFilter(kw));
    console.log(added.length > 0
      ? `\n✅ Qo'shildi: ${added.join(', ')}`
      : '\n⚠️  Hech narsa qo\'shilmadi.');
    await ask('\nEnter bosing...');

  } else if (choice === '4') {
    const filters = storage.getFilters();
    if (filters.length === 0) {
      console.log('\n❌ Filter yo\'q.');
    } else {
      filters.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
      const num = await ask('\nO\'chirish uchun raqam: ');
      const idx = parseInt(num) - 1;
      if (idx >= 0 && idx < filters.length) {
        storage.removeFilter(filters[idx]);
        console.log('\n✅ O\'chirildi.');
      } else {
        console.log('\n❌ Noto\'g\'ri raqam.');
      }
    }
    await ask('\nEnter bosing...');

  } else if (choice === '5') {
    const confirm = await ask('Haqiqatan tozalamoqchimisiz? (ha): ');
    if (confirm === 'ha') {
      storage.clearFilters();
      console.log('\n✅ Tozalandi.');
    }
    await ask('\nEnter bosing...');

  } else if (choice === '6') {
    const channels = storage.getChannels();
    if (channels.length === 0) {
      console.log('\n❌ Avval kanal qo\'shing!');
      await ask('\nEnter bosing...');
    } else {
      return 'start';
    }

  } else if (choice === '0') {
    process.exit(0);
  }

  return setupMenu();
}

module.exports = { setupMenu };
