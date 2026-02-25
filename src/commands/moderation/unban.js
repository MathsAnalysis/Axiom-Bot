const { SlashCommandBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const { modEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { isModerator, hasCommandPermission } = require('../../utils/permissions');
const moderationManager = require('../../modules/moderation/ModerationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user from the server')
    .addStringOption((option) =>
      option
        .setName('user_id')
        .setDescription('The user ID to unban')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the unban').setRequired(false),
    ),

  async execute(interaction) {
    // Permission checks
    if (!isModerator(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    if (!hasCommandPermission(interaction.member, 'unban')) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const userId = interaction.options.getString('user_id');
    const reason = interaction.options.getString('reason') || i18n.t('moderation.no_reason');

    // Validate the user ID format
    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.invalid_user'))],
        ephemeral: true,
      });
    }

    // Attempt to unban
    try {
      await interaction.guild.members.unban(userId, `${reason} | By: ${interaction.user.tag}`);
    } catch (error) {
      console.error('[Unban] Failed to unban user:', error);
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.invalid_user'))],
        ephemeral: true,
      });
    }

    // Try to fetch user info for a better log message
    const unbannedUser = await interaction.client.users.fetch(userId).catch(() => null);
    const userTag = unbannedUser ? unbannedUser.tag : userId;

    // Log the action
    const logEmbed = modEmbed(
      'Unban',
      i18n.t('moderation.unban_success', { user: userTag, reason }) +
      `\n**Moderator:** ${interaction.user.tag}`,
    );
    await moderationManager.logAction(interaction.guild, logEmbed);

    // Reply to the moderator
    return interaction.reply({
      embeds: [successEmbed(
        'Unban',
        i18n.t('moderation.unban_success', { user: userTag, reason }),
      )],
      ephemeral: true,
    });
  },
};
