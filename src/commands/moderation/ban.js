const { SlashCommandBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const config = require('../../config/ConfigManager');
const { modEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { isModerator, canModerate, hasCommandPermission } = require('../../utils/permissions');
const moderationManager = require('../../modules/moderation/ModerationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to ban').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the ban').setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName('delete_days')
        .setDescription('Number of days of messages to delete (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false),
    ),

  async execute(interaction) {
    // Permission checks
    if (!isModerator(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    if (!hasCommandPermission(interaction.member, 'ban')) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || i18n.t('moderation.no_reason');
    const deleteDays = interaction.options.getInteger('delete_days') || 0;

    // Fetch the member from the guild
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    // If the member is in the guild, check moderation hierarchy
    if (targetMember) {
      const moderationCheck = canModerate(interaction.member, targetMember);
      if (!moderationCheck.allowed) {
        return interaction.reply({
          embeds: [errorEmbed(moderationCheck.reason)],
          ephemeral: true,
        });
      }
    }

    // DM the user before banning (if configured)
    if (config.get('moderation.dm_on_action')) {
      try {
        const dmEmbed = modEmbed(
          'Ban',
          i18n.t('moderation.ban_dm', {
            server: interaction.guild.name,
            reason,
          }),
        );
        await targetUser.send({ embeds: [dmEmbed] }).catch(() => null);
      } catch {
        // DMs may be disabled, continue silently
      }
    }

    // Perform the ban
    try {
      await interaction.guild.members.ban(targetUser.id, {
        reason: `${reason} | By: ${interaction.user.tag}`,
        deleteMessageSeconds: deleteDays * 86400,
      });
    } catch (error) {
      console.error('[Ban] Failed to ban user:', error);
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.error'))],
        ephemeral: true,
      });
    }

    // Log the action
    const logEmbed = modEmbed(
      'Ban',
      i18n.t('moderation.ban_success', { user: targetUser.tag, reason }) +
      `\n**Moderator:** ${interaction.user.tag}` +
      `\n**Delete Days:** ${deleteDays}`,
    );
    await moderationManager.logAction(interaction.guild, logEmbed);

    // Reply to the moderator
    return interaction.reply({
      embeds: [successEmbed(
        'Ban',
        i18n.t('moderation.ban_success', { user: targetUser.tag, reason }),
      )],
      ephemeral: true,
    });
  },
};
