const { SlashCommandBuilder, ChannelType } = require('discord.js');
const config = require('../../config/ConfigManager');
const i18n = require('../../locales/I18n');
const { isAdmin } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

const LOG_TYPES = ['message', 'join', 'moderation', 'voice'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('log')
    .setDescription('Configure log channels')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set a log channel for a specific type')
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('Log type')
            .setRequired(true)
            .addChoices(
              { name: 'Message', value: 'message' },
              { name: 'Join/Leave', value: 'join' },
              { name: 'Moderation', value: 'moderation' },
              { name: 'Voice', value: 'voice' },
            ),
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel for logs')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('disable')
        .setDescription('Disable a log type')
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('Log type to disable')
            .setRequired(true)
            .addChoices(
              { name: 'Message', value: 'message' },
              { name: 'Join/Leave', value: 'join' },
              { name: 'Moderation', value: 'moderation' },
              { name: 'Voice', value: 'voice' },
            ),
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
        const type = interaction.options.getString('type');
        const channel = interaction.options.getChannel('channel');

        if (!LOG_TYPES.includes(type)) {
          return interaction.reply({
            embeds: [errorEmbed('Log', `Invalid log type. Valid types: ${LOG_TYPES.join(', ')}`)],
            ephemeral: true,
          });
        }

        config.set(`logging.${type}_channel`, channel.id);

        return interaction.reply({
          embeds: [
            successEmbed(
              'Log',
              i18n.t('logging.channel_set', { type, channel: `${channel}` }),
            ),
          ],
          ephemeral: true,
        });
      }

      case 'disable': {
        const type = interaction.options.getString('type');

        if (!LOG_TYPES.includes(type)) {
          return interaction.reply({
            embeds: [errorEmbed('Log', `Invalid log type. Valid types: ${LOG_TYPES.join(', ')}`)],
            ephemeral: true,
          });
        }

        config.set(`logging.${type}_channel`, '');

        return interaction.reply({
          embeds: [
            successEmbed('Log', i18n.t('logging.channel_disabled', { type })),
          ],
          ephemeral: true,
        });
      }

      default:
        break;
    }
  },
};
