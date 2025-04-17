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
  BOT_VERSION: '1.3.5' // 安定性改善版
});

// Bocchyのバージョン情報を表示
logger.info(`Bocchy Discord Bot v${config.BOT_VERSION} starting...`);
logger.info(`Node.js Version: ${process.version}`);
logger.info(`Discord.js Version: ${require('discord.js').version}`);
logger.info(`Context intervention mode: ${config.INTERVENTION_MODE || 'balanced'}`);
logger.info(`Running environment: ${syncUtil.isRailwayEnvironment ? 'Railway' : 'Local'}`);
logger.info(`Application root: ${syncUtil.appRoot}`);

// 検索API機能の状態確認
if (config.BRAVE_API_KEY) {
  logger.info(`Brave Search API is configured (key: ${config.BRAVE_API_KEY.substring(0, 3)}...)`);
} else {
  logger.warn('Brave Search API is not configured - search functionality will be disabled');
}

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

// RAGシステムの初期化（ナレッジベースと埋め込み検索）
if (process.env.RAG_ENABLED === 'true') {
  logger.info('RAG system enabled, initializing...');
  const ragSystem = syncUtil.safeRequire('./extensions/rag', {
    initialize: () => Promise.resolve({ success: false, message: 'RAG module not loaded' }),
    checkHealth: () => Promise.resolve({ status: 'unhealthy', message: 'RAG module not loaded' }),
    search: () => Promise.resolve([]),
    addToKnowledgeBase: () => Promise.resolve({ success: false }),
    generateContextForPrompt: () => Promise.resolve('')
  });
  
  // グローバル変数として保存し、他のモジュールからアクセス可能に
  global.botchiRAG = ragSystem;
  
  // RAGシステムを初期化
  if (typeof ragSystem.initialize === 'function') {
    ragSystem.initialize()
      .then(result => {
        if (result.success) {
          logger.info('RAG system initialized successfully');
          
          // RAGシステムの健全性を確認
          return ragSystem.checkHealth();
        } else {
          throw new Error(result.message || 'Unknown error during RAG initialization');
        }
      })
      .then(health => {
        if (health && health.status === 'healthy') {
          logger.info(`RAG system health check passed: ${health.message || 'OK'}`);
        } else {
          logger.warn(`RAG system health check warning: ${health.message || 'Unknown issue'}`);
        }
      })
      .catch(err => {
        logger.error('Failed to initialize RAG system:', err);
        logger.warn('Continuing with limited RAG functionality');
      });
  } else {
    logger.warn('RAG system has no initialize method, functionality will be limited');
  }
} else {
  logger.info('RAG system is disabled');
  
  // 無効でも安全に動作するようにフォールバックモジュールをグローバル変数にセット
  global.botchiRAG = {
    initialize: () => Promise.resolve({ success: false, message: 'RAG system is disabled' }),
    checkHealth: () => Promise.resolve({ status: 'disabled', message: 'RAG system is disabled' }),
    search: () => Promise.resolve([]),
    addToKnowledgeBase: () => Promise.resolve({ success: false }),
    generateContextForPrompt: () => Promise.resolve(''),
    isInitialized: () => false
  };
}

// ===== 修正された初期化フロー =====

// 1. AIサービスモジュールを読み込み
logger.info('Loading AI service module...');
const aiService = syncUtil.safeRequire('./ai-service', {
  initialize: () => Promise.reject(new Error('AI service module not found')),
  getResponse: () => Promise.reject(new Error('AI service not initialized')),
  checkHealth: () => Promise.reject(new Error('AI service health check failed'))
});

// 2. Discordクライアントモジュール読み込み
logger.info('Setting up Discord client...');
const discordInit = syncUtil.safeRequire('./core/discord-init', {
  initializeClient: () => {
    logger.error('Critical error: Discord client initialization module not found');
    process.exit(1); // ここだけは致命的なため終了
    return null;
  },
  registerMessageHandler: () => {},
  loginClient: () => Promise.reject(new Error('Discord login module not found'))
});

// 2. クライアントを初期化（メッセージハンドラーの登録なし）
const client = discordInit.setupClient();
if (!client) {
  logger.error('Failed to initialize Discord client');
  process.exit(1);
}

// 3. AIサービスを初期化
logger.info(`Initializing AI service with provider: ${config.AI_PROVIDER}...`);
aiService.initialize(config.AI_PROVIDER)
  .then(result => {
    // 新しいai-service.jsでは結果形式が変わっているため、互換性を持たせる
    const isInitialized = result.success === true || result.initialized === true;
    logger.info(`AI service initialized: ${isInitialized ? 'Success' : 'Failed'}`);
    if (isInitialized) {
      logger.info(`Active AI provider: ${result.provider || config.AI_PROVIDER}, Model: ${result.model || 'Unknown'}`);
    } else {
      logger.warn(`AI service initialization failed: ${result.error || 'Unknown error'}`);
    }
    return aiService.checkHealth();
  })
  .then(health => {
    logger.info(`AI service health: ${health.status}, provider: ${health.provider || 'Unknown'}`);
  })
  .catch(error => {
    logger.error('Failed to initialize AI service:', error);
    logger.warn('Continuing with limited AI functionality');
  });

// 4. メッセージハンドラーの読み込み（循環参照を解消）
const messageHandlerModule = syncUtil.safeRequire('./handlers/message-handler', {
  handleMessage: () => {
    logger.error('Message handler module not found or invalid');
    return Promise.resolve();
  },
  setAIProvider: () => {}
});

// 5. AIサービスをメッセージハンドラーに登録
if (typeof messageHandlerModule.setAIProvider === 'function') {
  messageHandlerModule.setAIProvider(aiService);
  logger.info('AI service registered with message handler');
} else {
  logger.warn('Failed to register AI service with message handler - setAIProvider method not found');
}

// 6. メッセージイベントを直接登録
client.on('messageCreate', async (message) => {
  try {
    await messageHandlerModule.handleMessage(message);
  } catch (error) {
    logger.error('Error handling message:', error);
  }
});
logger.debug('Message handler registered successfully');

// 7. クライアントにログイン
discordInit.loginClient()
  .then(() => {
    logger.info('Bocchy Discord Bot is ready!');
  })
  .catch(error => {
    logger.error('Failed to start Bocchy Discord Bot:', error);
    process.exit(1);
  });

// 未処理の例外ハンドラ
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

// 未処理のPromise拒否ハンドラ
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});