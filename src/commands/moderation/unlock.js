const { SlashCommandBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const { modEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { isAdmin, hasCommandPermission } = require('../../utils/permissions');
const moderationManager = require('../../modules/moderation/ModerationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock all channels (remove SendMessages deny for @everyone)'),

  async execute(interaction) {
    // Admin-only command
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    if (!hasCommandPermission(interaction.member, 'unlock')) {
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
        await antiRaid.unlock(interaction.guild);
      } else {
        // Fallback: import and call unlock directly
        const { AntiRaid } = require('../../modules/moderation/AntiRaid');
        const fallbackRaid = new AntiRaid(interaction.client);
        await fallbackRaid.unlock(interaction.guild);
        fallbackRaid.destroy();
      }
    } catch (error) {
      console.error('[Unlock] Failed to deactivate lockdown:', error);
      return interaction.editReply({
        embeds: [errorEmbed(i18n.t('general.error'))],
      });
    }

    // Log the action
    const logEmbed = modEmbed(
      'Unlock',
      i18n.t('moderation.lockdown_deactivated') +
      `\n**Moderator:** ${interaction.user.tag}`,
    );
    await moderationManager.logAction(interaction.guild, logEmbed);

    // Reply to the admin
    return interaction.editReply({
      embeds: [successEmbed('Unlock', i18n.t('moderation.lockdown_deactivated'))],
    });
  },
};
