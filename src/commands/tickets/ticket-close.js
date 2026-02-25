const { SlashCommandBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const { errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-close')
    .setDescription('Close the current ticket channel')
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason for closing the ticket')
        .setRequired(false),
    ),

  /**
   * Closes the ticket channel where the command is executed.
   * Validates that the current channel is indeed a ticket channel.
   *
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    const ticketManager = interaction.client.ticketManager;

    // Validate this is a ticket channel
    if (!ticketManager.isTicketChannel(interaction.channel.id)) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('tickets.panel_title'), i18n.t('tickets.not_a_ticket'))],
        ephemeral: true,
      });
    }

    const reason = interaction.options.getString('reason') || null;

    // Acknowledge immediately
    await interaction.deferReply({ ephemeral: true });

    // Close the ticket
    await ticketManager.closeTicket(interaction.channel, interaction.user, reason);
  },
};
