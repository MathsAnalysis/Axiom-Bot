const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const config = require('../config/ConfigManager');
const i18n = require('../locales/I18n');
const { errorEmbed } = require('../utils/embeds');
const { hasCommandPermission } = require('../utils/permissions');

module.exports = {
  name: 'interactionCreate',

  /**
   * Central interaction dispatcher.
   * Routes slash commands, button clicks, select menus, and modal submissions
   * to the appropriate handler.
   *
   * @param {import('discord.js').Interaction} interaction
   * @param {import('discord.js').Client} client
   */
  async execute(interaction, client) {
    try {
      // --- Slash commands ---
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        // Check command-level permissions
        if (interaction.member && !hasCommandPermission(interaction.member, interaction.commandName)) {
          return interaction.reply({
            embeds: [errorEmbed(interaction.commandName, i18n.t('general.no_permission'))],
            ephemeral: true,
          });
        }

        try {
          await command.execute(interaction);
        } catch (error) {
          console.error(`[Commands] Error executing /${interaction.commandName}:`, error);
          const reply = {
            embeds: [errorEmbed(interaction.commandName, i18n.t('general.error'))],
            ephemeral: true,
          };
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
          } else {
            await interaction.reply(reply);
          }
        }
        return;
      }

      // --- Button interactions ---
      if (interaction.isButton()) {
        await handleButton(interaction, client);
        return;
      }

      // --- String select menu interactions ---
      if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(interaction, client);
        return;
      }

      // --- Modal submissions ---
      if (interaction.isModalSubmit()) {
        await handleModal(interaction, client);
        return;
      }
    } catch (error) {
      console.error('[Interaction] Unhandled error:', error);
      try {
        const reply = {
          embeds: [errorEmbed('Error', i18n.t('general.error'))],
          ephemeral: true,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      } catch {
        // Interaction may have expired, nothing we can do
      }
    }
  },
};

/**
 * Handles button interactions for the ticket system.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleButton(interaction, client) {
  const { customId } = interaction;

  // --- Open Ticket button: show category select menu ---
  if (customId === 'ticket_open') {
    const categories = config.get('tickets.categories') || {};
    const categoryKeys = Object.keys(categories);

    if (categoryKeys.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('tickets.panel_title'), i18n.t('general.error'))],
        ephemeral: true,
      });
    }

    const options = categoryKeys.map((key) => {
      const cat = categories[key];
      const option = {
        label: cat.label || key,
        value: key,
        description: cat.description || '',
      };
      if (cat.emoji) {
        option.emoji = cat.emoji;
      }
      return option;
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('ticket_select_category')
      .setPlaceholder(i18n.t('tickets.select_placeholder'))
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return interaction.reply({
      content: i18n.t('tickets.select_category'),
      components: [row],
      ephemeral: true,
    });
  }

  // --- Claim Ticket button ---
  if (customId === 'ticket_claim') {
    return client.ticketManager.claimTicket(interaction);
  }

  // --- Close Ticket button ---
  if (customId === 'ticket_close') {
    const ticketManager = client.ticketManager;

    if (!ticketManager.isTicketChannel(interaction.channel.id)) {
      return;
    }

    // Show a modal asking for a close reason
    const modal = new ModalBuilder()
      .setCustomId('ticket_close_modal')
      .setTitle(i18n.t('tickets.close_confirm_title'));

    const reasonInput = new TextInputBuilder()
      .setCustomId('close_reason')
      .setLabel(i18n.t('tickets.close_reason_label'))
      .setPlaceholder(i18n.t('tickets.close_reason_placeholder'))
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

    return interaction.showModal(modal);
  }
}

/**
 * Handles select menu interactions for ticket category selection.
 *
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleSelectMenu(interaction, client) {
  const { customId } = interaction;

  if (customId === 'ticket_select_category') {
    const selectedCategory = interaction.values[0];

    // Show the ticket details modal
    const modal = new ModalBuilder()
      .setCustomId(`ticket_modal_${selectedCategory}`)
      .setTitle(i18n.t('tickets.modal_title'));

    const subjectInput = new TextInputBuilder()
      .setCustomId('ticket_subject')
      .setLabel(i18n.t('tickets.modal_subject'))
      .setPlaceholder(i18n.t('tickets.modal_subject_placeholder'))
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(100);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('ticket_description')
      .setLabel(i18n.t('tickets.modal_description'))
      .setPlaceholder(i18n.t('tickets.modal_description_placeholder'))
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(subjectInput),
      new ActionRowBuilder().addComponents(descriptionInput),
    );

    return interaction.showModal(modal);
  }
}

/**
 * Handles modal submissions for ticket creation and closure.
 *
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleModal(interaction, client) {
  const { customId } = interaction;

  // --- Ticket creation modal ---
  if (customId.startsWith('ticket_modal_')) {
    const category = customId.replace('ticket_modal_', '');
    const subject = interaction.fields.getTextInputValue('ticket_subject');
    const description = interaction.fields.getTextInputValue('ticket_description') || '';

    await client.ticketManager.openTicket(interaction, category, subject, description);
    return;
  }

  // --- Close ticket modal ---
  if (customId === 'ticket_close_modal') {
    const reason = interaction.fields.getTextInputValue('close_reason') || null;
    const ticketManager = client.ticketManager;

    if (!ticketManager.isTicketChannel(interaction.channel.id)) {
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    await ticketManager.closeTicket(interaction.channel, interaction.user, reason);
  }
}
