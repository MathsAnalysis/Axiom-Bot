const { PermissionFlagsBits, ChannelType } = require('discord.js');
const config = require('../../config/ConfigManager');
const i18n = require('../../locales/I18n');
const { modEmbed } = require('../../utils/embeds');
const moderationManager = require('./ModerationManager');

class AntiRaid {
  constructor(client) {
    this.client = client;

    // Track recent joins per guild: Map<guildId, Array<{ userId, timestamp }>>
    this.recentJoins = new Map();

    // Track whether a guild is currently in lockdown
    this.lockdownActive = new Map();

    // Cleanup interval: purge stale join entries every 30 seconds
    this._cleanupInterval = setInterval(() => this._cleanup(), 30_000);
  }

  /**
   * Remove expired join tracking entries to prevent memory leaks.
   */
  _cleanup() {
    const now = Date.now();

    for (const [guildId, joins] of this.recentJoins) {
      const maxWindowMs = (config.get('anti_raid.join_interval_seconds') || 10) * 1000;
      const filtered = joins.filter((j) => now - j.timestamp < maxWindowMs);
      if (filtered.length === 0) {
        this.recentJoins.delete(guildId);
      } else {
        this.recentJoins.set(guildId, filtered);
      }
    }
  }

  /**
   * Called on every guildMemberAdd event.
   * Tracks joins in a sliding window and detects raids.
   * Returns { raid: true } if a raid is detected, or null.
   */
  async checkJoin(member) {
    if (!config.get('anti_raid.enabled')) return null;

    const guild = member.guild;
    const guildId = guild.id;
    const now = Date.now();

    // Initialize join tracking for this guild
    if (!this.recentJoins.has(guildId)) {
      this.recentJoins.set(guildId, []);
    }

    const joins = this.recentJoins.get(guildId);
    joins.push({ userId: member.id, timestamp: now });

    // Filter to only recent joins within the configured window
    const intervalSec = config.get('anti_raid.join_interval_seconds') || 10;
    const intervalMs = intervalSec * 1000;
    const recentJoins = joins.filter((j) => now - j.timestamp < intervalMs);
    this.recentJoins.set(guildId, recentJoins);

    // Check account age
    const ageResult = await this.checkAccountAge(member);
    if (ageResult) {
      return ageResult;
    }

    // Check join threshold
    const threshold = config.get('anti_raid.join_threshold') || 10;
    if (recentJoins.length >= threshold) {
      await this._handleRaid(guild, recentJoins);
      return { raid: true };
    }

    return null;
  }

  /**
   * Check if a member's account is too new based on the configured minimum age.
   * Returns { raid: true, reason: 'new_account' } if the account is too new, null otherwise.
   */
  async checkAccountAge(member) {
    const minAgeDays = config.get('anti_raid.min_account_age_days') || 7;
    if (minAgeDays <= 0) return null;

    const accountAgeMs = Date.now() - member.user.createdTimestamp;
    const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

    if (accountAgeDays < minAgeDays) {
      const action = config.get('anti_raid.action') || 'kick';
      const reason = i18n.t('anti_raid.new_account', {
        days: Math.floor(accountAgeDays),
        action,
      });

      try {
        await this._applyAction(member, action, reason);
      } catch (error) {
        console.error('[AntiRaid] Failed to apply account age action:', error);
      }

      // Log the event
      const embed = modEmbed(
        'Anti-Raid: New Account',
        `**User:** ${member.user.tag} (${member.id})\n` +
        `**Account Age:** ${Math.floor(accountAgeDays)} days\n` +
        `**Min Required:** ${minAgeDays} days\n` +
        `**Action:** ${action}`,
      );
      await moderationManager.logAction(member.guild, embed);

      // Notify channel
      await this._notifyChannel(member.guild, embed);

      return { raid: true, reason: 'new_account' };
    }

    return null;
  }

