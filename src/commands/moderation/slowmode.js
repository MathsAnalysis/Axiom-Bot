const { SlashCommandBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const { modEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { isModerator, hasCommandPermission } = require('../../utils/permissions');
const moderationManager = require('../../modules/moderation/ModerationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode for the current channel')
    .addIntegerOption((option) =>
      option
        .setName('seconds')
        .setDescription('Slowmode interval in seconds (0 to disable, max 21600)')
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true),
    ),

  async execute(interaction) {
    // Permission checks
    if (!isModerator(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    if (!hasCommandPermission(interaction.member, 'slowmode')) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const seconds = interaction.options.getInteger('seconds');

    // Apply slowmode
    try {
      await interaction.channel.setRateLimitPerUser(
        seconds,
        `Set by ${interaction.user.tag}`,
      );
    } catch (error) {
      console.error('[Slowmode] Failed to set slowmode:', error);
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.error'))],
        ephemeral: true,
      });
    }

    // Build response message
    const responseText = seconds === 0
      ? i18n.t('moderation.slowmode_disabled')
      : i18n.t('moderation.slowmode_success', { seconds });

    // Log the action
    const logEmbed = modEmbed(
      'Slowmode',
      responseText +
      `\n**Channel:** <#${interaction.channel.id}>` +
      `\n**Moderator:** ${interaction.user.tag}`,
    );
    await moderationManager.logAction(interaction.guild, logEmbed);

    // Reply to the moderator
    return interaction.reply({
      embeds: [successEmbed('Slowmode', responseText)],
      ephemeral: true,
    });
  },
};
