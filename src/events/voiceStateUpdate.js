const { LogManager } = require('../modules/logging/LogManager');

module.exports = {
  name: 'voiceStateUpdate',

  /**
   * Handles voice state change events.
   * Logs voice channel joins, leaves, and moves via LogManager.
   *
   * @param {import('discord.js').VoiceState} oldState - Previous voice state
   * @param {import('discord.js').VoiceState} newState - New voice state
   * @param {import('discord.js').Client} client
   */
  async execute(oldState, newState, client) {
    try {
      await LogManager.logVoice(oldState, newState);
    } catch (error) {
      console.error('[VoiceStateUpdate] Error logging voice change:', error.message);
    }
  },
};
