module.exports = {
  name: 'messageCreate',

  /**
   * Handles incoming messages.
   * Runs anti-spam checks, toxicity detection, and updates ticket activity.
   *
   * @param {import('discord.js').Message} message
   * @param {import('discord.js').Client} client
   */
  async execute(message, client) {
    // Ignore DMs
    if (!message.guild) return;

    // Ignore bots
    if (message.author.bot) return;

    // Run anti-spam check
    try {
      if (client.antiSpam) {
        const spamResult = client.antiSpam.check(message);
        if (spamResult && spamResult.spam) {
          // Anti-spam module handles the action internally
          return;
        }
      }
    } catch (error) {
      console.error('[MessageCreate] Error in anti-spam check:', error.message);
    }

    // Run toxicity detection
    try {
      if (client.perspective) {
        await client.perspective.handleMessage(message);
      }
    } catch (error) {
      console.error('[MessageCreate] Error in toxicity check:', error.message);
    }

    // Update ticket activity if the message is in a ticket channel
    try {
      if (client.ticketManager && client.ticketManager.isTicketChannel(message.channel.id)) {
        client.ticketManager.updateActivity(message.channel.id);
      }
    } catch (error) {
      console.error('[MessageCreate] Error updating ticket activity:', error.message);
    }
  },
};
