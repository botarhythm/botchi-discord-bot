/**
 * RAGシステム - Bocchy Bot用Retrieval-Augmented Generation機能
 * 
 * ベクトル検索による知識強化型の会話応答を実現するシステム
 * 
 * @module extensions/rag
 */

const logger = require('../../system/logger');
const knowledgeBase = require('./knowledge-base');
const queryEngine = require('./query-engine');
const vectorStore = require('./vector-store');
const embeddings = require('./embeddings');
const chunkManager = require('./chunk-manager');

/**
 * RAGシステム設定
 * @private
 */
const ragConfig = {
  enabled: process.env.RAG_ENABLED === 'true',
  // 基本設定
  maxContextLength: parseInt(process.env.RAG_MAX_CONTEXT_LENGTH || '2000', 10),
  // 初期化設定
  initializeOnStart: process.env.RAG_INITIALIZE_ON_START !== 'false',
  healthCheckInterval: parseInt(process.env.RAG_HEALTH_CHECK_INTERVAL || '3600000', 10), // 1時間
  // 使用設定
  enableForCommands: process.env.RAG_ENABLE_FOR_COMMANDS === 'true',
  enableForMentions: process.env.RAG_ENABLE_FOR_MENTIONS !== 'false',
  enableForDMs: process.env.RAG_ENABLE_FOR_DMS !== 'false',
  // 検索設定
  similarityThreshold: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.75')
};

/**
 * RAGシステムの状態
 * @private
 */
const state = {
  initialized: false,
  healthStatus: 'unknown',
  lastHealthCheck: null,
  healthCheckTimer: null
};

/**
 * RAGシステムを初期化する
 * @returns {Promise<Object>} 初期化結果
 */
async function initialize() {
  if (state.initialized) {
    logger.debug('RAG system already initialized');
    return { status: 'already_initialized' };
  }

  if (!ragConfig.enabled) {
    logger.info('RAG system is disabled in configuration');
    return { status: 'disabled' };
  }

  try {
    logger.info('Initializing RAG system...');
    
    // 各コンポーネントを初期化
    await knowledgeBase.initialize();
    
    // ヘルスチェックの実行
    const health = await checkHealth();
    state.healthStatus = health.status;
    state.lastHealthCheck = new Date();
    
    // 定期的なヘルスチェックのスケジュール設定
    setupHealthCheckInterval();
    
    // 初期化完了
    state.initialized = true;
    logger.info(`RAG system initialized with status: ${state.healthStatus}`);
    
    return { 
      status: 'initialized',
      healthStatus: state.healthStatus 
    };
  } catch (error) {
    logger.error(`Failed to initialize RAG system: ${error.message}`);
    state.healthStatus = 'failed';
    return { 
      status: 'error',
      error: error.message
    };
  }
}

/**
 * 定期的なヘルスチェックを設定する
 * @private
 */
function setupHealthCheckInterval() {
  // 既存のタイマーをクリア
  if (state.healthCheckTimer) {
    clearInterval(state.healthCheckTimer);
  }
  
  // 新しいタイマーを設定
  state.healthCheckTimer = setInterval(async () => {
    try {
      const health = await checkHealth();
      state.healthStatus = health.status;
      state.lastHealthCheck = new Date();
      
      logger.debug(`RAG system periodic health check: ${state.healthStatus}`);
    } catch (error) {
      logger.error(`RAG system health check failed: ${error.message}`);
      state.healthStatus = 'error';
    }
  }, ragConfig.healthCheckInterval);
}

/**
 * ユーザーからのメッセージを処理し、RAG検索を行う
 * @param {string} message ユーザーメッセージ
 * @param {Object} options 検索オプション
 * @returns {Promise<Object>} 検索結果とコンテキスト
 */
async function processMessage(message, options = {}) {
  // システムが無効または初期化されていない場合
  if (!ragConfig.enabled || !state.initialized) {
    return { context: '', results: [] };
  }
  
  try {
    // クエリエンジンを使用して検索を実行
    const searchResult = await queryEngine.search(message);
    
    logger.debug(`RAG process complete: ${searchResult.metadata.selectedResults} results found`);
    
    return searchResult;
  } catch (error) {
    logger.error(`RAG message processing failed: ${error.message}`);
    return { 
      context: '',
      results: [],
      error: error.message
    };
  }
}

/**
 * ナレッジベースにドキュメントを追加する
 * @param {string} title ドキュメントのタイトル
 * @param {string} content ドキュメントの内容
 * @param {Object} metadata メタデータ
 * @returns {Promise<Object>} 追加結果
 */
async function addDocument(title, content, metadata = {}) {
  if (!ragConfig.enabled || !state.initialized) {
    return { 
      success: false, 
      error: 'RAG system is not enabled or initialized'
    };
  }
  
  try {
    return await knowledgeBase.addDocument(title, content, metadata);
  } catch (error) {
    logger.error(`Failed to add document to knowledge base: ${error.message}`);
    return { 
      success: false, 
      error: error.message
    };
  }
}

/**
 * RAGシステムのヘルスを確認する
 * @returns {Promise<Object>} ヘルスステータス
 */
async function checkHealth() {
  try {
    // 各コンポーネントのヘルスを確認
    const qeHealth = await queryEngine.checkHealth();
    
    // 全体のステータスを判断
    let systemStatus = 'healthy';
    if (qeHealth.status === 'unhealthy') {
      systemStatus = 'unhealthy';
    } else if (qeHealth.status === 'degraded') {
      systemStatus = 'degraded';
    }
    
    return {
      status: systemStatus,
      message: `RAG system is ${systemStatus}`,
      components: {
        queryEngine: qeHealth
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'error',
      message: `RAG system health check error: ${error.message}`,
      timestamp: new Date().toISOString()
    };
  }
}

// 自動初期化（設定されている場合）
if (ragConfig.enabled && ragConfig.initializeOnStart) {
  // 非同期で初期化を実行
  Promise.resolve().then(async () => {
    try {
      await initialize();
    } catch (error) {
      logger.error(`Auto-initialization of RAG system failed: ${error.message}`);
    }
  });
}

module.exports = {
  initialize,
  processMessage,
  addDocument,
  checkHealth,
  config: ragConfig,
  // サブモジュールへの直接アクセスも提供
  knowledgeBase,
  queryEngine,
  vectorStore,
  embeddings,
  chunkManager
};