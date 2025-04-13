/**
 * Bocchy Discord Bot - Discord Platform Adapter
 * Discord特有の処理を実装するアダプター
 */

const { Client, GatewayIntentBits, Events, ChannelType, Partials, EmbedBuilder } = require('discord.js');
const http = require('http');
const logger = require('../../system/logger');
const config = require('../../system/config');
const monitor = require('../../system/monitor');
const messageHandler = require('../../core/message-handler');

// Discordクライアントインスタンス
let client = null;

// HTTPサーバーインスタンス
let server = null;

// 内部状態
const state = {
  initialized: false,
  connected: false,
  startTime: null,
  config: null
};

/**
 * Discordアダプターの初期化
 * @param {Object} options - 初期化オプション
 * @returns {Promise<Object>} 初期化結果
 */
async function initialize(options = {}) {
  if (state.initialized) {
    logger.debug('Discord adapter already initialized');
    return { initialized: true, reinitialized: true };
  }
  
  // 初期化済みフラグを立てる
  state.initialized = true;
  state.startTime = Date.now();
  
  // 設定情報をロード
  state.config = {
    token: config.get('discord.token'),
    prefix: config.get('bot.prefix') || '!',
    allowAllServers: config.get('bot.allowAllServers') || true,
    guildId: config.get('discord.guildId'),
    httpPort: config.get('bot.httpPort') || 3000,
    debug: config.get('bot.debug') || false
  };
  
  // トークンチェック
  if (!state.config.token) {
    logger.error('Discord token is not configured');
    return { initialized: false, error: 'Token not configured' };
  }
  
  // メッセージハンドラの初期化
  try {
    await messageHandler.initialize();
  } catch (error) {
    logger.error('Failed to initialize message handler:', error);
    monitor.recordError(error, { component: 'discord-adapter', stage: 'init' });
  }
  
  // Discordクライアントの初期化
  try {
    await initDiscordClient();
  } catch (error) {
    logger.error('Failed to initialize Discord client:', error);
    monitor.recordError(error, { component: 'discord-adapter', stage: 'init' });
    return { initialized: false, error: error.message };
  }
  
  // HTTPサーバーの起動
  try {
    startHttpServer();
  } catch (error) {
    logger.error('Failed to start HTTP server:', error);
    monitor.recordError(error, { component: 'discord-adapter', stage: 'init' });
    // HTTPサーバーの失敗は致命的ではないため継続
  }
  
  logger.info('Discord adapter initialized successfully');
  return { initialized: true };
}

/**
 * Discordクライアントの初期化
 * @returns {Promise<void>}
 */
async function initDiscordClient() {
  // 必要な各種インテントを設定
  client = new Client({
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
  
  // Readyイベントハンドラ
  client.once(Events.ClientReady, (readyClient) => {
    state.connected = true;
    
    logger.info(`Discord client ready. Logged in as ${readyClient.user.tag}`);
    logger.info(`Bot User ID: ${readyClient.user.id}`);
    logger.info(`Bot Username: ${readyClient.user.username}`);
    
    // ステータスの設定
    client.user.setActivity('森の奥で静かに待機中 🌿', { type: 'PLAYING' });
    
    // 健全性チェックを登録
    monitor.registerHealthCheck('discord', 'healthy', {
      connectedAt: Date.now(),
      username: readyClient.user.username,
      id: readyClient.user.id
    });
  });
  
  // メッセージ受信イベントハンドラ
  client.on(Events.MessageCreate, handleDiscordMessage);
  
  // エラーハンドリング
  client.on('error', (error) => {
    logger.error('Discord client error:', error);
    monitor.recordError(error, { component: 'discord-client' });
    monitor.registerHealthCheck('discord', 'warning', {
      lastError: error.message,
      timestamp: Date.now()
    });
  });
  
  // デバッグ情報
  if (state.config.debug) {
    client.on('debug', (info) => {
      logger.debug(`Discord debug: ${info}`);
    });
  }
  
  // Discordにログイン
  await client.login(state.config.token);
}

/**
 * Discordからのメッセージを処理
 * @param {Object} message - Discord.jsのメッセージオブジェクト
 */
async function handleDiscordMessage(message) {
  try {
    // 自分自身からのメッセージは無視
    if (message.author.bot) {
      return;
    }
    
    // サーバー制限が有効で、対象外のサーバーからのメッセージを無視
    if (!state.config.allowAllServers && 
        message.guild && 
        message.guild.id !== state.config.guildId) {
      return;
    }
    
    // DMかどうかを判定
    const isDM = message.channel.type === ChannelType.DM;
    
    if (state.config.debug) {
      logger.debug(`Message received - From: ${message.author.tag}, Content: "${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}"`);
      logger.debug(`Channel Type: ${message.channel.type}, Is DM: ${isDM}`);
    }
    
    // メンションチェック
    const isMentioned = message.mentions.has(client.user);
    
    // DMまたはメンションされた場合に応答
    if (isDM || isMentioned) {
      // メンションの場合、メンション部分を取り除く
      let cleanContent = message.content;
      if (isMentioned && !isDM) {
        cleanContent = cleanContent.replace(/<@!?[\d]+>/g, '').trim();
      }
      
      // 空の場合はデフォルトの挨拶
      if (cleanContent === '') {
        cleanContent = 'こんにちは';
      }
      
      // 入力中ステータスを表示
      await message.channel.sendTyping();
      
      // メッセージハンドラに処理を委譲
      const result = await messageHandler.handleMessage(
        { 
          ...message, 
          content: cleanContent 
        },
        { isDM }
      );
      
      // 結果があれば応答
      if (result.handled && result.response) {
        // 長いメッセージは分割して送信
        if (result.response.length > 2000) {
          const chunks = result.response.match(/.{1,2000}/gs);
          for (const chunk of chunks) {
            await message.reply(chunk);
          }
        } else {
          await message.reply(result.response);
        }
      }
    }
  } catch (error) {
    logger.error('Error handling Discord message:', error);
    monitor.recordError(error, { component: 'discord-message-handler' });
    
    // エラー時のサイレント失敗ではなくエラーメッセージを返す
    try {
      await message.reply('🍃 風が少し強くなっていて、うまく声が届かないようです。また後ほどお話ししましょう。');
    } catch (replyError) {
      // 応答自体が失敗した場合は説上げなし
      logger.error('Failed to send error response:', replyError);
    }
  }
}

/**
 * ステータス確認用HTTPサーバーを起動
 */
function startHttpServer() {
  const port = state.config.httpPort;
  
  server = http.createServer((req, res) => {
    if (req.url === '/health') {
      // ヘルスチェックエンドポイント
      const healthStatus = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        discord: {
          connected: state.connected,
          username: client?.user?.username || null
        },
        version: config.get('bot.version')
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(healthStatus));
    } else {
      // デフォルトエンドポイント
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`Bocchy Discord Bot v${config.get('bot.version')} is running! 🌿`);
    }
  });
  
  server.listen(port, () => {
    logger.info(`HTTP server is running on port ${port}`);
    logger.info(`Health endpoint: http://localhost:${port}/health`);
  });
}

