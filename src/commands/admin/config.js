const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config/ConfigManager');
const i18n = require('../../locales/I18n');
const { isAdmin } = require('../../utils/permissions');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Manage bot configuration')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set a configuration value')
        .addStringOption((opt) =>
          opt.setName('key').setDescription('Configuration key (e.g. toxicity.threshold)').setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName('value').setDescription('Value to set').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('get')
        .setDescription('Get a configuration value')
        .addStringOption((opt) =>
          opt.setName('key').setDescription('Configuration key (e.g. toxicity.threshold)').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('Reset a configuration value to its default')
        .addStringOption((opt) =>
          opt.setName('key').setDescription('Configuration key (e.g. toxicity.threshold)').setRequired(true),
        ),
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed('Error', i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'set': {
        const key = interaction.options.getString('key');
        const value = interaction.options.getString('value');
        const parsed = config.set(key, value);

        return interaction.reply({
          embeds: [
            successEmbed(
              'Config',
              i18n.t('general.config_updated', {
                key,
                value: typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed),
              }),
            ),
          ],
          ephemeral: true,
        });
      }

      case 'get': {
        const key = interaction.options.getString('key');
        const value = config.get(key);

        if (value === undefined) {
          return interaction.reply({
            embeds: [errorEmbed('Config', i18n.t('general.config_key_not_found', { key }))],
            ephemeral: true,
          });
        }

        const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);

        return interaction.reply({
          embeds: [infoEmbed('Config', i18n.t('general.config_value', { key, value: displayValue }))],
          ephemeral: true,
        });
      }

      case 'reset': {
        const key = interaction.options.getString('key');
        const defaultValue = config.reset(key);

        if (defaultValue === undefined) {
          return interaction.reply({
            embeds: [errorEmbed('Config', i18n.t('general.config_key_not_found', { key }))],
            ephemeral: true,
          });
        }

        return interaction.reply({
          embeds: [successEmbed('Config', i18n.t('general.config_reset', { key }))],
          ephemeral: true,
        });
      }

      default:
        break;
    }
  },
};
