const { SlashCommandBuilder, ChannelType } = require('discord.js');
const config = require('../../config/ConfigManager');
const i18n = require('../../locales/I18n');
const { isAdmin } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('toxicity-channel')
    .setDescription('Set the toxicity log channel')
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Channel for toxicity logs')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed('Error', i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const channel = interaction.options.getChannel('channel');
    config.set('toxicity.log_channel', channel.id);

    return interaction.reply({
      embeds: [
        successEmbed('Toxicity', i18n.t('toxicity.channel_set', { channel: `${channel}` })),
      ],
      ephemeral: true,
    });
  },
};
