const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const config = require('../../config/ConfigManager');
const i18n = require('../../locales/I18n');
const { isAdmin } = require('../../utils/permissions');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure welcome messages')
    .addSubcommand((sub) =>
      sub.setName('toggle').setDescription('Enable or disable welcome messages'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Set the welcome channel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel for welcome messages')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('message')
        .setDescription('Set the welcome message (supports {user}, {server}, {memberCount})')
        .addStringOption((opt) =>
          opt.setName('text').setDescription('Welcome message text').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('color')
        .setDescription('Set the welcome embed color')
        .addStringOption((opt) =>
          opt.setName('hex').setDescription('Hex color code (e.g. #2ECC71)').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('preview').setDescription('Preview the current welcome message'),
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
        const current = config.get('welcome.enabled');
        config.set('welcome.enabled', !current);

        const messageKey = !current ? 'welcome.toggle_on' : 'welcome.toggle_off';
        return interaction.reply({
          embeds: [successEmbed('Welcome', i18n.t(messageKey))],
          ephemeral: true,
        });
      }

      case 'channel': {
        const channel = interaction.options.getChannel('channel');
        config.set('welcome.channel', channel.id);

        return interaction.reply({
          embeds: [
            successEmbed(
              'Welcome',
              i18n.t('general.config_updated', { key: 'welcome.channel', value: `${channel}` }),
            ),
          ],
          ephemeral: true,
        });
      }

      case 'message': {
        const text = interaction.options.getString('text');
        config.set('welcome.message', text);

        return interaction.reply({
          embeds: [
            successEmbed(
              'Welcome',
              i18n.t('general.config_updated', { key: 'welcome.message', value: text }),
            ),
          ],
          ephemeral: true,
        });
      }

      case 'color': {
        const hex = interaction.options.getString('hex');

        // Validate hex color
        if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
          return interaction.reply({
            embeds: [errorEmbed('Welcome', 'Invalid hex color. Use format: `#RRGGBB`')],
            ephemeral: true,
          });
        }

        config.set('welcome.color', hex);

        return interaction.reply({
          embeds: [
            successEmbed(
              'Welcome',
              i18n.t('general.config_updated', { key: 'welcome.color', value: hex }),
            ),
          ],
          ephemeral: true,
        });
      }

      case 'preview': {
        const title = config.get('welcome.title') || 'Welcome!';
        const message = config.get('welcome.message') || 'Welcome {user} to **{server}**!';
        const color = config.get('welcome.color') || '#2ECC71';
        const image = config.get('welcome.image') || '';
        const thumbnail = config.get('welcome.thumbnail') || '';

        // Replace placeholders with preview values
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
