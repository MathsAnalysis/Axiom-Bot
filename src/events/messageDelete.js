const { LogManager } = require('../modules/logging/LogManager');

module.exports = {
  name: 'messageDelete',

  /**
   * Handles message deletion events.
   * Logs the deleted message content via LogManager.
   *
   * @param {import('discord.js').Message} message - The deleted message
   * @param {import('discord.js').Client} client
   */
  async execute(message, client) {
    // Ignore DMs
    if (!message.guild) return;

    // Try to fetch partial messages for complete data
    if (message.partial) {
      try {
        await message.fetch();
      } catch {
        // Cannot fetch deleted messages, log what we have
      }
    }

    try {
      await LogManager.logDelete(message);
    } catch (error) {
      console.error('[MessageDelete] Error logging deletion:', error.message);
    }
  },
};
