const { SlashCommandBuilder } = require('discord.js');
const i18n = require('../../locales/I18n');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { isStaff } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-remove')
    .setDescription('Remove a user from the current ticket')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to remove from this ticket')
        .setRequired(true),
    ),

  /**
   * Removes a specified user from the current ticket channel.
   * Only staff members can use this command, and it must be run inside a ticket channel.
   *
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    const ticketManager = interaction.client.ticketManager;

    // Staff only
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('tickets.panel_title'), i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    // Validate this is a ticket channel
    if (!ticketManager.isTicketChannel(interaction.channel.id)) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('tickets.panel_title'), i18n.t('tickets.not_a_ticket'))],
        ephemeral: true,
      });
    }

    const user = interaction.options.getUser('user');

    try {
      await ticketManager.removeUser(interaction.channel, user);

      await interaction.reply({
        embeds: [
          successEmbed(
            i18n.t('tickets.panel_title'),
            i18n.t('tickets.user_removed', { user: `<@${user.id}>` }),
          ),
        ],
        ephemeral: true,
      });
    } catch (error) {
      console.error('[Tickets] Failed to remove user:', error);
      await interaction.reply({
        embeds: [errorEmbed(i18n.t('tickets.panel_title'), i18n.t('general.error'))],
        ephemeral: true,
      });
    }
  },
};
