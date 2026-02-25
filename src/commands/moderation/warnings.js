const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const { errorEmbed } = require('../../utils/embeds');
const { isModerator, hasCommandPermission } = require('../../utils/permissions');
const config = require('../../config/ConfigManager');
const moderationManager = require('../../modules/moderation/ModerationManager');

const WARNINGS_PER_PAGE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a user')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to check warnings for').setRequired(true),
    ),

  async execute(interaction) {
    // Permission checks
    if (!isModerator(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    if (!hasCommandPermission(interaction.member, 'warnings')) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const warnings = moderationManager.getWarnings(interaction.guild.id, targetUser.id);

    // No warnings
    if (warnings.length === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.get('embed_colors.info') || '#3498DB')
            .setTitle(i18n.t('moderation.warnings_title', { user: targetUser.tag }))
            .setDescription(i18n.t('moderation.warnings_empty', { user: targetUser.tag }))
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // Build paginated embeds
    const totalPages = Math.ceil(warnings.length / WARNINGS_PER_PAGE);
    const embeds = [];

    for (let page = 0; page < totalPages; page++) {
      const start = page * WARNINGS_PER_PAGE;
      const end = start + WARNINGS_PER_PAGE;
      const pageWarnings = warnings.slice(start, end);

      const lines = pageWarnings.map((w) => {
        const date = new Date(w.timestamp);
        const dateStr = date.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        return `**#${w.id}** - ${w.reason}\n  Mod: <@${w.moderator}> | ${dateStr}`;
      });

      const embed = new EmbedBuilder()
        .setColor(config.get('embed_colors.moderation') || '#E67E22')
        .setTitle(i18n.t('moderation.warnings_title', { user: targetUser.tag }))
        .setDescription(lines.join('\n\n'))
        .setFooter({
          text: totalPages > 1
            ? `Page ${page + 1}/${totalPages} | Total: ${warnings.length}`
            : `Total: ${warnings.length}`,
        })
        .setTimestamp();

      embeds.push(embed);
    }

    // Send the first page (Discord allows up to 10 embeds per message)
    // For simplicity, send only the first page in the reply
    return interaction.reply({
      embeds: [embeds[0]],
      ephemeral: true,
    });
  },
};
