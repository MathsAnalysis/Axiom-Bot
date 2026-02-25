const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const config = require('../../config/ConfigManager');
const i18n = require('../../locales/I18n');
const { isAdmin } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post an announcement')
    .addStringOption((opt) =>
      opt.setName('title').setDescription('Announcement title').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('message').setDescription('Announcement message').setRequired(true),
    )
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Channel to send to (defaults to configured announce channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false),
    )
    .addRoleOption((opt) =>
      opt.setName('mention').setDescription('Role to mention').setRequired(false),
    )
    .addStringOption((opt) =>
      opt.setName('color').setDescription('Embed color hex (e.g. #3498DB)').setRequired(false),
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed('Error', i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const title = interaction.options.getString('title');
    const message = interaction.options.getString('message');
    const channelOption = interaction.options.getChannel('channel');
    const mentionRole = interaction.options.getRole('mention');
    const colorOption = interaction.options.getString('color');

    // Determine target channel
    const targetChannelId = channelOption
      ? channelOption.id
      : config.get('communication.announce_channel');

    if (!targetChannelId) {
      return interaction.reply({
        embeds: [errorEmbed('Announce', i18n.t('general.invalid_channel'))],
        ephemeral: true,
      });
    }

    const targetChannel = await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
    if (!targetChannel || !targetChannel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Announce', i18n.t('general.invalid_channel'))],
        ephemeral: true,
      });
    }

    // Determine color
    let color = config.get('communication.announce_default_color') || '#3498DB';
    if (colorOption) {
      if (/^#[0-9A-Fa-f]{6}$/.test(colorOption)) {
        color = colorOption;
      } else {
        return interaction.reply({
          embeds: [errorEmbed('Announce', 'Invalid hex color. Use format: `#RRGGBB`')],
          ephemeral: true,
        });
      }
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(message)
      .setFooter({ text: `${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    // Build message payload
    const messagePayload = { embeds: [embed] };

    if (mentionRole) {
      messagePayload.content = `${mentionRole}`;
    }

    await targetChannel.send(messagePayload);

    return interaction.reply({
      embeds: [successEmbed('Announce', i18n.t('general.action_success'))],
      ephemeral: true,
    });
  },
};
