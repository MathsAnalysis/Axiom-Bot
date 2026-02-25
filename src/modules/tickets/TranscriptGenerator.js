class TranscriptGenerator {
  /**
   * Generates an HTML transcript for a ticket channel.
   * Fetches all messages in order, renders them in a Discord-like dark theme,
   * and returns a Buffer suitable for sending as a file attachment.
   *
   * @param {import('discord.js').TextChannel} channel - The ticket channel
   * @param {object} ticketData - The ticket metadata
   * @param {string} closedByTag - Display name / tag of the closer
   * @returns {Promise<Buffer>} HTML transcript as a Buffer
   */
  async generate(channel, ticketData, closedByTag) {
    const messages = await this._fetchAllMessages(channel);
    const html = this._buildHTML(messages, channel, ticketData, closedByTag);
    return Buffer.from(html, 'utf-8');
  }

  /**
   * Fetches every message in a channel by paginating through the API.
   * Messages are returned in chronological order (oldest first).
   *
   * @param {import('discord.js').TextChannel} channel
   * @returns {Promise<import('discord.js').Message[]>}
   */
  async _fetchAllMessages(channel) {
    const allMessages = [];
    let lastId = null;

    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;

      const batch = await channel.messages.fetch(options);
      if (batch.size === 0) break;

      allMessages.push(...batch.values());
      lastId = batch.last().id;

      if (batch.size < 100) break;
    }

    // Reverse so oldest messages come first
    allMessages.reverse();
    return allMessages;
  }

  /**
   * Builds the complete HTML document for the transcript.
   *
   * @param {import('discord.js').Message[]} messages
   * @param {import('discord.js').TextChannel} channel
   * @param {object} ticketData
   * @param {string} closedByTag
   * @returns {string} Complete HTML string
   */
  _buildHTML(messages, channel, ticketData, closedByTag) {
    const guildName = this._escapeHtml(channel.guild.name);
    const channelName = this._escapeHtml(channel.name);
    const ticketNumber = ticketData.number || '?';
    const category = this._escapeHtml(ticketData.category || 'N/A');
    const subject = this._escapeHtml(ticketData.subject || 'N/A');
    const createdAt = ticketData.createdAt
      ? new Date(ticketData.createdAt).toLocaleString('en-GB', { timeZone: 'UTC' })
      : 'N/A';
    const closedAt = new Date().toLocaleString('en-GB', { timeZone: 'UTC' });
    const totalMessages = messages.length;
    const escapedClosedBy = this._escapeHtml(closedByTag || 'Unknown');

    const messagesHtml = messages.map((msg) => this._renderMessage(msg)).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transcript - Ticket #${ticketNumber}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      background-color: #36393f;
      color: #dcddde;
      font-family: 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 15px;
      line-height: 1.375;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
    }

    /* Header */
    .header {
      background-color: #2f3136;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
      border-left: 4px solid #9b59b6;
    }

    .header h1 {
      color: #ffffff;
      font-size: 22px;
      font-weight: 600;
      margin-bottom: 16px;
    }

    .header-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .header-field {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .header-field .label {
      color: #72767d;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .header-field .value {
      color: #dcddde;
      font-size: 14px;
    }

    /* Messages */
    .messages {
      background-color: #36393f;
    }

    .message-group {
      padding: 4px 16px;
      margin-bottom: 2px;
      border-radius: 4px;
      transition: background-color 0.1s;
    }

    .message-group:hover {
      background-color: #32353b;
    }

    .message-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }

    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      flex-shrink: 0;
      background-color: #5865f2;
    }

    .username {
      font-weight: 600;
      font-size: 15px;
      cursor: default;
    }

    .username.bot {
      color: #ffffff;
    }

    .bot-tag {
      background-color: #5865f2;
      color: #ffffff;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
      text-transform: uppercase;
      vertical-align: middle;
      margin-left: 4px;
    }

    .timestamp {
      color: #72767d;
      font-size: 12px;
      margin-left: 4px;
    }

    .message-content {
      margin-left: 50px;
      padding-left: 0;
      color: #dcddde;
      word-wrap: break-word;
      white-space: pre-wrap;
    }

    /* Embeds */
    .embed {
      margin-left: 50px;
      margin-top: 4px;
      max-width: 520px;
      background-color: #2f3136;
      border-radius: 4px;
      border-left: 4px solid #5865f2;
      padding: 12px 16px;
    }

    .embed-color {
      border-left-color: var(--embed-color, #5865f2);
    }

    .embed-author {
      font-size: 13px;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 4px;
    }

    .embed-title {
      font-size: 15px;
      font-weight: 600;
      color: #00aff4;
      margin-bottom: 8px;
    }

    .embed-description {
      font-size: 14px;
      color: #dcddde;
      margin-bottom: 8px;
      white-space: pre-wrap;
    }

    .embed-field {
      margin-bottom: 8px;
    }

    .embed-field-name {
      font-size: 13px;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 2px;
    }

    .embed-field-value {
      font-size: 14px;
      color: #dcddde;
      white-space: pre-wrap;
    }

    .embed-footer {
      font-size: 12px;
      color: #72767d;
      margin-top: 8px;
    }

    /* Attachments */
    .attachments {
      margin-left: 50px;
      margin-top: 4px;
    }

    .attachment {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background-color: #2f3136;
      border: 1px solid #202225;
      border-radius: 4px;
      padding: 8px 12px;
      margin-top: 4px;
      max-width: 400px;
    }

    .attachment-icon {
      font-size: 20px;
      flex-shrink: 0;
    }

    .attachment-info {
      overflow: hidden;
    }

    .attachment-name {
      color: #00aff4;
      text-decoration: none;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }

    .attachment-name:hover {
      text-decoration: underline;
    }

    .attachment-size {
      font-size: 12px;
      color: #72767d;
    }

    .attachment-image {
      margin-left: 50px;
      margin-top: 4px;
      max-width: 400px;
      max-height: 300px;
      border-radius: 4px;
    }

    /* Footer */
    .footer {
      background-color: #2f3136;
      border-radius: 8px;
      padding: 16px 24px;
      margin-top: 24px;
      text-align: center;
      color: #72767d;
      font-size: 13px;
    }

    .footer strong {
      color: #dcddde;
    }

    /* Divider */
    .day-divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 16px 0;
    }

    .day-divider::before,
    .day-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background-color: #42454a;
    }

    .day-divider span {
      color: #72767d;
      font-size: 12px;
      font-weight: 600;
    }

    /* System messages */
    .system-message {
      padding: 4px 16px;
      margin-bottom: 2px;
      color: #72767d;
      font-size: 14px;
      font-style: italic;
      margin-left: 50px;
    }

    /* User colors (rotate through Discord-like palette) */
    .user-color-0 { color: #e91e63; }
    .user-color-1 { color: #9c27b0; }
    .user-color-2 { color: #2196f3; }
    .user-color-3 { color: #00bcd4; }
    .user-color-4 { color: #4caf50; }
    .user-color-5 { color: #ff9800; }
    .user-color-6 { color: #e74c3c; }
    .user-color-7 { color: #1abc9c; }
    .user-color-8 { color: #3498db; }
    .user-color-9 { color: #e67e22; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Ticket #${ticketNumber} - ${subject}</h1>
      <div class="header-grid">
        <div class="header-field">
          <span class="label">Server</span>
          <span class="value">${guildName}</span>
        </div>
        <div class="header-field">
          <span class="label">Channel</span>
          <span class="value">#${channelName}</span>
        </div>
        <div class="header-field">
          <span class="label">Category</span>
          <span class="value">${category}</span>
        </div>
        <div class="header-field">
          <span class="label">Total Messages</span>
          <span class="value">${totalMessages}</span>
        </div>
        <div class="header-field">
          <span class="label">Opened</span>
          <span class="value">${createdAt} (UTC)</span>
        </div>
        <div class="header-field">
          <span class="label">Closed</span>
          <span class="value">${closedAt} (UTC)</span>
        </div>
        <div class="header-field">
          <span class="label">Closed By</span>
          <span class="value">${escapedClosedBy}</span>
        </div>
        <div class="header-field">
          <span class="label">Subject</span>
          <span class="value">${subject}</span>
        </div>
      </div>
    </div>

    <div class="messages">
${messagesHtml}
    </div>

    <div class="footer">
      <strong>${guildName}</strong> &mdash; Transcript generated on ${closedAt} (UTC)
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Renders a single message as HTML, including embeds and attachments.
   *
   * @param {import('discord.js').Message} msg
   * @returns {string} HTML string for the message
   */
  _renderMessage(msg) {
    const author = msg.author;
    const avatarUrl = author.displayAvatarURL({ extension: 'png', size: 64 });
    const username = this._escapeHtml(author.displayName || author.username);
    const isBot = author.bot;
    const colorClass = `user-color-${this._hashUserId(author.id) % 10}`;
    const timestamp = new Date(msg.createdTimestamp).toLocaleString('en-GB', { timeZone: 'UTC' });

    const botTag = isBot ? '<span class="bot-tag">BOT</span>' : '';
    const usernameClass = isBot ? 'username bot' : `username ${colorClass}`;

    let contentHtml = '';
    if (msg.content && msg.content.trim().length > 0) {
      contentHtml = `<div class="message-content">${this._formatContent(msg.content)}</div>`;
    }

    // Render embeds
    let embedsHtml = '';
    if (msg.embeds && msg.embeds.length > 0) {
      embedsHtml = msg.embeds.map((embed) => this._renderEmbed(embed)).join('\n');
    }

    // Render attachments
    let attachmentsHtml = '';
    if (msg.attachments && msg.attachments.size > 0) {
      attachmentsHtml = this._renderAttachments(msg.attachments);
    }

    return `      <div class="message-group">
        <div class="message-header">
          <img class="avatar" src="${avatarUrl}" alt="${username}" onerror="this.style.display='none'">
          <span class="${usernameClass}">${username}</span>${botTag}
          <span class="timestamp">${timestamp}</span>
        </div>
${contentHtml}
${embedsHtml}
${attachmentsHtml}
      </div>`;
  }

  /**
   * Renders a Discord embed as an HTML block.
   *
   * @param {import('discord.js').Embed} embed
   * @returns {string} HTML string
   */
  _renderEmbed(embed) {
    const color = embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : '#5865f2';
    let html = `        <div class="embed embed-color" style="--embed-color: ${color};">`;

    if (embed.author && embed.author.name) {
      html += `\n          <div class="embed-author">${this._escapeHtml(embed.author.name)}</div>`;
    }

    if (embed.title) {
      html += `\n          <div class="embed-title">${this._escapeHtml(embed.title)}</div>`;
    }

    if (embed.description) {
      html += `\n          <div class="embed-description">${this._formatContent(embed.description)}</div>`;
    }

    if (embed.fields && embed.fields.length > 0) {
      for (const field of embed.fields) {
        html += `\n          <div class="embed-field">
            <div class="embed-field-name">${this._escapeHtml(field.name)}</div>
            <div class="embed-field-value">${this._formatContent(field.value)}</div>
          </div>`;
      }
    }

    if (embed.footer && embed.footer.text) {
      html += `\n          <div class="embed-footer">${this._escapeHtml(embed.footer.text)}</div>`;
    }

    html += '\n        </div>';
    return html;
  }

  /**
   * Renders message attachments as HTML.
   *
   * @param {import('discord.js').Collection} attachments
   * @returns {string} HTML string
   */
  _renderAttachments(attachments) {
    let html = '        <div class="attachments">';

    for (const [, attachment] of attachments) {
      const name = this._escapeHtml(attachment.name || 'unknown');
      const url = attachment.url;
      const size = this._formatFileSize(attachment.size || 0);
      const contentType = attachment.contentType || '';

      if (contentType.startsWith('image/')) {
        html += `\n          <img class="attachment-image" src="${url}" alt="${name}" loading="lazy">`;
      } else {
        html += `\n          <div class="attachment">
            <span class="attachment-icon">📎</span>
            <div class="attachment-info">
              <a class="attachment-name" href="${url}" target="_blank" rel="noopener">${name}</a>
              <span class="attachment-size">${size}</span>
            </div>
          </div>`;
      }
    }

    html += '\n        </div>';
    return html;
  }

  /**
   * Formats message content: escapes HTML and converts basic markdown.
   *
   * @param {string} text
   * @returns {string} Formatted HTML string
   */
  _formatContent(text) {
    let escaped = this._escapeHtml(text);

    // Bold: **text**
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic: *text* or _text_
    escaped = escaped.replace(/\*(.+?)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/_(.+?)_/g, '<em>$1</em>');
    // Underline: __text__
    escaped = escaped.replace(/__(.+?)__/g, '<u>$1</u>');
    // Strikethrough: ~~text~~
    escaped = escaped.replace(/~~(.+?)~~/g, '<s>$1</s>');
    // Inline code: `code`
    escaped = escaped.replace(/`([^`]+)`/g, '<code style="background:#2f3136;padding:2px 4px;border-radius:3px;font-size:13px;">$1</code>');
    // Code blocks: ```code```
    escaped = escaped.replace(/```(?:\w+\n)?([\s\S]*?)```/g, '<pre style="background:#2f3136;padding:8px;border-radius:4px;font-size:13px;margin:4px 0;overflow-x:auto;">$1</pre>');

    return escaped;
  }

  /**
   * Escapes HTML special characters.
   *
   * @param {string} text
   * @returns {string}
   */
  _escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Simple hash to get a consistent color index per user ID.
   *
   * @param {string} userId
   * @returns {number}
   */
  _hashUserId(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = (hash * 31 + userId.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  /**
   * Formats a byte size into a human-readable string.
   *
   * @param {number} bytes
   * @returns {string}
   */
  _formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
    return `${size} ${units[i]}`;
  }
}

module.exports = { TranscriptGenerator };
