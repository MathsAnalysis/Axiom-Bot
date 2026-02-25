const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require('discord.js');
const config = require('../../config/ConfigManager');
const i18n = require('../../locales/I18n');
const { ticketEmbed, logEmbed, successEmbed, warnEmbed } = require('../../utils/embeds');
const { isStaff } = require('../../utils/permissions');
const { readJSON, writeJSON } = require('../../utils/fileManager');
const { TranscriptGenerator } = require('./TranscriptGenerator');

const DATA_FILE = 'tickets.json';
const AUTO_CLOSE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

class TicketManager {
  /**
   * @param {import('discord.js').Client} client
   */
  constructor(client) {
    this.client = client;
    this.transcriptGenerator = new TranscriptGenerator();

    // Load persisted ticket data
    const stored = readJSON(DATA_FILE, { tickets: {} });
    this.tickets = stored.tickets || {};

    // Start the auto-close checker interval
    this._autoCloseInterval = setInterval(() => {
      this._checkAutoClose().catch((err) => {
        console.error('[Tickets] Auto-close check error:', err);
      });
    }, AUTO_CLOSE_CHECK_INTERVAL_MS);

    console.log(`[Tickets] Loaded ${Object.keys(this.tickets).length} active tickets.`);
  }

  /**
   * Persists all ticket data to disk.
   */
  _save() {
    writeJSON(DATA_FILE, { tickets: this.tickets });
  }

