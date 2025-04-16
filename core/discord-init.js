/**
 * Bocchy Discord Bot - シンプル版Discord初期化
 * 循環参照解消のためにリファクタリング
 */

const { Client, GatewayIntentBits, Events, Partials, ActivityType } = require('discord.js');
const logger = require('../system/logger');
const config = require('../config/env'); // 直接configをインポート

/**
 * Discordクライアントを初期化
 * @returns {Object} - 初期化されたDiscordクライアント
 */
function initializeClient() {
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

  // Error Handling
  client.on('error', (error) => {
    logger.error('Discord.js error:', error);
  });

  return client;
}

/**
 * クライアントにメッセージイベントハンドラーを登録
 * @param {Object} client - Discordクライアント
 * @param {Function} messageHandler - メッセージ処理関数
 */
function registerMessageHandler(client, messageHandler) {
  if (!client || typeof messageHandler !== 'function') {
    logger.error('Invalid client or message handler');
    return;
  }

  // Message Event
  client.on(Events.MessageCreate, async (message) => {
    try {
      await messageHandler(message, client);
    } catch (error) {
      logger.error('Message event error:', error);
    }
  });

  logger.debug('Message handler registered successfully');
}

/**
 * クライアントにログイン
 * @param {Object} client - Discordクライアント
 * @returns {Promise} - ログイン処理のPromise
 */
function loginClient(client) {
  if (!client) {
    const error = new Error('Client is not initialized');
    logger.error('Login failed:', error);
    return Promise.reject(error);
  }

  return client.login(process.env.DISCORD_TOKEN)
    .then(() => {
      logger.info('Bot login successful');
      return client;
    })
    .catch(err => {
      logger.error('Bot login failed:', err);
      throw err;
    });
}

module.exports = { 
  initializeClient, 
  registerMessageHandler, 
  loginClient 
};