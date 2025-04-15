/**
 * Bocchy Discord Bot - Discord初期化
 * Discordクライアントの設定と初期化
 */

const { Client, GatewayIntentBits, Events, Partials, ActivityType } = require('discord.js');
const { handleMessage } = require('../handlers/message-handler');
const syncUtil = require('../local-sync-utility');
const logger = require('../system/logger');
const config = require('../config/env');

// messageHistoryモジュールを安全にロード
const messageHistory = syncUtil.safeRequire('../extensions/message-history', {
  initialize: () => Promise.resolve({ status: 'fallback' }),
  addMessageToHistory: () => {},
  getRecentMessages: () => [],
  getLastBotMessageTime: () => 0,
  updateLastBotMessageTime: () => {}
});

// AIサービスを取得
let aiService;
if (config.DM_MESSAGE_HANDLER === 'new') {
  // 新プロバイダーシステム - 安全なモジュールロード
  try {
    aiService = syncUtil.safeRequire('../extensions/providers', {
      initialize: () => Promise.resolve({ status: 'fallback' }),
      getProvider: () => null,
      getProviderName: () => 'fallback',
      checkHealth: () => Promise.resolve({ status: 'fallback' })
    });
    logger.info('Successfully loaded new provider system in discord-init');
  } catch (error) {
    logger.error('Failed to load new provider system in discord-init:', error);
    // フォールバックモック
    aiService = {
      initialize: () => Promise.resolve({ status: 'fallback' }),
      getProvider: () => null,
      getProviderName: () => 'fallback',
      checkHealth: () => Promise.resolve({ status: 'unhealthy', error: 'Module load failed' })
    };
  }
} else {
  // レガシーシステム - 安全なモジュールロード
  try {
    aiService = config.AI_PROVIDER === 'openai'
      ? syncUtil.safeRequire('../openai-service')
      : syncUtil.safeRequire('../gemini-service');
    logger.info(`Successfully loaded legacy ${config.AI_PROVIDER} system in discord-init`);
  } catch (error) {
    logger.error(`Failed to load legacy ${config.AI_PROVIDER} system in discord-init:`, error);
    // フォールバックモック
    aiService = {
      initialize: () => Promise.resolve({ status: 'fallback' }),
      isConfigured: () => false,
      checkHealth: () => Promise.resolve({ status: 'unhealthy', error: 'Module load failed' })
    };
  }
}

