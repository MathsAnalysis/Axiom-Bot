const { SlashCommandBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const { isAdmin } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { readJSON, writeJSON } = require('../../utils/fileManager');

const TOXICITY_FILE = 'toxicity.json';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('toxicity-reset')
    .setDescription('Reset toxicity offenses for a user')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('User to reset offenses for').setRequired(true),
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed('Error', i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const user = interaction.options.getUser('user');
    const toxicityData = readJSON(TOXICITY_FILE, {});

    if (toxicityData[user.id]) {
      delete toxicityData[user.id];
      writeJSON(TOXICITY_FILE, toxicityData);
    }

    return interaction.reply({
      embeds: [
        successEmbed('Toxicity', i18n.t('toxicity.reset_success', { user: user.tag })),
      ],
      ephemeral: true,
    });
  },
};
