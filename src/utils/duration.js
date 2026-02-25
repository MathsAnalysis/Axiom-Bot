const UNITS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

function parseDuration(input) {
  if (typeof input === 'number') return input;
  const match = String(input).match(/^(\d+)\s*(s|m|h|d|w)$/i);
  if (!match) return null;
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  return amount * (UNITS[unit] || 0);
}

function formatDuration(ms) {
  if (ms < UNITS.m) return `${Math.round(ms / UNITS.s)}s`;
  if (ms < UNITS.h) return `${Math.round(ms / UNITS.m)}m`;
  if (ms < UNITS.d) return `${Math.round(ms / UNITS.h)}h`;
  return `${Math.round(ms / UNITS.d)}d`;
}

function formatDurationLong(ms) {
  const days = Math.floor(ms / UNITS.d);
  const hours = Math.floor((ms % UNITS.d) / UNITS.h);
  const minutes = Math.floor((ms % UNITS.h) / UNITS.m);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(' ') || '0m';
}

module.exports = { parseDuration, formatDuration, formatDurationLong };
