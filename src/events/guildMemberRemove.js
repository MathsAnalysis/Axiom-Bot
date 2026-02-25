const { EmbedBuilder } = require('discord.js');
const config = require('../config/ConfigManager');
const { LogManager } = require('../modules/logging/LogManager');

module.exports = {
  name: 'guildMemberRemove',

  /**
   * Handles member leave events.
   * Logs the leave and sends a goodbye message if configured.
   *
   * @param {import('discord.js').GuildMember} member - The member who left
   * @param {import('discord.js').Client} client
   */
  async execute(member, client) {
    // Log the leave event
    try {
      await LogManager.logLeave(member);
    } catch (error) {
      console.error('[GuildMemberRemove] Error logging leave:', error.message);
    }

    // Send goodbye message if enabled
    try {
      const goodbyeEnabled = config.get('goodbye.enabled');
      if (goodbyeEnabled) {
        const channelId = config.get('goodbye.channel');
        if (channelId) {
          const channel = await member.guild.channels.fetch(channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            const title = config.get('goodbye.title') || 'Goodbye!';
            const messageTemplate =
              config.get('goodbye.message') || '{user} has left **{server}**.';
            const color = config.get('goodbye.color') || '#E74C3C';
            const image = config.get('goodbye.image') || '';
            const thumbnail = config.get('goodbye.thumbnail') || '';

            const formattedMessage = messageTemplate
              .replace(/\{user\}/g, member.user.tag)
              .replace(/\{server\}/g, member.guild.name)
              .replace(/\{memberCount\}/g, String(member.guild.memberCount));

            const embed = new EmbedBuilder()
              .setColor(color)
              .setTitle(title)
              .setDescription(formattedMessage)
              .setTimestamp();

            if (image) embed.setImage(image);
            if (thumbnail) {
              embed.setThumbnail(thumbnail);
            } else {
              embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
            }

            await channel.send({ embeds: [embed] });
          }
        }
      }
    } catch (error) {
      console.error('[GuildMemberRemove] Error sending goodbye message:', error.message);
    }
  },
};
