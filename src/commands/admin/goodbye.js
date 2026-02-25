const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const config = require('../../config/ConfigManager');
const i18n = require('../../locales/I18n');
const { isAdmin } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('goodbye')
    .setDescription('Configure goodbye messages')
    .addSubcommand((sub) =>
      sub.setName('toggle').setDescription('Enable or disable goodbye messages'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Set the goodbye channel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel for goodbye messages')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('message')
        .setDescription('Set the goodbye message (supports {user}, {server}, {memberCount})')
        .addStringOption((opt) =>
          opt.setName('text').setDescription('Goodbye message text').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('color')
        .setDescription('Set the goodbye embed color')
        .addStringOption((opt) =>
          opt.setName('hex').setDescription('Hex color code (e.g. #E74C3C)').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('preview').setDescription('Preview the current goodbye message'),
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
      case 'toggle': {
        const current = config.get('goodbye.enabled');
        config.set('goodbye.enabled', !current);

        const messageKey = !current ? 'goodbye.toggle_on' : 'goodbye.toggle_off';
        return interaction.reply({
          embeds: [successEmbed('Goodbye', i18n.t(messageKey))],
          ephemeral: true,
        });
      }

      case 'channel': {
        const channel = interaction.options.getChannel('channel');
        config.set('goodbye.channel', channel.id);

        return interaction.reply({
          embeds: [
            successEmbed(
              'Goodbye',
              i18n.t('general.config_updated', { key: 'goodbye.channel', value: `${channel}` }),
            ),
          ],
          ephemeral: true,
        });
      }

      case 'message': {
        const text = interaction.options.getString('text');
        config.set('goodbye.message', text);

        return interaction.reply({
          embeds: [
            successEmbed(
              'Goodbye',
              i18n.t('general.config_updated', { key: 'goodbye.message', value: text }),
            ),
          ],
          ephemeral: true,
        });
      }

      case 'color': {
        const hex = interaction.options.getString('hex');

        if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
          return interaction.reply({
            embeds: [errorEmbed('Goodbye', 'Invalid hex color. Use format: `#RRGGBB`')],
            ephemeral: true,
          });
        }

        config.set('goodbye.color', hex);

        return interaction.reply({
          embeds: [
            successEmbed(
              'Goodbye',
              i18n.t('general.config_updated', { key: 'goodbye.color', value: hex }),
            ),
          ],
          ephemeral: true,
        });
      }

      case 'preview': {
        const title = config.get('goodbye.title') || 'Goodbye!';
        const message = config.get('goodbye.message') || '{user} has left **{server}**.';
        const color = config.get('goodbye.color') || '#E74C3C';
        const image = config.get('goodbye.image') || '';
        const thumbnail = config.get('goodbye.thumbnail') || '';

        const formattedMessage = message
          .replace(/\{user\}/g, `${interaction.user}`)
          .replace(/\{server\}/g, interaction.guild.name)
          .replace(/\{memberCount\}/g, String(interaction.guild.memberCount));

        const embed = new EmbedBuilder()
          .setColor(color)
          .setTitle(title)
          .setDescription(formattedMessage)
          .setTimestamp();

        if (image) embed.setImage(image);
        if (thumbnail) embed.setThumbnail(thumbnail);

        return interaction.reply({
          content: '*Preview:*',
          embeds: [embed],
          ephemeral: true,
        });
      }

      default:
        break;
    }
  },
};
