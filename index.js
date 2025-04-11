const { Client, GatewayIntentBits, Events } = require('discord.js');
const http = require('http');

// Create an HTTP server to keep the bot alive
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Discord Bot is running!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Discord client setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Ready event
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

// Message event
client.on(Events.MessageCreate, async (message) => {
  // Ignore messages from the bot itself
  if (message.author.bot) return;

  console.log(`Message received: ${message.content} (from: ${message.author.tag})`);

  // !ping command
  if (message.content === '!ping') {
    await message.reply('Pong!');
    return;
  }

  // !hello command
  if (message.content === '!hello') {
    await message.reply(`Hello, ${message.author.username}!`);
    return;
  }

  // When bot is mentioned
  if (message.mentions.has(client.user)) {
    await message.reply('How can I help you?');
    return;
  }
});

// Error handling
client.on('error', (error) => {
  console.error('Discord.js error:', error);
});

// Login to Discord with token
client.login(process.env.DISCORD_TOKEN);
