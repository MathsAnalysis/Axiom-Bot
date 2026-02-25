const { SlashCommandBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const { modEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { isModerator, canModerate, hasCommandPermission } = require('../../utils/permissions');
const moderationManager = require('../../modules/moderation/ModerationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute a user (remove timeout)')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to unmute').setRequired(true),
    ),

  async execute(interaction) {
    // Permission checks
    if (!isModerator(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    if (!hasCommandPermission(interaction.member, 'unmute')) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('user');

    // Fetch target member
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.invalid_user'))],
        ephemeral: true,
      });
    }

    // Check moderation hierarchy
    const moderationCheck = canModerate(interaction.member, targetMember);
    if (!moderationCheck.allowed) {
      return interaction.reply({
        embeds: [errorEmbed(moderationCheck.reason)],
        ephemeral: true,
      });
    }

    // Remove the timeout
    try {
      await targetMember.timeout(null, `Unmuted by ${interaction.user.tag}`);
    } catch (error) {
      console.error('[Unmute] Failed to unmute user:', error);
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.error'))],
        ephemeral: true,
      });
    }

    // Log the action
    const logEmbed = modEmbed(
      'Unmute',
      i18n.t('moderation.unmute_success', { user: targetUser.tag }) +
      `\n**Moderator:** ${interaction.user.tag}`,
    );
    await moderationManager.logAction(interaction.guild, logEmbed);

    // Reply to the moderator
    return interaction.reply({
      embeds: [successEmbed(
        'Unmute',
        i18n.t('moderation.unmute_success', { user: targetUser.tag }),
      )],
      ephemeral: true,
    });
  },
};