/**
 * メッセージを送信
 * @param {string} channelId - 送信先チャンネルID
 * @param {string} content - 送信メッセージ
 * @param {Object} options - 送信オプション
 * @returns {Promise<Object>} 送信結果
 */
async function sendMessage(channelId, content, options = {}) {
  if (!state.connected || !client) {
    logger.error('Cannot send message: Discord client not connected');
    return { success: false, error: 'Client not connected' };
  }
  
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      logger.error(`Channel not found: ${channelId}`);
      return { success: false, error: 'Channel not found' };
    }
    
    const result = await channel.send(content);
    return { success: true, messageId: result.id };
  } catch (error) {
    logger.error(`Error sending message to channel ${channelId}:`, error);
    monitor.recordError(error, { component: 'discord-send-message', channelId });
    return { success: false, error: error.message };
  }
}

/**
 * リッチエンベッドメッセージを送信
 * @param {string} channelId - 送信先チャンネルID
 * @param {Object} embedData - エンベッドデータ
 * @param {Object} options - 送信オプション
 * @returns {Promise<Object>} 送信結果
 */
async function sendEmbed(channelId, embedData, options = {}) {
  if (!state.connected || !client) {
    logger.error('Cannot send embed: Discord client not connected');
    return { success: false, error: 'Client not connected' };
  }
  
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      logger.error(`Channel not found: ${channelId}`);
      return { success: false, error: 'Channel not found' };
    }
    
    const embed = new EmbedBuilder()
      .setColor(embedData.color || '#7da269')
      .setTitle(embedData.title || 'Bocchy')
      .setDescription(embedData.description || '');
    
    // フィールドの追加
    if (embedData.fields && Array.isArray(embedData.fields)) {
      embedData.fields.forEach(field => {
        embed.addFields({ name: field.name, value: field.value, inline: field.inline });
      });
    }
    
    // フッターの設定
    if (embedData.footer) {
      embed.setFooter({ text: embedData.footer });
    }
    
    const result = await channel.send({ embeds: [embed] });
    return { success: true, messageId: result.id };
  } catch (error) {
    logger.error(`Error sending embed to channel ${channelId}:`, error);
    monitor.recordError(error, { component: 'discord-send-embed', channelId });
    return { success: false, error: error.message };
  }
}

/**
 * ディスコードクライアントの状態を取得
 * @returns {Object} 状態情報
 */
function getStatus() {
  return {
    initialized: state.initialized,
    connected: state.connected,
    uptime: state.startTime ? Date.now() - state.startTime : 0,
    client: client ? {
      user: client.user ? {
        id: client.user.id,
        username: client.user.username,
        tag: client.user.tag
      } : null,
      guilds: client.guilds.cache.size,
      ping: client.ws.ping
    } : null
  };
}

/**
 * ディスコードクライアントを停止
 * @returns {Promise<boolean>} 停止成功かどうか
 */
async function shutdown() {
  try {
    if (server) {
      server.close();
      logger.info('HTTP server stopped');
    }
    
    if (client) {
      client.destroy();
      logger.info('Discord client destroyed');
    }
    
    state.connected = false;
    return true;
  } catch (error) {
    logger.error('Error during shutdown:', error);
    return false;
  }
}

module.exports = {
  initialize,
  sendMessage,
  sendEmbed,
  getStatus,
  shutdown
};