const { SlashCommandBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const { modEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { isModerator, hasCommandPermission } = require('../../utils/permissions');
const moderationManager = require('../../modules/moderation/ModerationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages from a channel')
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    )
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Only delete messages from this user')
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

    if (!hasCommandPermission(interaction.member, 'purge')) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const amount = interaction.options.getInteger('amount');
    const filterUser = interaction.options.getUser('user');

    // Defer the reply since fetching/deleting can take time
    await interaction.deferReply({ ephemeral: true });

    try {
      let deletedCount = 0;

      if (filterUser) {
        // Fetch messages and filter by user, then bulk delete
        const fetched = await interaction.channel.messages.fetch({ limit: 100 });
        const userMessages = fetched
          .filter((msg) => msg.author.id === filterUser.id)
          .first(amount);

        if (userMessages.length > 0) {
          const deleted = await interaction.channel.bulkDelete(userMessages, true);
          deletedCount = deleted.size;
        }
      } else {
        // Bulk delete without user filter
        const deleted = await interaction.channel.bulkDelete(amount, true);
        deletedCount = deleted.size;
      }

      // Log the action
      const logDescription = filterUser
        ? `**Channel:** <#${interaction.channel.id}>\n**Amount:** ${deletedCount}\n**Filter:** ${filterUser.tag}\n**Moderator:** ${interaction.user.tag}`
        : `**Channel:** <#${interaction.channel.id}>\n**Amount:** ${deletedCount}\n**Moderator:** ${interaction.user.tag}`;

      const logEmbed = modEmbed('Purge', logDescription);
      await moderationManager.logAction(interaction.guild, logEmbed);

      // Reply to the moderator
      return interaction.editReply({
        embeds: [successEmbed(
          'Purge',
          i18n.t('moderation.purge_success', { count: deletedCount }),
        )],
      });
    } catch (error) {
      console.error('[Purge] Failed to purge messages:', error);
      return interaction.editReply({
        embeds: [errorEmbed(i18n.t('general.error'))],
      });
    }
  },
};
