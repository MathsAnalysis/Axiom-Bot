const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config/ConfigManager');
const i18n = require('../../locales/I18n');
const { isAdmin } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('permissions')
    .setDescription('Set required role for a command')
    .addStringOption((opt) =>
      opt.setName('command').setDescription('Command name (without /)').setRequired(true),
    )
    .addRoleOption((opt) =>
      opt.setName('role').setDescription('Required role to use the command').setRequired(true),
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed('Error', i18n.t('general.no_permission'))],
        ephemeral: true,
      });
    }

    const commandName = interaction.options.getString('command');
    const role = interaction.options.getRole('role');

    // Set the permission in command_permissions config
    config.set(`command_permissions.${commandName}`, role.id);

    return interaction.reply({
      embeds: [
        successEmbed(
          i18n.t('permissions.list_title'),
          i18n.t('permissions.set_success', { command: commandName, role: `${role}` }),
        ),
      ],
      ephemeral: true,
    });
  },
};