  /**
   * Handle a detected raid: apply action to recent joiners, notify, and optionally lockdown.
   */
  async _handleRaid(guild, recentJoins) {
    const action = config.get('anti_raid.action') || 'kick';
    const intervalSec = config.get('anti_raid.join_interval_seconds') || 10;

    // Notification embed
    const notifyEmbed = modEmbed(
      'Anti-Raid Alert',
      i18n.t('anti_raid.detected', {
        count: recentJoins.length,
        seconds: intervalSec,
      }),
    );

    await this._notifyChannel(guild, notifyEmbed);
    await moderationManager.logAction(guild, notifyEmbed);

    // Apply action to all recent joiners
    for (const join of recentJoins) {
      try {
        const member = await guild.members.fetch(join.userId).catch(() => null);
        if (member) {
          await this._applyAction(member, action, 'Anti-raid protection');
        }
      } catch (error) {
        console.error(`[AntiRaid] Failed to apply action to ${join.userId}:`, error);
      }
    }

    // Automatic lockdown
    await this.lockdown(guild);

    const lockdownEmbed = modEmbed(
      'Anti-Raid Lockdown',
      i18n.t('anti_raid.lockdown_auto'),
    );
    await this._notifyChannel(guild, lockdownEmbed);
    await moderationManager.logAction(guild, lockdownEmbed);

    // Clear the join tracking for this guild to avoid re-triggering
    this.recentJoins.set(guild.id, []);
  }

  /**
   * Apply a moderation action to a member.
   */
  async _applyAction(member, action, reason) {
    switch (action) {
      case 'ban':
        if (member.bannable) {
          await member.ban({ reason, deleteMessageSeconds: 86400 });
        }
        break;
      case 'kick':
      default:
        if (member.kickable) {
          await member.kick(reason);
        }
        break;
    }
  }

  /**
   * Send a notification to the configured anti-raid notify channel.
   */
  async _notifyChannel(guild, embed) {
    const channelId = config.get('anti_raid.notify_channel');
    if (!channelId) return;

    try {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        await channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('[AntiRaid] Failed to send notification:', error);
    }
  }

  /**
   * Lock down the server: deny SendMessages for @everyone in all text channels.
   * Channels listed in lockdown_exempt_channels are skipped.
   */
  async lockdown(guild) {
    if (this.lockdownActive.get(guild.id)) return;

    const exemptChannels = config.get('anti_raid.lockdown_exempt_channels') || [];
    const everyoneRole = guild.roles.everyone;

    try {
      const channels = guild.channels.cache.filter(
        (ch) =>
          ch.type === ChannelType.GuildText &&
          !exemptChannels.includes(ch.id),
      );

      for (const [, channel] of channels) {
        try {
          await channel.permissionOverwrites.edit(everyoneRole, {
            [PermissionFlagsBits.SendMessages]: false,
          }, { reason: 'Anti-raid lockdown activated' });
        } catch (error) {
          console.error(`[AntiRaid] Failed to lock channel ${channel.name}:`, error);
        }
      }

      this.lockdownActive.set(guild.id, true);
    } catch (error) {
      console.error('[AntiRaid] Lockdown error:', error);
    }
  }

  /**
   * Unlock the server: remove the SendMessages deny override for @everyone.
   */
  async unlock(guild) {
    if (!this.lockdownActive.get(guild.id)) return;

    const exemptChannels = config.get('anti_raid.lockdown_exempt_channels') || [];
    const everyoneRole = guild.roles.everyone;

    try {
      const channels = guild.channels.cache.filter(
        (ch) =>
          ch.type === ChannelType.GuildText &&
          !exemptChannels.includes(ch.id),
      );

      for (const [, channel] of channels) {
        try {
          await channel.permissionOverwrites.edit(everyoneRole, {
            [PermissionFlagsBits.SendMessages]: null,
          }, { reason: 'Anti-raid lockdown deactivated' });
        } catch (error) {
          console.error(`[AntiRaid] Failed to unlock channel ${channel.name}:`, error);
        }
      }

      this.lockdownActive.set(guild.id, false);
    } catch (error) {
      console.error('[AntiRaid] Unlock error:', error);
    }
  }

  /**
   * Destroy the anti-raid instance and clear timers.
   */
  destroy() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    this.recentJoins.clear();
    this.lockdownActive.clear();
  }
}

module.exports = { AntiRaid };
