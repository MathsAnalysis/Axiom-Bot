const config = require('../../config/ConfigManager');
const i18n = require('../../locales/I18n');
const { isExempt } = require('../../utils/permissions');
const { modEmbed } = require('../../utils/embeds');
const moderationManager = require('./ModerationManager');

/**
 * URL regex for detecting links in messages.
 */
const URL_REGEX = /https?:\/\/[^\s<]+/gi;

class AntiSpam {
  constructor(client) {
    this.client = client;

    // Per-user tracking maps keyed by `guildId-userId`
    // Each entry stores an array of { content, timestamp }
    this.messageHistory = new Map();

    // Per-user timestamps for flood detection
    this.floodTimestamps = new Map();

    // Per-user link timestamps
    this.linkTimestamps = new Map();

    // Cleanup interval: purge stale entries every 60 seconds
    this._cleanupInterval = setInterval(() => this._cleanup(), 60_000);
  }

  /**
   * Build a unique key for per-user-per-guild tracking.
   */
  _key(guildId, userId) {
    return `${guildId}-${userId}`;
  }

  /**
   * Remove expired tracking entries to prevent memory leaks.
   */
  _cleanup() {
    const now = Date.now();
    const maxAge = 60_000; // 60 seconds max retention

    for (const [key, entries] of this.messageHistory) {
      const filtered = entries.filter((e) => now - e.timestamp < maxAge);
      if (filtered.length === 0) {
        this.messageHistory.delete(key);
      } else {
        this.messageHistory.set(key, filtered);
      }
    }

    for (const [key, timestamps] of this.floodTimestamps) {
      const filtered = timestamps.filter((t) => now - t < maxAge);
      if (filtered.length === 0) {
        this.floodTimestamps.delete(key);
      } else {
        this.floodTimestamps.set(key, filtered);
      }
    }

    for (const [key, timestamps] of this.linkTimestamps) {
      const filtered = timestamps.filter((t) => now - t < maxAge);
      if (filtered.length === 0) {
        this.linkTimestamps.delete(key);
      } else {
        this.linkTimestamps.set(key, filtered);
      }
    }
  }

  /**
   * Main entry point: check a message for spam.
   * Returns { spam: true, type: string } if spam is detected, or null otherwise.
   */
  async check(message) {
    // Only process guild text messages from non-bot users
    if (!message.guild || message.author.bot || !message.member) return null;

    // Check if anti-spam is enabled
    if (!config.get('anti_spam.enabled')) return null;

    // Check exemptions
    const exemptRoles = config.get('anti_spam.exempt_roles') || [];
    const exemptChannels = config.get('anti_spam.exempt_channels') || [];
    if (isExempt(message.member, exemptRoles, exemptChannels, message.channel.id)) {
      return null;
    }

    const key = this._key(message.guild.id, message.author.id);
    const now = Date.now();

    // -- Duplicate message check --
    const dupResult = this._checkDuplicate(key, message.content, now);
    if (dupResult) {
      await this._handleSpam(message, 'duplicate');
      return { spam: true, type: 'duplicate' };
    }

    // -- Flood check --
    const floodResult = this._checkFlood(key, now);
    if (floodResult) {
      await this._handleSpam(message, 'flood');
      return { spam: true, type: 'flood' };
    }

    // -- Mass mention check --
    const mentionResult = this._checkMassMention(message);
    if (mentionResult) {
      await this._handleSpam(message, 'mass_mention');
      return { spam: true, type: 'mass_mention' };
    }

    // -- Link spam check --
    const linkResult = this._checkLinkSpam(key, message.content, now);
    if (linkResult) {
      await this._handleSpam(message, 'link_spam');
      return { spam: true, type: 'link_spam' };
    }

    return null;
  }

  /**
   * Check for duplicate messages within the configured interval.
   */
  _checkDuplicate(key, content, now) {
    const threshold = config.get('anti_spam.duplicate_threshold') || 3;
    const intervalSec = config.get('anti_spam.duplicate_interval_seconds') || 10;
    const intervalMs = intervalSec * 1000;

    if (!this.messageHistory.has(key)) {
      this.messageHistory.set(key, []);
    }

    const history = this.messageHistory.get(key);
    history.push({ content, timestamp: now });

    // Only consider messages within the interval window
    const recent = history.filter((e) => now - e.timestamp < intervalMs);
    this.messageHistory.set(key, recent);

    // Count how many recent messages have the same content
    const normalizedContent = content.toLowerCase().trim();
    const duplicateCount = recent.filter(
      (e) => e.content.toLowerCase().trim() === normalizedContent,
    ).length;

    return duplicateCount >= threshold;
  }

