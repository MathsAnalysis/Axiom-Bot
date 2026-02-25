const config = require('../../config/ConfigManager');
const i18n = require('../../locales/I18n');
const { readJSON, writeJSON } = require('../../utils/fileManager');
const { isExempt } = require('../../utils/permissions');
const { warnEmbed } = require('../../utils/embeds');
const { formatDuration } = require('../../utils/duration');

const TOXICITY_FILE = 'toxicity.json';
const API_ENDPOINT = 'https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze';

// Italian slurs/blasphemies that Perspective API doesn't catch well
const BLOCKED_PATTERNS = [
  /\bdio\s*(cane|porco|maiale|bestia|boia|ladro|cristo|merda|fa[ck])\b/i,
  /\bporco\s*(dio|gesù|gesu|madonna|giuda)\b/i,
  /\bmadonna\s*(puttana|troia|zoccola|maiala|cane|porca)\b/i,
  /\bgesù\s*(cane|porco|cristo)\b/i,
  /\bcrist(o|accio)\s*(dio|porco|cane|santo)\b/i,
  /\borca\s*(madonna|dio|puttana|troia)\b/i,
];

class PerspectiveAPI {
  constructor() {
    this._lastRequestTime = 0;
    this._queueLength = 0;
    this._maxQueueLength = 10;
  }

