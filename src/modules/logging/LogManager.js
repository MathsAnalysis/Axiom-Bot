const { EmbedBuilder } = require('discord.js');
const config = require('../../config/ConfigManager');
const i18n = require('../../locales/I18n');
const { formatDurationLong } = require('../../utils/duration');

const LogColors = {
  MESSAGE: '#3498DB',
  JOIN: '#2ECC71',
  LEAVE: '#E74C3C',
  MODERATION: '#E67E22',
  VOICE: '#9B59B6',
  EDIT: '#F1C40F',
  DELETE: '#E74C3C',
};

class LogManager {
  /**
   * Sends an embed to the appropriate log channel based on type.
   *
   * @param {import('discord.js').Guild} guild - The guild
   * @param {import('discord.js').EmbedBuilder} embed - The embed to send
   * @param {string} type - Log type: "message" | "join" | "moderation" | "voice"
   */
  static async logMessage(guild, embed, type) {
    const channelId = config.get(`logging.${type}_channel`);
    if (!channelId) return;

    try {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        await channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error(`[LogManager] Failed to send ${type} log:`, error.message);
    }
  }

  /**
   * Logs a message edit event with old and new content.
   *
   * @param {import('discord.js').Message} oldMessage - The message before editing
   * @param {import('discord.js').Message} newMessage - The message after editing
   */
  static async logEdit(oldMessage, newMessage) {
    if (!newMessage.guild) return;

    const ignoreBots = config.get('logging.ignore_bots');
    if (ignoreBots && newMessage.author.bot) return;

    // Ignore if content is the same (embed-only updates)
    if (oldMessage.content === newMessage.content) return;

    const oldContent = oldMessage.content
      ? oldMessage.content.length > 1000
        ? oldMessage.content.substring(0, 997) + '...'
        : oldMessage.content
      : '*Empty*';

    const newContent = newMessage.content
      ? newMessage.content.length > 1000
        ? newMessage.content.substring(0, 997) + '...'
        : newMessage.content
      : '*Empty*';

    const embed = new EmbedBuilder()
      .setColor(LogColors.EDIT)
      .setTitle(i18n.t('logging.message_edited'))
      .addFields(
        { name: i18n.t('logging.author'), value: `${newMessage.author} (${newMessage.author.tag})`, inline: true },
        { name: i18n.t('logging.channel'), value: `${newMessage.channel}`, inline: true },
        { name: i18n.t('logging.original'), value: oldContent },
        { name: i18n.t('logging.new_content'), value: newContent },
      )
      .setFooter({ text: `Message ID: ${newMessage.id}` })
      .setTimestamp();

    await LogManager.logMessage(newMessage.guild, embed, 'message');
  }

  /**
   * Logs a message deletion event.
   *
   * @param {import('discord.js').Message} message - The deleted message
   */
  static async logDelete(message) {
    if (!message.guild) return;

    const ignoreBots = config.get('logging.ignore_bots');
    if (ignoreBots && message.author?.bot) return;

    const content = message.content
      ? message.content.length > 1000
        ? message.content.substring(0, 997) + '...'
        : message.content
      : '*Empty or embed-only*';

    const authorDisplay = message.author
      ? `${message.author} (${message.author.tag})`
      : 'Unknown';

    const embed = new EmbedBuilder()
      .setColor(LogColors.DELETE)
      .setTitle(i18n.t('logging.message_deleted'))
      .addFields(
        { name: i18n.t('logging.author'), value: authorDisplay, inline: true },
        { name: i18n.t('logging.channel'), value: `${message.channel}`, inline: true },
        { name: i18n.t('logging.original'), value: content },
      )
      .setFooter({ text: `Message ID: ${message.id}` })
      .setTimestamp();

    // If there were attachments, note them
    if (message.attachments && message.attachments.size > 0) {
      const attachmentNames = message.attachments.map((a) => a.name || 'unknown').join(', ');
      embed.addFields({
        name: 'Attachments',
        value: attachmentNames.length > 1024 ? attachmentNames.substring(0, 1021) + '...' : attachmentNames,
      });
    }

    await LogManager.logMessage(message.guild, embed, 'message');
  }

