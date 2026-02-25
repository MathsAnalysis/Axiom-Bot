const { SlashCommandBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const { isAdmin } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('language')
    .setDescription('Change the bot language')
    .addStringOption((opt) =>
      opt
        .setName('lang')
        .setDescription('Language to set')
        .setRequired(true)
        .addChoices(
          { name: 'Italiano', value: 'it' },
          { name: 'English', value: 'en' },
        ),
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed('Error', i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const lang = interaction.options.getString('lang');
    const success = i18n.setLanguage(lang);

    if (!success) {
      return interaction.reply({
        embeds: [errorEmbed('Language', i18n.t('general.language_invalid'))],
        ephemeral: true,
      });
    }

    return interaction.reply({
      embeds: [successEmbed('Language', i18n.t('general.language_changed', { lang }))],
      ephemeral: true,
    });
  },
};
