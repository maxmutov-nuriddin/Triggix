const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_SETTINGS = {
  pollInterval: 60,   // soniyada
  historyDays: 2,     // necha kunlik tarix
  compact: false,     // qisqa format
};

function userFile(userId) {
  return path.join(DATA_DIR, `${userId}.json`);
}

function readUser(userId) {
  const file = userFile(userId);
  if (!fs.existsSync(file)) return { channels: [], sections: [], settings: { ...DEFAULT_SETTINGS } };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.sections) data.sections = [];
    if (!data.channels) data.channels = [];
    if (!data.settings) data.settings = { ...DEFAULT_SETTINGS };
    else data.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    return data;
  } catch {
    return { channels: [], sections: [], settings: { ...DEFAULT_SETTINGS } };
  }
}

function writeUser(userId, data) {
  fs.writeFileSync(userFile(userId), JSON.stringify(data, null, 2));
}

// ── Kanallar ──────────────────────────────────

function getChannels(userId) { return readUser(userId).channels; }

function addChannel(userId, channel) {
  const data = readUser(userId);
  if (data.channels.find(c => c.username === channel.username)) return false;
  data.channels.push(channel);
  writeUser(userId, data);
  return true;
}

function removeChannel(userId, username) {
  const data = readUser(userId);
  const before = data.channels.length;
  data.channels = data.channels.filter(c => c.username !== username);
  writeUser(userId, data);
  return data.channels.length < before;
}

// ── Bo'limlar ─────────────────────────────────

function getSections(userId) { return readUser(userId).sections; }

function addSection(userId, name, keywords) {
  const data = readUser(userId);
  if (data.sections.find(s => s.name.toLowerCase() === name.toLowerCase())) return false;
  data.sections.push({
    name: name.trim(),
    keywords: keywords.map(k => k.toLowerCase().trim()).filter(k => k),
  });
  writeUser(userId, data);
  return true;
}

function removeSection(userId, name) {
  const data = readUser(userId);
  const before = data.sections.length;
  data.sections = data.sections.filter(s => s.name !== name);
  writeUser(userId, data);
  return data.sections.length < before;
}

function addKeywordToSection(userId, sectionName, keyword) {
  const data = readUser(userId);
  const section = data.sections.find(s => s.name === sectionName);
  if (!section) return false;
  const kw = keyword.toLowerCase().trim();
  if (section.keywords.includes(kw)) return false;
  section.keywords.push(kw);
  writeUser(userId, data);
  return true;
}

function removeKeywordFromSection(userId, sectionName, keyword) {
  const data = readUser(userId);
  const section = data.sections.find(s => s.name === sectionName);
  if (!section) return false;
  const before = section.keywords.length;
  section.keywords = section.keywords.filter(k => k !== keyword.toLowerCase().trim());
  writeUser(userId, data);
  return section.keywords.length < before;
}

// ── Sozlamalar ────────────────────────────────

function getSettings(userId) { return readUser(userId).settings; }

function updateSetting(userId, key, value) {
  const data = readUser(userId);
  data.settings[key] = value;
  writeUser(userId, data);
}

module.exports = {
  getChannels, addChannel, removeChannel,
  getSections, addSection, removeSection,
  addKeywordToSection, removeKeywordFromSection,
  getSettings, updateSetting,
  DEFAULT_SETTINGS,
};
