const { registerCommands } = require('../handlers/commandHandler');

module.exports = {
  name: 'ready',
  once: true,

  /**
   * Fired once when the bot has connected and is ready.
   * Logs status information and registers slash commands with the Discord API.
   *
   * @param {import('discord.js').Client} client
   */
  async execute(client) {
    console.log(`[Bot] Logged in as ${client.user.tag}`);
    console.log(`[Bot] Serving ${client.guilds.cache.size} guild(s)`);
    console.log(`[Bot] ${client.commands.size} commands loaded`);

    try {
      await registerCommands(client);
    } catch (error) {
      console.error('[Bot] Failed to register commands on ready:', error);
    }

    console.log('[Bot] Ready and operational.');
  },
};
