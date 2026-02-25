const fs = require('fs');
const path = require('path');
const { REST, Routes, Collection } = require('discord.js');

async function loadCommands(client) {
  client.commands = new Collection();
  const commandsPath = path.join(__dirname, '..', 'commands');
  const categories = fs.readdirSync(commandsPath).filter((f) => {
    return fs.statSync(path.join(commandsPath, f)).isDirectory();
  });

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      const command = require(path.join(categoryPath, file));
      if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
      } else {
        console.warn(`[Commands] Skipping ${category}/${file}: missing data or execute.`);
      }
    }
  }

  console.log(`[Commands] Loaded ${client.commands.size} commands.`);
}

async function registerCommands(client) {
  const commands = client.commands.map((cmd) => cmd.data.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

  try {
    console.log(`[Commands] Registering ${commands.length} slash commands...`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );
    console.log('[Commands] Slash commands registered successfully.');
  } catch (error) {
    console.error('[Commands] Failed to register slash commands:', error);
  }
}

module.exports = { loadCommands, registerCommands };
