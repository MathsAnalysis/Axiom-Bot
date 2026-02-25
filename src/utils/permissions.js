const config = require('../config/ConfigManager');
const i18n = require('../locales/I18n');

function isAdmin(member) {
  if (member.permissions.has('Administrator')) return true;
  const adminRoles = config.get('permissions.admin_roles') || [];
  return member.roles.cache.some((r) => adminRoles.includes(r.id));
}

function isModerator(member) {
  if (isAdmin(member)) return true;
  if (member.permissions.has('ModerateMembers')) return true;
  const modRoles = config.get('permissions.moderator_roles') || [];
  return member.roles.cache.some((r) => modRoles.includes(r.id));
}

function isStaff(member) {
  if (isModerator(member)) return true;
  const staffRoles = config.get('permissions.staff_roles') || [];
  return member.roles.cache.some((r) => staffRoles.includes(r.id));
}

function canModerate(moderator, target) {
  if (moderator.id === target.id) {
    return { allowed: false, reason: i18n.t('general.cannot_moderate_self') };
  }
  if (target.user.bot && target.id === target.guild.members.me.id) {
    return { allowed: false, reason: i18n.t('general.cannot_moderate_bot') };
  }
  if (moderator.roles.highest.position <= target.roles.highest.position) {
    return { allowed: false, reason: i18n.t('general.cannot_moderate_higher') };
  }
  const botMember = target.guild.members.me;
  if (botMember.roles.highest.position <= target.roles.highest.position) {
    return { allowed: false, reason: 'The bot role is not high enough to moderate this user.' };
  }
  return { allowed: true };
}

function hasCommandPermission(member, commandName) {
  const customPerms = config.get('command_permissions') || {};
  const requiredRole = customPerms[commandName];

  if (!requiredRole) return true;
  if (isAdmin(member)) return true;

  return member.roles.cache.has(requiredRole);
}

function isExempt(member, exemptRoles = [], exemptChannels = [], channelId = null) {
  if (member.user.bot) return true;
  if (exemptRoles.some((r) => member.roles.cache.has(r))) return true;
  if (channelId && exemptChannels.includes(channelId)) return true;
  return false;
}

module.exports = { isAdmin, isModerator, isStaff, canModerate, hasCommandPermission, isExempt };
