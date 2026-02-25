const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const i18n = require('../../locales/I18n');
const { ticketEmbed, errorEmbed } = require('../../utils/embeds');
const { isAdmin } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Send the ticket panel with the Open Ticket button in the current channel'),

  /**
   * Sends the ticket panel embed with a button to open a new ticket.
   * Restricted to admin users only.
   *
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    // Permission check: admin only
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('tickets.panel_title'), i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    // Build the panel embed
    const embed = ticketEmbed(
      i18n.t('tickets.panel_title'),
      i18n.t('tickets.panel_description'),
    );

    // Build the Open Ticket button
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_open')
        .setLabel(i18n.t('tickets.open_button'))
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📩'),
    );

    // Send the panel in the current channel (not as a reply)
    await interaction.channel.send({
      embeds: [embed],
      components: [row],
    });

    // Confirm to the admin
    await interaction.reply({
      embeds: [ticketEmbed(i18n.t('tickets.panel_title'), i18n.t('general.action_success'))],
      ephemeral: true,
    });
  },
};