  /**
   * Opens a new ticket for the user.
   *
   * @param {import('discord.js').Interaction} interaction - The interaction that triggered this
   * @param {string} category - The ticket category key (e.g. 'technical')
   * @param {string} subject - Short subject line
   * @param {string} description - Detailed description
   * @returns {Promise<import('discord.js').TextChannel|null>} The created channel, or null on failure
   */
  async openTicket(interaction, category, subject, description) {
    const guild = interaction.guild;
    const user = interaction.user;
    const member = interaction.member;

    // Check if tickets are enabled
    if (!config.get('tickets.enabled')) {
      return null;
    }

    // Check max tickets per user
    const maxPerUser = config.get('tickets.max_per_user') || 3;
    const openTickets = this.getOpenTickets(user.id);
    if (openTickets.length >= maxPerUser) {
      await interaction.reply({
        embeds: [
          warnEmbed(
            i18n.t('tickets.panel_title'),
            i18n.t('tickets.max_tickets', { max: maxPerUser }),
          ),
        ],
        ephemeral: true,
      });
      return null;
    }

    // Increment counter
    const currentCounter = config.get('tickets.counter') || 0;
    const ticketNumber = currentCounter + 1;
    config.set('tickets.counter', ticketNumber);

    // Resolve the category config for display
    const categoryConfig = config.get(`tickets.categories.${category}`) || {};
    const categoryLabel = categoryConfig.label || category;

    // Channel name
    const channelName = `ticket-${String(ticketNumber).padStart(4, '0')}`;

    // Determine parent category channel
    const categoryId = config.get('tickets.category_id') || null;

    try {
      // Build permission overwrites
      const permissionOverwrites = [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: this.client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ];

      // Add staff/mod/admin role overwrites so staff can see all tickets
      const staffRoles = config.get('permissions.staff_roles') || [];
      const modRoles = config.get('permissions.moderator_roles') || [];
      const adminRoles = config.get('permissions.admin_roles') || [];
      const allStaffRoles = [...new Set([...staffRoles, ...modRoles, ...adminRoles])];

      for (const roleId of allStaffRoles) {
        if (guild.roles.cache.has(roleId)) {
          permissionOverwrites.push({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          });
        }
      }

      // Create the channel
      const channelOptions = {
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites,
        topic: `${categoryLabel} | ${subject} | ${user.tag}`,
      };
      if (categoryId) {
        channelOptions.parent = categoryId;
      }

      const channel = await guild.channels.create(channelOptions);

      // Build the initial ticket embed
      const embed = ticketEmbed(
        i18n.t('tickets.created_embed_title', { number: ticketNumber, category: categoryLabel }),
        description || subject,
      );
      embed.addFields(
        { name: i18n.t('tickets.created_embed_subject'), value: subject, inline: true },
        { name: i18n.t('tickets.created_embed_category'), value: categoryLabel, inline: true },
        { name: i18n.t('tickets.created_embed_user'), value: `<@${user.id}>`, inline: true },
      );
      if (description && description !== subject) {
        embed.addFields({
          name: i18n.t('tickets.created_embed_description'),
          value: description,
          inline: false,
        });
      }

      // Claim and Close buttons
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_claim')
          .setLabel(i18n.t('tickets.claim_button'))
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🙋'),
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel(i18n.t('tickets.close_button'))
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
      );

      await channel.send({
        content: `<@${user.id}>`,
        embeds: [embed],
        components: [row],
      });

      // Save ticket data
      const now = new Date().toISOString();
      this.tickets[channel.id] = {
        number: ticketNumber,
        userId: user.id,
        category,
        subject,
        description: description || '',
        claimedBy: null,
        createdAt: now,
        lastActivity: now,
        warned: false,
      };
      this._save();

      // Reply to the user
      await interaction.reply({
        embeds: [
          successEmbed(
            i18n.t('tickets.panel_title'),
            i18n.t('tickets.created', { number: ticketNumber, channel: `<#${channel.id}>` }),
          ),
        ],
        ephemeral: true,
      });

      return channel;
    } catch (error) {
      console.error('[Tickets] Failed to create ticket:', error);
      return null;
    }
  }

  /**
   * Closes a ticket channel: generates transcript, sends to log, then deletes the channel.
   *
   * @param {import('discord.js').TextChannel} channel - The ticket channel
   * @param {import('discord.js').User|import('discord.js').GuildMember} closedBy - Who closed it
   * @param {string} reason - Reason for closing
   */
  async closeTicket(channel, closedBy, reason) {
    const ticketData = this.tickets[channel.id];
    if (!ticketData) return;

    const ticketNumber = ticketData.number;
    const closedByTag = closedBy.displayName || closedBy.user?.displayName || closedBy.tag || closedBy.username || 'Unknown';

    // Generate transcript
    let transcriptBuffer;
    try {
      transcriptBuffer = await this.transcriptGenerator.generate(channel, ticketData, closedByTag);
    } catch (error) {
      console.error('[Tickets] Failed to generate transcript:', error);
      transcriptBuffer = null;
    }

    // Build log embed
    const closedEmbed = logEmbed(
      i18n.t('tickets.closed_log_title', { number: ticketNumber }),
    );
    closedEmbed.addFields(
      { name: i18n.t('tickets.created_embed_user'), value: `<@${ticketData.userId}>`, inline: true },
      { name: i18n.t('tickets.closed_by'), value: `<@${closedBy.id}>`, inline: true },
      { name: i18n.t('tickets.created_embed_category'), value: ticketData.category, inline: true },
      { name: i18n.t('tickets.created_embed_subject'), value: ticketData.subject, inline: false },
      { name: i18n.t('tickets.closed_reason'), value: reason || i18n.t('moderation.no_reason'), inline: false },
    );

    // Send to log channel
    const logChannelId = config.get('tickets.log_channel');
    if (logChannelId) {
      try {
        const logChannel = await this.client.channels.fetch(logChannelId);
        if (logChannel) {
          const logPayload = { embeds: [closedEmbed] };
          if (transcriptBuffer) {
            logPayload.files = [
              new AttachmentBuilder(transcriptBuffer, {
                name: `transcript-ticket-${ticketNumber}.html`,
              }),
            ];
          }
          await logChannel.send(logPayload);
        }
      } catch (error) {
        console.error('[Tickets] Failed to send to log channel:', error);
      }
    }

    // Send to transcript channel (if different from log channel)
    const transcriptChannelId = config.get('tickets.transcript_channel');
    if (transcriptChannelId && transcriptChannelId !== logChannelId && transcriptBuffer) {
      try {
        const transcriptChannel = await this.client.channels.fetch(transcriptChannelId);
        if (transcriptChannel) {
          await transcriptChannel.send({
            embeds: [closedEmbed],
            files: [
              new AttachmentBuilder(transcriptBuffer, {
                name: `transcript-ticket-${ticketNumber}.html`,
              }),
            ],
          });
        }
      } catch (error) {
        console.error('[Tickets] Failed to send to transcript channel:', error);
      }
    }

    // Notify in channel before deleting
    try {
      await channel.send({
        embeds: [
          warnEmbed(
            i18n.t('tickets.close_confirm_title'),
            i18n.t('tickets.closing'),
          ),
        ],
      });
    } catch {
      // Channel may already be inaccessible
    }

    // Remove from tracked data
    delete this.tickets[channel.id];
    this._save();

    // Delete channel after 5 seconds
    setTimeout(async () => {
      try {
        await channel.delete(`Ticket #${ticketNumber} closed by ${closedByTag}`);
      } catch (error) {
        console.error('[Tickets] Failed to delete ticket channel:', error);
      }
    }, 5000);
  }

  /**
   * Claims a ticket for the staff member who clicked the button.
   *
   * @param {import('discord.js').ButtonInteraction} interaction
   */
  async claimTicket(interaction) {
    const ticketData = this.tickets[interaction.channel.id];
    if (!ticketData) {
      return;
    }

    // Check if already claimed
    if (ticketData.claimedBy) {
      await interaction.reply({
        embeds: [
          warnEmbed(
            i18n.t('tickets.panel_title'),
            i18n.t('tickets.claimed_by', { user: `<@${ticketData.claimedBy}>` }),
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    // Only staff can claim
    if (!isStaff(interaction.member)) {
      await interaction.reply({
        embeds: [
          warnEmbed(
            i18n.t('tickets.panel_title'),
            i18n.t('general.no_permission'),
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    // Set claimed
    ticketData.claimedBy = interaction.user.id;
    ticketData.lastActivity = new Date().toISOString();
    this._save();

    // Update the original embed message with claim info
    try {
      const originalMessage = interaction.message;
      const existingEmbed = originalMessage.embeds[0];
      if (existingEmbed) {
        const { EmbedBuilder } = require('discord.js');
        const updatedEmbed = EmbedBuilder.from(existingEmbed).addFields({
          name: i18n.t('tickets.claim_button'),
          value: `<@${interaction.user.id}>`,
          inline: true,
        });

        // Rebuild the row but disable the claim button
        const updatedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_claim')
            .setLabel(i18n.t('tickets.claim_button'))
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🙋')
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel(i18n.t('tickets.close_button'))
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒'),
        );

        await originalMessage.edit({
          embeds: [updatedEmbed],
          components: [updatedRow],
        });
      }
    } catch (error) {
      console.error('[Tickets] Failed to update embed after claim:', error);
    }

    await interaction.reply({
      embeds: [
        successEmbed(
          i18n.t('tickets.panel_title'),
          i18n.t('tickets.claimed_by', { user: `<@${interaction.user.id}>` }),
        ),
      ],
    });
  }

  /**
   * Adds a user to a ticket channel by granting them view/send permissions.
   *
   * @param {import('discord.js').TextChannel} channel
   * @param {import('discord.js').User} user
   */
  async addUser(channel, user) {
    await channel.permissionOverwrites.edit(user.id, {
      [PermissionFlagsBits.ViewChannel]: true,
      [PermissionFlagsBits.SendMessages]: true,
      [PermissionFlagsBits.AttachFiles]: true,
      [PermissionFlagsBits.ReadMessageHistory]: true,
    });

    // Update last activity
    const ticketData = this.tickets[channel.id];
    if (ticketData) {
      ticketData.lastActivity = new Date().toISOString();
      this._save();
    }
  }

  /**
   * Removes a user from a ticket channel by revoking their view permission.
   *
   * @param {import('discord.js').TextChannel} channel
   * @param {import('discord.js').User} user
   */
  async removeUser(channel, user) {
    await channel.permissionOverwrites.delete(user.id);

    // Update last activity
    const ticketData = this.tickets[channel.id];
    if (ticketData) {
      ticketData.lastActivity = new Date().toISOString();
      this._save();
    }
  }

  /**
   * Returns all open tickets belonging to a user.
   *
   * @param {string} userId
   * @returns {Array<{channelId: string, data: object}>}
   */
  getOpenTickets(userId) {
    const results = [];
    for (const [channelId, data] of Object.entries(this.tickets)) {
      if (data.userId === userId) {
        results.push({ channelId, data });
      }
    }
    return results;
  }

  /**
   * Updates the last activity timestamp for a ticket.
   * Should be called when a message is sent in a ticket channel.
   *
   * @param {string} channelId
   */
  updateActivity(channelId) {
    const ticketData = this.tickets[channelId];
    if (ticketData) {
      ticketData.lastActivity = new Date().toISOString();
      ticketData.warned = false;
      this._save();
    }
  }

  /**
   * Checks if a channel ID belongs to an active ticket.
   *
   * @param {string} channelId
   * @returns {boolean}
   */
  isTicketChannel(channelId) {
    return channelId in this.tickets;
  }

  /**
   * Runs periodically to warn and auto-close inactive tickets.
   * - Sends a warning when a ticket has been inactive for (autoCloseHours - warningMinutes).
   * - Closes the ticket when it has been inactive for autoCloseHours.
   */
  async _checkAutoClose() {
    const autoCloseHours = config.get('tickets.auto_close_hours') || 48;
    const warningMinutes = config.get('tickets.auto_close_warning_minutes') || 60;

    const autoCloseMs = autoCloseHours * 60 * 60 * 1000;
    const warningMs = autoCloseMs - warningMinutes * 60 * 1000;

    const now = Date.now();

    for (const [channelId, ticketData] of Object.entries(this.tickets)) {
      const lastActivity = new Date(ticketData.lastActivity).getTime();
      const inactiveMs = now - lastActivity;

      // Auto-close if past threshold
      if (inactiveMs >= autoCloseMs) {
        try {
          const channel = await this.client.channels.fetch(channelId);
          if (channel) {
            await this.closeTicket(channel, this.client.user, i18n.t('tickets.auto_closed'));
          } else {
            // Channel no longer exists, clean up data
            delete this.tickets[channelId];
            this._save();
          }
        } catch (error) {
          // Channel might have been deleted externally
          console.error(`[Tickets] Auto-close failed for ${channelId}:`, error.message);
          delete this.tickets[channelId];
          this._save();
        }
        continue;
      }

      // Send warning if past warning threshold and not already warned
      if (inactiveMs >= warningMs && !ticketData.warned) {
        try {
          const channel = await this.client.channels.fetch(channelId);
          if (channel) {
            await channel.send({
              embeds: [
                warnEmbed(
                  i18n.t('tickets.panel_title'),
                  i18n.t('tickets.auto_close_warning', { minutes: warningMinutes }),
                ),
              ],
            });
            ticketData.warned = true;
            this._save();
          }
        } catch (error) {
          console.error(`[Tickets] Warning failed for ${channelId}:`, error.message);
        }
      }
    }
  }

  /**
   * Cleans up the auto-close interval. Call this on bot shutdown.
   */
  destroy() {
    if (this._autoCloseInterval) {
      clearInterval(this._autoCloseInterval);
      this._autoCloseInterval = null;
    }
  }
}

module.exports = { TicketManager };
