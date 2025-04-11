const { Client, GatewayIntentBits, Events, ChannelType } = require('discord.js');
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

// Discord client setup with all required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,          // DMを受信するために必要
    GatewayIntentBits.DirectMessageReactions   // DMでのリアクションに必要
  ],
});

// Ready event
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  console.log(`Configured intents: ${JSON.stringify(client.options.intents)}`);
});

// Message event
client.on(Events.MessageCreate, async (message) => {
  // Ignore messages from the bot itself
  if (message.author.bot) return;

  // Determine if this is a DM
  const isDM = message.channel.type === ChannelType.DM;
  
  console.log(`Message received: ${message.content} (from: ${message.author.tag}, isDM: ${isDM})`);

  // Special handling for DMs
  if (isDM) {
    console.log(`Processing DM from ${message.author.tag}`);
    try {
      await message.reply('Thanks for your DM! How can I help you?');
      console.log(`Successfully replied to DM from ${message.author.tag}`);
    } catch (error) {
      console.error('Error responding to DM:', error);
    }
    return;
  }

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

// Debug event for connection issues
client.on(Events.Debug, (info) => {
  console.log(`Debug: ${info}`);
});

// Error handling
client.on('error', (error) => {
  console.error('Discord.js error:', error);
});

// Login to Discord with token
client.login(process.env.DISCORD_TOKEN);
