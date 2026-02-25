const { SlashCommandBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const config = require('../../config/ConfigManager');
const { modEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { isModerator, canModerate, hasCommandPermission } = require('../../utils/permissions');
const moderationManager = require('../../modules/moderation/ModerationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to warn').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the warning').setRequired(true),
    ),

  async execute(interaction) {
    // Permission checks
    if (!isModerator(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    if (!hasCommandPermission(interaction.member, 'warn')) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

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

    // Add the warning
    const warn = moderationManager.addWarn(
      interaction.guild.id,
      targetUser.id,
      reason,
      interaction.user.id,
    );

    const warnCount = moderationManager.getWarnings(
      interaction.guild.id,
      targetUser.id,
    ).length;

    // DM the user (if configured)
    if (config.get('moderation.dm_on_action')) {
      try {
        const dmEmbed = modEmbed(
          'Warning',
          i18n.t('moderation.warn_dm', {
            server: interaction.guild.name,
            reason,
          }) + '\n' + i18n.t('moderation.warn_count', { count: warnCount }),
        );
        await targetUser.send({ embeds: [dmEmbed] }).catch(() => null);
      } catch {
        // DMs may be disabled
      }
    }

    // Log the action
    const logEmbed = modEmbed(
      `Warning #${warn.id}`,
      i18n.t('moderation.warn_success', { user: targetUser.tag, reason }) +
      '\n' + i18n.t('moderation.warn_count', { count: warnCount }) +
      `\n**Moderator:** ${interaction.user.tag}`,
    );
    await moderationManager.logAction(interaction.guild, logEmbed);

    // Check thresholds for automatic escalation
    await moderationManager.checkThresholds(interaction.guild, targetMember, warnCount);

    // Reply to the moderator
    return interaction.reply({
      embeds: [successEmbed(
        `Warning #${warn.id}`,
        i18n.t('moderation.warn_success', { user: targetUser.tag, reason }) +
        '\n' + i18n.t('moderation.warn_count', { count: warnCount }),
      )],
      ephemeral: true,
    });
  },
};