  /**
   * Calls the Google Perspective API to analyze text toxicity.
   * Returns a score between 0.0 and 1.0.
   * On failure, returns 0 to avoid false punishments.
   *
   * @param {string} text - The text to analyze
   * @returns {Promise<number>} Toxicity score 0.0-1.0
   */
  async analyze(text) {
    const apiKey = config.get('toxicity.api_key') || process.env.PERSPECTIVE_API_KEY;
    if (!apiKey) {
      console.warn('[PerspectiveAPI] No API key configured. Skipping analysis.');
      return 0;
    }

    const rateLimit = config.get('toxicity.rate_limit_per_second') || 1;
    const minInterval = 1000 / rateLimit;

    // Skip if queue is too long to avoid backing up
    if (this._queueLength >= this._maxQueueLength) {
      console.warn('[PerspectiveAPI] Queue too long, skipping analysis.');
      return 0;
    }

    // Rate limiting: wait until enough time has passed since last request
    this._queueLength++;
    const now = Date.now();
    const timeSinceLast = now - this._lastRequestTime;
    if (timeSinceLast < minInterval) {
      const waitTime = minInterval - timeSinceLast;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this._lastRequestTime = Date.now();
    this._queueLength--;

    try {
      const url = `${API_ENDPOINT}?key=${apiKey}`;
      const body = {
        comment: { text },
        languages: ['it', 'en'],
        requestedAttributes: { TOXICITY: {}, IDENTITY_ATTACK: {}, INSULT: {}, PROFANITY: {} },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[PerspectiveAPI] API returned ${response.status}: ${errorText}`);
        return 0;
      }

      const data = await response.json();
      const toxicity = data.attributeScores?.TOXICITY?.summaryScore?.value || 0;
      const identity = data.attributeScores?.IDENTITY_ATTACK?.summaryScore?.value || 0;
      const insult = data.attributeScores?.INSULT?.summaryScore?.value || 0;
      const profanity = data.attributeScores?.PROFANITY?.summaryScore?.value || 0;
      const score = Math.max(toxicity, identity, insult, profanity);

      console.log(`[PerspectiveAPI] "${text.substring(0, 50)}" -> tox=${toxicity.toFixed(2)} id=${identity.toFixed(2)} ins=${insult.toFixed(2)} prof=${profanity.toFixed(2)} max=${score.toFixed(2)}`);

      return score;
    } catch (error) {
      console.error('[PerspectiveAPI] Error calling API:', error.message);
      return 0;
    }
  }

  /**
   * Full toxicity detection pipeline for incoming messages.
   * Checks config, exemptions, analyzes text, and applies progressive actions.
   *
   * @param {import('discord.js').Message} message - The Discord message
   */
  async handleMessage(message) {
    // Check if toxicity detection is enabled
    if (!config.get('toxicity.enabled')) return;

    // Ignore bots
    if (message.author.bot) return;

    // Ignore DMs
    if (!message.guild) return;

    // Ignore empty messages
    if (!message.content || message.content.trim().length === 0) return;

    // Check if user or channel is exempt
    const exemptRoles = config.get('toxicity.exempt_roles') || [];
    const exemptChannels = config.get('toxicity.exempt_channels') || [];
    if (isExempt(message.member, exemptRoles, exemptChannels, message.channel.id)) return;

    // Check blocked patterns (Italian blasphemies/slurs)
    const textLower = message.content.toLowerCase();
    const matchedPattern = BLOCKED_PATTERNS.some((pattern) => pattern.test(textLower));
    if (matchedPattern) {
      console.log(`[PerspectiveAPI] Blocked pattern matched: "${message.content.substring(0, 50)}"`);
    }

    // Analyze text via API
    const score = matchedPattern ? 1.0 : await this.analyze(message.content);
    const threshold = config.get('toxicity.threshold') || 0.7;

    if (score < threshold) return;

    // Score exceeds threshold - take action
    try {
      // Delete the toxic message
      await message.delete().catch(() => null);

      // Get and increment offense count
      const toxicityData = readJSON(TOXICITY_FILE, {});
      const userId = message.author.id;

      if (!toxicityData[userId]) {
        toxicityData[userId] = { offenses: 0, lastOffense: null };
      }

      toxicityData[userId].offenses += 1;
      toxicityData[userId].lastOffense = new Date().toISOString();
      const offenseCount = toxicityData[userId].offenses;

      writeJSON(TOXICITY_FILE, toxicityData);

      // Determine action from progressive_actions config
      const progressiveActions = config.get('toxicity.progressive_actions') || [];
      let actionConfig = null;

      // Find the matching action for the current offense count
      // If offense count exceeds all defined actions, use the last one
      for (const pa of progressiveActions) {
        if (pa.offense === offenseCount) {
          actionConfig = pa;
          break;
        }
      }

      // If no exact match found, use the highest defined action
      if (!actionConfig && progressiveActions.length > 0) {
        const sorted = [...progressiveActions].sort((a, b) => b.offense - a.offense);
        if (offenseCount >= sorted[0].offense) {
          actionConfig = sorted[0];
        }
      }

      // Default to warn if no action configured
      if (!actionConfig) {
        actionConfig = { action: 'warn', duration_minutes: 0 };
      }

      // Execute the action
      const actionName = actionConfig.action;
      const durationMs = (actionConfig.duration_minutes || 0) * 60 * 1000;

      try {
        switch (actionName) {
          case 'warn':
            // Warn is just a log entry, no additional punishment
            break;

          case 'mute':
          case 'timeout':
            if (durationMs > 0 && message.member.moderatable) {
              await message.member.timeout(durationMs, `Toxicity offense #${offenseCount}`);
            }
            break;

          case 'ban':
            if (message.member.bannable) {
              await message.member.ban({
                reason: `Toxicity offense #${offenseCount}`,
                deleteMessageSeconds: 0,
              });
            }
            break;

          default:
            break;
        }
      } catch (actionError) {
        console.error('[PerspectiveAPI] Error executing action:', actionError.message);
      }

      // Build a formatted action description for the log
      let actionDescription = actionName;
      if ((actionName === 'mute' || actionName === 'timeout') && durationMs > 0) {
        actionDescription += ` (${formatDuration(durationMs)})`;
      }

      // Send log to toxicity log channel
      const logChannelId = config.get('toxicity.log_channel');
      if (logChannelId) {
        try {
          const logChannel = await message.guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel && logChannel.isTextBased()) {
            const truncatedContent =
              message.content.length > 1000
                ? message.content.substring(0, 997) + '...'
                : message.content;

            const embed = warnEmbed(
              i18n.t('toxicity.log_title'),
              [
                `**${i18n.t('toxicity.log_user')}:** ${message.author} (${message.author.tag})`,
                `**${i18n.t('toxicity.log_message')}:** ${truncatedContent}`,
                `**${i18n.t('toxicity.log_score')}:** ${(score * 100).toFixed(1)}%`,
                `**${i18n.t('toxicity.log_action')}:** ${actionDescription}`,
                `**${i18n.t('toxicity.log_offense', { number: offenseCount })}**`,
              ].join('\n'),
            );

            await logChannel.send({ embeds: [embed] });
          }
        } catch (logError) {
          console.error('[PerspectiveAPI] Error sending log:', logError.message);
        }
      }

      // DM the user
      try {
        await message.author.send({
          embeds: [warnEmbed(i18n.t('toxicity.log_title'), i18n.t('toxicity.detected'))],
        });
      } catch {
        // User may have DMs disabled, ignore
      }
    } catch (error) {
      console.error('[PerspectiveAPI] Error in handleMessage pipeline:', error);
    }
  }
}

module.exports = { PerspectiveAPI };
