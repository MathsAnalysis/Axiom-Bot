const { EmbedBuilder } = require('discord.js');
const config = require('../config/ConfigManager');

const Colors = {
  get SUCCESS() { return config.get('embed_colors.success') || '#2ECC71'; },
  get ERROR() { return config.get('embed_colors.error') || '#E74C3C'; },
  get INFO() { return config.get('embed_colors.info') || '#3498DB'; },
  get WARN() { return config.get('embed_colors.warn') || '#F39C12'; },
  get MODERATION() { return config.get('embed_colors.moderation') || '#E67E22'; },
  get TICKET() { return config.get('embed_colors.ticket') || '#9B59B6'; },
  get LOG() { return config.get('embed_colors.log') || '#607D8B'; },
};

function createEmbed(type, title, description) {
  const colorMap = {
    success: Colors.SUCCESS,
    error: Colors.ERROR,
    info: Colors.INFO,
    warn: Colors.WARN,
    moderation: Colors.MODERATION,
    ticket: Colors.TICKET,
    log: Colors.LOG,
  };

  return new EmbedBuilder()
    .setColor(colorMap[type] || Colors.INFO)
    .setTitle(title)
    .setDescription(description || null)
    .setTimestamp();
}

function successEmbed(title, description) {
  return createEmbed('success', title, description);
}

function errorEmbed(title, description) {
  return createEmbed('error', title, description);
}

function infoEmbed(title, description) {
  return createEmbed('info', title, description);
}

function warnEmbed(title, description) {
  return createEmbed('warn', title, description);
}

function modEmbed(title, description) {
  return createEmbed('moderation', title, description);
}

function ticketEmbed(title, description) {
  return createEmbed('ticket', title, description);
}

function logEmbed(title, description) {
  return createEmbed('log', title, description);
}

module.exports = {
  Colors,
  createEmbed,
  successEmbed,
  errorEmbed,
  infoEmbed,
  warnEmbed,
  modEmbed,
  ticketEmbed,
  logEmbed,
};
