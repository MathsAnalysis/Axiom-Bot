const { EmbedBuilder } = require('discord.js');
const config = require('../config/ConfigManager');
const { LogManager } = require('../modules/logging/LogManager');

module.exports = {
  name: 'guildMemberAdd',

  /**
   * Handles new member join events.
   * Logs the join, sends a welcome message if configured,
   * and runs anti-raid checks.
   *
   * @param {import('discord.js').GuildMember} member - The member who joined
   * @param {import('discord.js').Client} client
   */
  async execute(member, client) {
    // Log the join event
    try {
      await LogManager.logJoin(member);
    } catch (error) {
      console.error('[GuildMemberAdd] Error logging join:', error.message);
    }

    // Send welcome message if enabled
    try {
      const welcomeEnabled = config.get('welcome.enabled');
      if (welcomeEnabled) {
        const channelId = config.get('welcome.channel');
        if (channelId) {
          const channel = await member.guild.channels.fetch(channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            const title = config.get('welcome.title') || 'Welcome!';
            const messageTemplate = config.get('welcome.message') || 'Welcome {user} to **{server}**!';
            const color = config.get('welcome.color') || '#2ECC71';
            const image = config.get('welcome.image') || '';
            const thumbnail = config.get('welcome.thumbnail') || '';

            const formattedMessage = messageTemplate
              .replace(/\{user\}/g, `${member}`)
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
      console.error('[GuildMemberAdd] Error sending welcome message:', error.message);
    }

    // Run anti-raid checks
    try {
      if (client.antiRaid) {
        await client.antiRaid.checkJoin(member);
        await client.antiRaid.checkAccountAge(member);
      }
    } catch (error) {
      console.error('[GuildMemberAdd] Error in anti-raid check:', error.message);
    }
  },
};
