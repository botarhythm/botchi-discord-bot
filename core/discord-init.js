/**
 * Bocchy Discord Bot - シンプル版Discord初期化
 */

const { Client, GatewayIntentBits, Events, Partials, ActivityType } = require('discord.js');
const { handleMessage } = require('../handlers/message-handler');
const logger = require('../system/logger');

/**
 * シンプル化したDiscordクライアント設定と起動
 */
function setupClient() {
  // Discordクライアントを初期化
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageReactions
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.User
    ]
  });

  // Ready Event
  client.once(Events.ClientReady, (readyClient) => {
    logger.info(`Ready! Logged in as ${readyClient.user.tag}`);
    logger.info(`Bot ID: ${readyClient.user.id}`);
    
    // ステータス設定
    client.user.setActivity('森の奥で静かに待機中 🌿', { type: ActivityType.Playing });
  });

  // Message Event
  client.on(Events.MessageCreate, async (message) => {
    try {
      await handleMessage(message, client);
    } catch (error) {
      logger.error('Message event error:', error);
    }
  });

  // Error Handling
  client.on('error', (error) => {
    logger.error('Discord.js error:', error);
  });

  // Login
  client.login(process.env.DISCORD_TOKEN)
    .then(() => {
      logger.info('Bot login successful');
    })
    .catch(err => {
      logger.error('Bot login failed:', err);
    });

  return client;
}

module.exports = { setupClient };