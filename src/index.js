require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadCommands, registerCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');
const config = require('./config/ConfigManager');
const { TicketManager } = require('./modules/tickets/TicketManager');
const { AntiSpam } = require('./modules/moderation/AntiSpam');
const { AntiRaid } = require('./modules/moderation/AntiRaid');
const { PerspectiveAPI } = require('./modules/toxicity/PerspectiveAPI');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

client.config = config;
client.ticketManager = new TicketManager(client);
client.antiSpam = new AntiSpam(client);
client.antiRaid = new AntiRaid(client);
client.perspective = new PerspectiveAPI();

(async () => {
  await loadCommands(client);
  loadEvents(client);
  await client.login(process.env.BOT_TOKEN);
})();

process.on('SIGINT', () => {
  console.log('[Bot] Shutting down gracefully...');
  config.save();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Bot] Shutting down gracefully...');
  config.save();
  client.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error('[Bot] Unhandled promise rejection:', error);
});
