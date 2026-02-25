const { LogManager } = require('../modules/logging/LogManager');

module.exports = {
  name: 'messageUpdate',

  /**
   * Handles message edit events.
   * Logs the old and new content via LogManager.
   *
   * @param {import('discord.js').Message} oldMessage - The message before the edit
   * @param {import('discord.js').Message} newMessage - The message after the edit
   * @param {import('discord.js').Client} client
   */
  async execute(oldMessage, newMessage, client) {
    // Ignore DMs
    if (!newMessage.guild) return;

    // Ignore partial messages without content (fetch if needed)
    if (oldMessage.partial) {
      try {
        await oldMessage.fetch();
      } catch {
        return;
      }
    }

    if (newMessage.partial) {
      try {
        await newMessage.fetch();
      } catch {
        return;
      }
    }

    // Ignore if content is unchanged (embed-only updates trigger messageUpdate)
    if (oldMessage.content === newMessage.content) return;

    try {
      await LogManager.logEdit(oldMessage, newMessage);
    } catch (error) {
      console.error('[MessageUpdate] Error logging edit:', error.message);
    }
  },
};
