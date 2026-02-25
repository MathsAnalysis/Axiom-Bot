const { SlashCommandBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const config = require('../../config/ConfigManager');
const { modEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { isModerator, canModerate, hasCommandPermission } = require('../../utils/permissions');
const moderationManager = require('../../modules/moderation/ModerationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to kick').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the kick').setRequired(false),
    ),

  async execute(interaction) {
    // Permission checks
    if (!isModerator(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    if (!hasCommandPermission(interaction.member, 'kick')) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || i18n.t('moderation.no_reason');

    // Fetch the target member
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

    // DM the user before kicking (if configured)
    if (config.get('moderation.dm_on_action')) {
      try {
        const dmEmbed = modEmbed(
          'Kick',
          i18n.t('moderation.kick_dm', {
            server: interaction.guild.name,
            reason,
          }),
        );
        await targetUser.send({ embeds: [dmEmbed] }).catch(() => null);
      } catch {
        // DMs may be disabled, continue silently
      }
    }

    // Perform the kick
    try {
      await targetMember.kick(`${reason} | By: ${interaction.user.tag}`);
    } catch (error) {
      console.error('[Kick] Failed to kick user:', error);
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.error'))],
        ephemeral: true,
      });
    }

    // Log the action
    const logEmbed = modEmbed(
      'Kick',
      i18n.t('moderation.kick_success', { user: targetUser.tag, reason }) +
      `\n**Moderator:** ${interaction.user.tag}`,
    );
    await moderationManager.logAction(interaction.guild, logEmbed);

    // Reply to the moderator
    return interaction.reply({
      embeds: [successEmbed(
        'Kick',
        i18n.t('moderation.kick_success', { user: targetUser.tag, reason }),
      )],
      ephemeral: true,
    });
  },
};
