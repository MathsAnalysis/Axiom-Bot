const { SlashCommandBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const { modEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { isAdmin, hasCommandPermission } = require('../../utils/permissions');
const moderationManager = require('../../modules/moderation/ModerationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Lock all channels (deny SendMessages for @everyone)'),

  async execute(interaction) {
    // Admin-only command
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    if (!hasCommandPermission(interaction.member, 'lockdown')) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    // Defer reply since this may take time
    await interaction.deferReply({ ephemeral: true });

    try {
      // Access the AntiRaid module from the client
      const antiRaid = interaction.client.antiRaid;
      if (antiRaid) {
        await antiRaid.lockdown(interaction.guild);
      } else {
        // Fallback: import and call lockdown directly
        const { AntiRaid } = require('../../modules/moderation/AntiRaid');
        const fallbackRaid = new AntiRaid(interaction.client);
        await fallbackRaid.lockdown(interaction.guild);
        fallbackRaid.destroy();
      }
    } catch (error) {
      console.error('[Lockdown] Failed to activate lockdown:', error);
      return interaction.editReply({
        embeds: [errorEmbed(i18n.t('general.error'))],
      });
    }

    // Log the action
    const logEmbed = modEmbed(
      'Lockdown',
      i18n.t('moderation.lockdown_activated') +
      `\n**Moderator:** ${interaction.user.tag}`,
    );
    await moderationManager.logAction(interaction.guild, logEmbed);

    // Reply to the admin
    return interaction.editReply({
      embeds: [successEmbed('Lockdown', i18n.t('moderation.lockdown_activated'))],
    });
  },
};
