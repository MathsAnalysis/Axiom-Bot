const config = require('../../config/ConfigManager');
const i18n = require('../../locales/I18n');
const { readJSON, writeJSON } = require('../../utils/fileManager');
const { modEmbed } = require('../../utils/embeds');
const { formatDuration } = require('../../utils/duration');

const WARNINGS_FILE = 'warnings.json';

class ModerationManager {
  constructor() {
    this.warnings = readJSON(WARNINGS_FILE, {});
  }

  /**
   * Persist the warnings map to disk.
   */
  _save() {
    writeJSON(WARNINGS_FILE, this.warnings);
  }

  /**
   * Add a warning to a user in a guild.
   * Returns the newly created warn object.
   */
  addWarn(guildId, userId, reason, moderatorId) {
    if (!this.warnings[guildId]) {
      this.warnings[guildId] = {};
    }
    if (!this.warnings[guildId][userId]) {
      this.warnings[guildId][userId] = [];
    }

    const userWarns = this.warnings[guildId][userId];
    const nextId = userWarns.length > 0
      ? Math.max(...userWarns.map((w) => w.id)) + 1
      : 1;

    const warn = {
      id: nextId,
      reason,
      moderator: moderatorId,
      timestamp: new Date().toISOString(),
    };

    userWarns.push(warn);
    this._save();
    return warn;
  }

  /**
   * Get all warnings for a user in a guild.
   */
  getWarnings(guildId, userId) {
    if (!this.warnings[guildId]) return [];
    if (!this.warnings[guildId][userId]) return [];
    return this.warnings[guildId][userId];
  }

  /**
   * Remove a specific warning by ID.
   * Returns true if found and removed, false otherwise.
   */
  removeWarn(guildId, userId, warnId) {
    if (!this.warnings[guildId] || !this.warnings[guildId][userId]) {
      return false;
    }

    const userWarns = this.warnings[guildId][userId];
    const index = userWarns.findIndex((w) => w.id === warnId);
    if (index === -1) return false;

    userWarns.splice(index, 1);

    // Clean up empty entries
    if (userWarns.length === 0) {
      delete this.warnings[guildId][userId];
    }
    if (Object.keys(this.warnings[guildId]).length === 0) {
      delete this.warnings[guildId];
    }

    this._save();
    return true;
  }

  /**
   * Check warn thresholds and apply automatic actions (mute, kick, ban).
   * Returns the action taken or null if no threshold was hit.
   */
  async checkThresholds(guild, member, warnCount) {
    const muteAt = config.get('moderation.warn_thresholds.mute_at') || 3;
    const muteDurationMin = config.get('moderation.warn_thresholds.mute_duration_minutes') || 30;
    const kickAt = config.get('moderation.warn_thresholds.kick_at') || 5;
    const banAt = config.get('moderation.warn_thresholds.ban_at') || 7;

    try {
      // Ban threshold (highest priority)
      if (warnCount >= banAt) {
        const reason = i18n.t('moderation.auto_action_ban', {
          threshold: banAt,
        });

        await member.ban({ reason }).catch(() => null);

        const embed = modEmbed(
          'Auto-Ban',
          reason + `\n**User:** ${member.user.tag}`,
        );
        await this.logAction(guild, embed);
        return { action: 'ban', reason };
      }

      // Kick threshold
      if (warnCount >= kickAt) {
        const reason = i18n.t('moderation.auto_action_kick', {
          threshold: kickAt,
        });

        await member.kick(reason).catch(() => null);

        const embed = modEmbed(
          'Auto-Kick',
          reason + `\n**User:** ${member.user.tag}`,
        );
        await this.logAction(guild, embed);
        return { action: 'kick', reason };
      }

      // Mute threshold
      if (warnCount >= muteAt) {
        const durationMs = muteDurationMin * 60 * 1000;
        const reason = i18n.t('moderation.auto_action_mute', {
          duration: muteDurationMin,
          threshold: muteAt,
        });

        await member.timeout(durationMs, reason).catch(() => null);

        const embed = modEmbed(
          'Auto-Mute',
          reason + `\n**User:** ${member.user.tag}\n**Duration:** ${formatDuration(durationMs)}`,
        );
        await this.logAction(guild, embed);
        return { action: 'mute', reason, duration: durationMs };
      }
    } catch (error) {
      console.error('[ModerationManager] Error applying threshold action:', error);
    }

    return null;
  }

  /**
   * Send a moderation log embed to the configured log channel.
   */
  async logAction(guild, embed) {
    const logChannelId = config.get('moderation.log_channel');
    if (!logChannelId) return;

    try {
      const channel = await guild.channels.fetch(logChannelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        await channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('[ModerationManager] Failed to send log:', error);
    }
  }
}

// Export a singleton instance
module.exports = new ModerationManager();
