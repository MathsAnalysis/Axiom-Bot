const { SlashCommandBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const { modEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { isModerator, hasCommandPermission } = require('../../utils/permissions');
const moderationManager = require('../../modules/moderation/ModerationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unwarn')
    .setDescription('Remove a specific warning from a user')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to remove the warning from').setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('warn_id')
        .setDescription('The warning ID to remove')
        .setMinValue(1)
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

    if (!hasCommandPermission(interaction.member, 'unwarn')) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const warnId = interaction.options.getInteger('warn_id');

    // Attempt to remove the warning
    const removed = moderationManager.removeWarn(
      interaction.guild.id,
      targetUser.id,
      warnId,
    );

    if (!removed) {
      return interaction.reply({
        embeds: [errorEmbed(
          i18n.t('moderation.unwarn_not_found', { id: warnId, user: targetUser.tag }),
        )],
        ephemeral: true,
      });
    }

    // Log the action
    const logEmbed = modEmbed(
      'Unwarn',
      i18n.t('moderation.unwarn_success', { id: warnId, user: targetUser.tag }) +
      `\n**Moderator:** ${interaction.user.tag}`,
    );
    await moderationManager.logAction(interaction.guild, logEmbed);

    // Reply to the moderator
    return interaction.reply({
      embeds: [successEmbed(
        'Unwarn',
        i18n.t('moderation.unwarn_success', { id: warnId, user: targetUser.tag }),
      )],
      ephemeral: true,
    });
  },
};