/**
 * Discordクライアントを設定して起動する
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
      Partials.Channel,  // DMチャンネル用
      Partials.Message,  // DMメッセージ用
      Partials.User      // DMユーザー用
    ]
  });

  // Ready Event
  client.once(Events.ClientReady, async (readyClient) => {
    logger.info(`Ready! Logged in as ${readyClient.user.tag}`);
    logger.info(`Discord.js Version: ${require('discord.js').version}`);
    logger.info(`Bot User ID: ${readyClient.user.id}`);
    logger.info(`Bot Username: ${readyClient.user.username}`);
    logger.info(`Bot Tag: ${readyClient.user.tag}`);
    
    // インテント詳細表示
    if (config.DEBUG) {
      logger.debug('Direct Messages intent enabled:',
        (client.options.intents & GatewayIntentBits.DirectMessages) === GatewayIntentBits.DirectMessages);
      logger.debug('Message Content intent enabled:',
        (client.options.intents & GatewayIntentBits.MessageContent) === GatewayIntentBits.MessageContent);
    }
    
    // AIサービスの初期化
    try {
      if (config.DM_MESSAGE_HANDLER === 'new') {
        // 新プロバイダーシステムの初期化
        const initResult = await aiService.initialize({ provider: config.AI_PROVIDER });
        logger.info('Provider system initialized:', initResult);
        
        // プロバイダーの健全性チェック
        const provider = aiService.getProvider();
        if (provider && typeof provider.isConfigured === 'function' && provider.isConfigured()) {
          logger.info(`${aiService.getProviderName()} AI service is properly configured`);
          
          // 起動時のヘルスチェック
          try {
            const healthStatus = await aiService.checkHealth();
            logger.info(`Initial health check: ${aiService.getProviderName().toUpperCase()} API ${healthStatus.status}`);
          } catch (error) {
            logger.error('Initial health check failed:', error);
          }
        } else {
          logger.warn(`WARNING: ${aiService.getProviderName().toUpperCase()} AI service is not configured. Bot will use fallback responses.`);
        }
      } else {
        // 従来のシステムの初期化
        await aiService.initialize();
        logger.info('AIサービスを初期化しました');
        
        // APIキー設定を確認
        if (aiService.isConfigured()) {
          logger.info(`${config.AI_PROVIDER.toUpperCase()} AI service is properly configured`);
          
          // 起動時のヘルスチェック
          try {
            const healthStatus = await aiService.checkHealth();
            logger.info(`Initial health check: ${config.AI_PROVIDER.toUpperCase()} API ${healthStatus.status}`);
          } catch (error) {
            logger.error('Initial health check failed:', error);
          }
        } else {
          logger.warn(`WARNING: ${config.AI_PROVIDER.toUpperCase()} AI service is not configured. Bot will use fallback responses.`);
        }
      }
    } catch (error) {
      logger.error('AIサービスの初期化に失敗しました:', error);
    }
    
    // メッセージ履歴管理システムの初期化
    try {
      if (typeof messageHistory.initialize === 'function') {
        await messageHistory.initialize();
        logger.info('Message history system initialized');
      } else {
        logger.info('Message history system has no initialize method, skipping initialization');
      }
    } catch (error) {
      logger.error('Message history system initialization failed:', error);
    }
    
    // 文脈介入システムのステータスログ
    logger.info(`Context intervention system initialized - Mode: ${config.INTERVENTION_MODE}, Cooldown: ${config.INTERVENTION_COOLDOWN}s`);
    
    // ステータスの設定 - Bocchyのキャラクターに合わせた表現に変更
    client.user.setActivity('森の奥で静かに待機中 🌿', { type: ActivityType.Playing });
    
    // 定期的なヘルスチェック（10分ごと）
    setInterval(async () => {
      try {
        const healthStatus = await aiService.checkHealth();
        
        if (config.DM_MESSAGE_HANDLER === 'new') {
          // 新プロバイダーシステムの場合
          const providerName = aiService.getProviderName() || 'AI';
          logger.info(`[ヘルスチェック] ${providerName.toUpperCase()} API: ${healthStatus.status}`);
          
          if (healthStatus.status === 'unhealthy') {
            logger.warn(`[警告] ${providerName.toUpperCase()} APIが応答していません`);
          }
        } else {
          // 従来のシステムの場合
          logger.info(`[ヘルスチェック] ${config.AI_PROVIDER.toUpperCase()} API: ${healthStatus.status}`);
          
          if (healthStatus.status === 'unhealthy') {
            logger.warn(`[警告] ${config.AI_PROVIDER.toUpperCase()} APIが応答していません`);
          }
        }
      } catch (error) {
        logger.error('[エラー] ヘルスチェック実行中に問題が発生しました:', error);
      }
    }, 10 * 60 * 1000);
  });

  // Debug Event - 接続問題の診断用
  client.on(Events.Debug, (info) => {
    if (config.DEBUG) {
      logger.debug(`Debug: ${info}`);
    }
  });

  // Error Handling
  client.on('error', (error) => {
    logger.error('Discord.js error:', error);
  });

  // Message Event
  client.on(Events.MessageCreate, async (message) => {
    try {
      // メッセージハンドラーを呼び出し
      await handleMessage(message, client);
    } catch (error) {
      logger.error('MessageCreate event error:', error);
    }
  });

  // Raw event logging for debugging - DMの問題診断用
  if (config.DEBUG) {
    client.on('raw', packet => {
      // DMに関連するイベント
      if (
        packet.t === 'MESSAGE_CREATE' || 
        packet.t === 'CHANNEL_CREATE' || 
        packet.t === 'DIRECT_MESSAGE_CREATE'
      ) {
        logger.debug(`RAW EVENT DETECTED: ${packet.t}`);
        
        // DMイベントがペイロードに含まれているか確認
        if (packet.d && packet.d.channel_type === 1) {
          logger.debug('DM MESSAGE DETECTED in RAW packet!');
          logger.debug('DM Data:', JSON.stringify(packet.d, null, 2).substring(0, 500));
        }
      }
    });
  }

  // Login to Discord with token
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