  /**
   * Logs a member join event.
   *
   * @param {import('discord.js').GuildMember} member - The member who joined
   */
  static async logJoin(member) {
    const accountAge = Date.now() - member.user.createdTimestamp;
    const accountAgeStr = formatDurationLong(accountAge);

    const embed = new EmbedBuilder()
      .setColor(LogColors.JOIN)
      .setTitle(i18n.t('logging.member_joined'))
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: i18n.t('logging.author'), value: `${member} (${member.user.tag})`, inline: true },
        { name: i18n.t('logging.account_created'), value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R> (${accountAgeStr})`, inline: true },
        { name: i18n.t('logging.member_number'), value: `${member.guild.memberCount}`, inline: true },
      )
      .setFooter({ text: `User ID: ${member.id}` })
      .setTimestamp();

    await LogManager.logMessage(member.guild, embed, 'join');
  }

  /**
   * Logs a member leave event.
   *
   * @param {import('discord.js').GuildMember} member - The member who left
   */
  static async logLeave(member) {
    const roles = member.roles.cache
      .filter((r) => r.id !== member.guild.id) // exclude @everyone
      .map((r) => `${r}`)
      .join(', ');

    const embed = new EmbedBuilder()
      .setColor(LogColors.LEAVE)
      .setTitle(i18n.t('logging.member_left'))
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: i18n.t('logging.author'), value: `${member.user.tag} (${member.id})`, inline: true },
        { name: i18n.t('logging.member_number'), value: `${member.guild.memberCount}`, inline: true },
      )
      .setFooter({ text: `User ID: ${member.id}` })
      .setTimestamp();

    if (roles && roles.length > 0) {
      embed.addFields({
        name: 'Roles',
        value: roles.length > 1024 ? roles.substring(0, 1021) + '...' : roles,
      });
    }

    await LogManager.logMessage(member.guild, embed, 'join');
  }

  /**
   * Logs voice state changes (join, leave, move between channels).
   *
   * @param {import('discord.js').VoiceState} oldState - Previous voice state
   * @param {import('discord.js').VoiceState} newState - New voice state
   */
  static async logVoice(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member) return;

    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    const ignoreBots = config.get('logging.ignore_bots');
    if (ignoreBots && member.user.bot) return;

    let embed;

    if (!oldState.channelId && newState.channelId) {
      // User joined a voice channel
      embed = new EmbedBuilder()
        .setColor(LogColors.VOICE)
        .setTitle(i18n.t('logging.voice_joined'))
        .addFields(
          { name: i18n.t('logging.author'), value: `${member} (${member.user.tag})`, inline: true },
          { name: i18n.t('logging.channel'), value: `${newState.channel}`, inline: true },
        )
        .setFooter({ text: `User ID: ${member.id}` })
        .setTimestamp();
    } else if (oldState.channelId && !newState.channelId) {
      // User left a voice channel
      embed = new EmbedBuilder()
        .setColor(LogColors.VOICE)
        .setTitle(i18n.t('logging.voice_left'))
        .addFields(
          { name: i18n.t('logging.author'), value: `${member} (${member.user.tag})`, inline: true },
          { name: i18n.t('logging.channel'), value: `${oldState.channel}`, inline: true },
        )
        .setFooter({ text: `User ID: ${member.id}` })
        .setTimestamp();
    } else if (oldState.channelId !== newState.channelId) {
      // User moved between voice channels
      embed = new EmbedBuilder()
        .setColor(LogColors.VOICE)
        .setTitle(i18n.t('logging.voice_moved'))
        .addFields(
          { name: i18n.t('logging.author'), value: `${member} (${member.user.tag})`, inline: true },
          { name: 'From', value: `${oldState.channel}`, inline: true },
          { name: 'To', value: `${newState.channel}`, inline: true },
        )
        .setFooter({ text: `User ID: ${member.id}` })
        .setTimestamp();
    } else {
      // Other state changes (mute, deafen, etc.) - skip
      return;
    }

    await LogManager.logMessage(guild, embed, 'voice');
  }
}

module.exports = { LogManager };
