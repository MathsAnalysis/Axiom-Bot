const { SlashCommandBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const config = require('../../config/ConfigManager');
const { modEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { isModerator, canModerate, hasCommandPermission } = require('../../utils/permissions');
const { parseDuration, formatDurationLong } = require('../../utils/duration');
const moderationManager = require('../../modules/moderation/ModerationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to timeout').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('duration')
        .setDescription('Duration of the timeout (e.g. 10m, 1h, 1d)')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the timeout').setRequired(false),
    ),

  async execute(interaction) {
    // Permission checks
    if (!isModerator(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    if (!hasCommandPermission(interaction.member, 'timeout')) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || i18n.t('moderation.no_reason');

    // Parse duration
    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.error'))],
        ephemeral: true,
      });
    }

    // Discord timeouts max at 28 days
    const maxTimeout = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > maxTimeout) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.error'))],
        ephemeral: true,
      });
    }

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

    const durationFormatted = formatDurationLong(durationMs);

    // DM the user before timeout (if configured)
    if (config.get('moderation.dm_on_action')) {
      try {
        const dmEmbed = modEmbed(
          'Timeout',
          i18n.t('moderation.timeout_dm', {
            server: interaction.guild.name,
            duration: durationFormatted,
            reason,
          }),
        );
        await targetUser.send({ embeds: [dmEmbed] }).catch(() => null);
      } catch {
        // DMs may be disabled
      }
    }

    // Apply the timeout
    try {
      await targetMember.timeout(durationMs, `${reason} | By: ${interaction.user.tag}`);
    } catch (error) {
      console.error('[Timeout] Failed to timeout user:', error);
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.error'))],
        ephemeral: true,
      });
    }

    // Log the action
    const logEmbed = modEmbed(
      'Timeout',
      i18n.t('moderation.timeout_success', {
        user: targetUser.tag,
        duration: durationFormatted,
        reason,
      }) + `\n**Moderator:** ${interaction.user.tag}`,
    );
    await moderationManager.logAction(interaction.guild, logEmbed);

    // Reply to the moderator
    return interaction.reply({
      embeds: [successEmbed(
        'Timeout',
        i18n.t('moderation.timeout_success', {
          user: targetUser.tag,
          duration: durationFormatted,
          reason,
        }),
      )],
      ephemeral: true,
    });
  },
};
