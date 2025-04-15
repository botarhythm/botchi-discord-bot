/**
 * Bocchy Discord Bot - メインエントリーポイント
 * 
 * このファイルは以下の処理を行います：
 * 1. 環境変数の読み込み
 * 2. ヘルスチェックサーバーの起動
 * 3. Discordクライアントのセットアップと起動
 * 4. 文脈介入機能とメッセージハンドリングの統合
 */

// 環境変数の設定を読み込み
require('dotenv').config();

// 統合パス解決モジュールをインポート
const syncUtil = require('./local-sync-utility');

// ロガーを初期化
const logger = syncUtil.safeRequire('./system/logger', syncUtil.createSimpleLogger());

// 設定を読み込み
const config = syncUtil.safeRequire('./config/env', {
  INTERVENTION_MODE: process.env.INTERVENTION_MODE || 'balanced',
  INTERVENTION_KEYWORDS: (process.env.INTERVENTION_KEYWORDS || 'ボッチー,Bocchy,ボット,Bot').split(','),
  INTERVENTION_COOLDOWN: parseInt(process.env.INTERVENTION_COOLDOWN || '60', 10),
  AI_PROVIDER: process.env.AI_PROVIDER || 'openai',
  DM_MESSAGE_HANDLER: process.env.DM_MESSAGE_HANDLER || 'legacy',
  DEBUG: process.env.DEBUG === 'true',
  BOT_VERSION: '1.3.1' // 安定性改善版
});

// Bocchyのバージョン情報を表示
logger.info(`Bocchy Discord Bot v${config.BOT_VERSION} starting...`);
logger.info(`Node.js Version: ${process.version}`);
logger.info(`Discord.js Version: ${require('discord.js').version}`);
logger.info(`Context intervention mode: ${config.INTERVENTION_MODE || 'balanced'}`);
logger.info(`Running environment: ${syncUtil.isRailwayEnvironment ? 'Railway' : 'Local'}`);
logger.info(`Application root: ${syncUtil.appRoot}`);

// ヘルスチェックサーバーを起動
try {
  const { createServer } = syncUtil.safeRequire('./server/health-server', { createServer: () => logger.warn('Health server module not found, skipping') });
  createServer();
  logger.info('Health check server started');
} catch (error) {
  logger.warn('Failed to start health check server:', error);
}

// メッセージ履歴システムの初期化
logger.info('Initializing message history system...');
const messageHistory = syncUtil.safeRequire('./extensions/message-history', {
  initialize: () => Promise.resolve({ status: 'fallback' }),
  addMessageToHistory: () => {},
  getRecentMessages: () => [],
  getLastBotMessageTime: () => 0,
  updateLastBotMessageTime: () => {}
});

if (typeof messageHistory.initialize === 'function') {
  messageHistory.initialize()
    .then(() => logger.info('Message history system initialized successfully'))
    .catch(err => logger.error('Failed to initialize message history system:', err));
} else {
  logger.warn('Message history system has no initialize method, using fallback');
}

// メモリシステムの初期化（永続的会話履歴）
if (config.MEMORY_ENABLED === true) {
  logger.info('Memory system enabled, initializing...');
  const memorySystem = syncUtil.safeRequire('./extensions/memory', {
    initialize: () => Promise.resolve({ status: 'fallback' }),
    manager: null,
    checkHealth: () => Promise.resolve({ status: 'unhealthy', message: 'Memory module not loaded' }),
    resetUserConversations: () => Promise.resolve(false)
  });
  
  // グローバル変数として保存し、他のモジュールからアクセス可能に
  global.botchiMemory = memorySystem;
  
  // メモリシステムを初期化
  if (typeof memorySystem.initialize === 'function') {
    memorySystem.initialize()
      .then(result => {
        logger.info('Memory system initialized successfully');
        
        // メモリシステムの健全性を確認
        return memorySystem.checkHealth();
      })
      .then(health => {
        if (health && health.status === 'healthy') {
          logger.info(`Memory system health check passed: ${health.message || 'OK'}`);
        } else {
          logger.warn(`Memory system health check warning: ${health.message || 'Unknown issue'}`);
        }
      })
      .catch(err => {
        logger.error('Failed to initialize memory system:', err);
        logger.warn('Continuing with limited functionality');
      });
  } else {
    logger.warn('Memory system has no initialize method, functionality will be limited');
  }
} else {
  logger.info('Memory system is disabled, using in-memory message history only');
  
  // 無効でも安全に動作するようにフォールバックモジュールをグローバル変数にセット
  global.botchiMemory = {
    manager: null,
    initialize: () => Promise.resolve({ status: 'disabled' }),
    checkHealth: () => Promise.resolve({ status: 'disabled', message: 'Memory system is disabled' }),
    resetUserConversations: () => Promise.resolve(false)
  };
}

// Discordクライアントをセットアップして起動
logger.info('Setting up Discord client...');
const { setupClient } = syncUtil.safeRequire('./core/discord-init', {
  setupClient: () => {
    logger.error('Critical error: Discord client setup module not found');
    process.exit(1); // ここだけは致命的なため終了
    return null;
  }
});
const client = setupClient();

// 未処理の例外ハンドラ
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

// 未処理のPromise拒否ハンドラ
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
