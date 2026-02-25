const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config/ConfigManager');
const i18n = require('../../locales/I18n');
const { isAdmin } = require('../../utils/permissions');
const { errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('changelog')
    .setDescription('Post a changelog entry')
    .addStringOption((opt) =>
      opt.setName('version').setDescription('Version number (e.g. 1.2.0)').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('content').setDescription('Changelog content').setRequired(true),
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed('Error', i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const version = interaction.options.getString('version');
    const content = interaction.options.getString('content');

    const channelId = config.get('communication.changelog_channel');
    if (!channelId) {
      return interaction.reply({
        embeds: [errorEmbed('Changelog', i18n.t('general.invalid_channel'))],
        ephemeral: true,
      });
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Changelog', i18n.t('general.invalid_channel'))],
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle(i18n.t('communication.changelog_title', { version }))
      .setDescription(content)
      .setFooter({ text: `${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    // Build message payload
    const messagePayload = { embeds: [embed] };

    // Optionally mention the changelog role
    const mentionRoleId = config.get('communication.changelog_mention_role');
    if (mentionRoleId) {
      messagePayload.content = `<@&${mentionRoleId}>`;
    }

    await channel.send(messagePayload);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#2ECC71')
          .setTitle('Changelog')
          .setDescription(i18n.t('general.action_success'))
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  },
};