  /**
   * Check for message flood (too many messages in a short time).
   */
  _checkFlood(key, now) {
    const threshold = config.get('anti_spam.flood_threshold') || 5;
    const intervalSec = config.get('anti_spam.flood_interval_seconds') || 5;
    const intervalMs = intervalSec * 1000;

    if (!this.floodTimestamps.has(key)) {
      this.floodTimestamps.set(key, []);
    }

    const timestamps = this.floodTimestamps.get(key);
    timestamps.push(now);

    const recent = timestamps.filter((t) => now - t < intervalMs);
    this.floodTimestamps.set(key, recent);

    return recent.length >= threshold;
  }

  /**
   * Check for mass mentions in a single message.
   */
  _checkMassMention(message) {
    const threshold = config.get('anti_spam.mass_mention_threshold') || 5;
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    return mentionCount >= threshold;
  }

  /**
   * Check for link spam (too many messages containing links in a short time).
   */
  _checkLinkSpam(key, content, now) {
    const hasLink = URL_REGEX.test(content);
    // Reset regex lastIndex since it has the global flag
    URL_REGEX.lastIndex = 0;

    if (!hasLink) return false;

    const threshold = config.get('anti_spam.link_threshold') || 3;
    const intervalSec = config.get('anti_spam.link_interval_seconds') || 10;
    const intervalMs = intervalSec * 1000;

    if (!this.linkTimestamps.has(key)) {
      this.linkTimestamps.set(key, []);
    }

    const timestamps = this.linkTimestamps.get(key);
    timestamps.push(now);

    const recent = timestamps.filter((t) => now - t < intervalMs);
    this.linkTimestamps.set(key, recent);

    return recent.length >= threshold;
  }

  /**
   * Handle a detected spam event: delete the message, apply configured action, and log.
   */
  async _handleSpam(message, type) {
    const action = config.get('anti_spam.action') || 'warn';
    const reason = i18n.t(`anti_spam.${type}`);

    // Attempt to delete the spam message
    try {
      if (message.deletable) {
        await message.delete();
      }
    } catch (error) {
      console.error('[AntiSpam] Failed to delete message:', error);
    }

    // Apply configured action
    try {
      switch (action) {
        case 'warn':
          await this._applyWarn(message, reason);
          break;
        case 'mute':
        case 'timeout':
          await this._applyTimeout(message, reason);
          break;
        case 'kick':
          await this._applyKick(message, reason);
          break;
        case 'delete':
          // Message already deleted above, no further action
          break;
        default:
          // Default to warn
          await this._applyWarn(message, reason);
          break;
      }
    } catch (error) {
      console.error('[AntiSpam] Failed to apply action:', error);
    }

    // Log the spam event
    const embed = modEmbed(
      `Anti-Spam: ${type}`,
      `**User:** ${message.author.tag} (${message.author.id})\n` +
      `**Channel:** <#${message.channel.id}>\n` +
      `**Type:** ${reason}\n` +
      `**Action:** ${action}`,
    );
    await moderationManager.logAction(message.guild, embed);
  }

  /**
   * Apply a warn action for spam.
   */
  async _applyWarn(message, reason) {
    const warn = moderationManager.addWarn(
      message.guild.id,
      message.author.id,
      reason,
      this.client.user.id,
    );

    const warnCount = moderationManager.getWarnings(
      message.guild.id,
      message.author.id,
    ).length;

    // Check thresholds for automatic escalation
    if (message.member) {
      await moderationManager.checkThresholds(
        message.guild,
        message.member,
        warnCount,
      );
    }

    return warn;
  }

  /**
   * Apply a timeout/mute action for spam (5 minutes default).
   */
  async _applyTimeout(message, reason) {
    const durationMs = 5 * 60 * 1000; // 5 minutes
    if (message.member && message.member.moderatable) {
      await message.member.timeout(durationMs, reason);
    }
  }

  /**
   * Apply a kick action for spam.
   */
  async _applyKick(message, reason) {
    if (message.member && message.member.kickable) {
      await message.member.kick(reason);
    }
  }

  /**
   * Destroy the anti-spam instance and clear timers.
   */
  destroy() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    this.messageHistory.clear();
    this.floodTimestamps.clear();
    this.linkTimestamps.clear();
  }
}

module.exports = { AntiSpam };
