const User = require('./userModel');

const DEFAULT_SETTINGS = {
  pollInterval: 60,
  historyDays: 2,
  compact: false,
};

// Foydalanuvchini topish yoki yaratish
async function getOrCreate(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = await User.create({ userId, settings: { ...DEFAULT_SETTINGS } });
  }
  return user;
}

// ── Foydalanuvchi profili ─────────────────────

async function saveUserProfile(userId, { firstName, lastName, username }) {
  await User.updateOne(
    { userId },
    {
      $set: { firstName, lastName, username },
      $setOnInsert: { settings: { ...DEFAULT_SETTINGS } },
    },
    { upsert: true }
  );
}

async function getUserProfile(userId) {
  const user = await User.findOne({ userId });
  if (!user) return null;
  return {
    userId: user.userId,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    joinedAt: user.joinedAt,
  };
}

// ── Kanallar ──────────────────────────────────

async function getChannels(userId) {
  const user = await getOrCreate(userId);
  return user.channels;
}

async function addChannel(userId, channel) {
  const user = await getOrCreate(userId);
  if (user.channels.find(c => c.username === channel.username)) return false;
  user.channels.push(channel);
  await user.save();
  return true;
}

async function removeChannel(userId, username) {
  const user = await getOrCreate(userId);
  const before = user.channels.length;
  user.channels = user.channels.filter(c => c.username !== username);
  await user.save();
  return user.channels.length < before;
}

// ── Bo'limlar ─────────────────────────────────

async function getSections(userId) {
  const user = await getOrCreate(userId);
  return user.sections;
}

async function addSection(userId, name, keywords) {
  const user = await getOrCreate(userId);
  if (user.sections.find(s => s.name.toLowerCase() === name.toLowerCase())) return false;
  user.sections.push({
    name: name.trim(),
    keywords: keywords.map(k => k.toLowerCase().trim()).filter(k => k),
  });
  await user.save();
  return true;
}

async function removeSection(userId, name) {
  const user = await getOrCreate(userId);
  const before = user.sections.length;
  user.sections = user.sections.filter(s => s.name !== name);
  await user.save();
  return user.sections.length < before;
}

async function addKeywordToSection(userId, sectionName, keyword) {
  const user = await getOrCreate(userId);
  const section = user.sections.find(s => s.name === sectionName);
  if (!section) return false;
  const kw = keyword.toLowerCase().trim();
  if (section.keywords.includes(kw)) return false;
  section.keywords.push(kw);
  await user.save();
  return true;
}

async function removeKeywordFromSection(userId, sectionName, keyword) {
  const user = await getOrCreate(userId);
  const section = user.sections.find(s => s.name === sectionName);
  if (!section) return false;
  const before = section.keywords.length;
  section.keywords = section.keywords.filter(k => k !== keyword.toLowerCase().trim());
  await user.save();
  return section.keywords.length < before;
}

// ── Sozlamalar ────────────────────────────────

async function getSettings(userId) {
  const user = await getOrCreate(userId);
  return { ...DEFAULT_SETTINGS, ...user.settings.toObject() };
}

async function updateSetting(userId, key, value) {
  const user = await getOrCreate(userId);
  user.settings[key] = value;
  await user.save();
}

module.exports = {
  saveUserProfile,
  getUserProfile,
  getChannels, addChannel, removeChannel,
  getSections, addSection, removeSection,
  addKeywordToSection, removeKeywordFromSection,
  getSettings, updateSetting,
  DEFAULT_SETTINGS,
};
