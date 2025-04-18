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
    return { 
      success: true, 
      status: 'already_initialized',
      message: 'RAG system already initialized'
    };
  }

  if (!ragConfig.enabled) {
    logger.info('RAG system is disabled in configuration');
    return { 
      success: false, 
      status: 'disabled',
      message: 'RAG system is disabled in configuration'
    };
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
      success: true,
      status: 'initialized',
      message: `RAG system initialized with status: ${state.healthStatus}`,
      healthStatus: state.healthStatus 
    };
  } catch (error) {
    logger.error(`Failed to initialize RAG system: ${error.message}`);
    state.healthStatus = 'failed';
    return { 
      success: false,
      status: 'error',
      message: error.message,
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
    const result = await knowledgeBase.addDocument(title, content, metadata);
    // commands.jsとのインターフェース互換性のため、プロパティ名を調整
    if (result.success && result.knowledgeId) {
      return { 
        ...result,
        documentId: result.knowledgeId,
        chunkCount: result.successfulChunks || 1
      };
    }
    return result;
  } catch (error) {
    logger.error(`Failed to add document to knowledge base: ${error.message}`);
    return { 
      success: false, 
      error: error.message
    };
  }
}

/**
 * ナレッジベースのドキュメント一覧を取得する
 * @returns {Promise<Array<Object>>} ドキュメント一覧
 */
async function listDocuments() {
  if (!ragConfig.enabled || !state.initialized) {
    return [];
  }
  
  try {
    // Supabaseクライアントを取得
    const client = vectorStore.getClient ? vectorStore.getClient() : 
                  require('../memory/supabase-client').getClient();
    
    // ナレッジベーステーブルからドキュメントを取得
    const { data, error } = await client
      .from(vectorStore.config.tables.knowledgeBase)
      .select('*')
      .order('updated_at', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    logger.error(`Failed to list documents: ${error.message}`);
    return [];
  }
}

/**
 * ナレッジベースから特定のドキュメントを取得する
 * @param {string} documentId ドキュメントID
 * @returns {Promise<Object>} ドキュメント情報
 */
async function getDocument(documentId) {
  if (!ragConfig.enabled || !state.initialized || !documentId) {
    return null;
  }
  
  try {
    // Supabaseクライアントを取得
    const client = vectorStore.getClient ? vectorStore.getClient() : 
                  require('../memory/supabase-client').getClient();
    
    // ナレッジベーステーブルから特定のドキュメントを取得
    const { data, error } = await client
      .from(vectorStore.config.tables.knowledgeBase)
      .select('*')
      .eq('id', documentId)
      .single();
    
    if (error) throw error;
    
    return data;
  } catch (error) {
    logger.error(`Failed to get document: ${error.message}`);
    return null;
  }
}

/**
 * ナレッジベースからドキュメントを削除する
 * @param {string} documentId ドキュメントID
 * @returns {Promise<Object>} 削除結果
 */
async function deleteDocument(documentId) {
  if (!ragConfig.enabled || !state.initialized || !documentId) {
    return { 
      success: false, 
      error: 'RAG system is not enabled or initialized, or invalid document ID'
    };
  }
  
  try {
    // Supabaseクライアントを取得
    const client = vectorStore.getClient ? vectorStore.getClient() : 
                  require('../memory/supabase-client').getClient();
    
    // まず関連するチャンクを削除
    const { error: chunksError } = await client
      .from(vectorStore.config.tables.knowledgeChunks)
      .delete()
      .eq('knowledge_id', documentId);
    
    if (chunksError) throw chunksError;
    
    // 次にドキュメント自体を削除
    const { error: docError } = await client
      .from(vectorStore.config.tables.knowledgeBase)
      .delete()
      .eq('id', documentId);
    
    if (docError) throw docError;
    
    logger.info(`Document deleted: ${documentId}`);
    return { success: true };
  } catch (error) {
    logger.error(`Failed to delete document: ${error.message}`);
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

/**
 * メッセージハンドラー用のコンテキスト生成関数（互換性のため）
 * @param {string} query ユーザーの質問または入力
 * @param {Object} options 検索オプション
 * @returns {Promise<string>} 生成されたコンテキスト
 */
async function generateContextForPrompt(query, options = {}) {
  const searchResult = await processMessage(query, options);
  return searchResult.context || '';
}

/**
 * RAGシステムが初期化されているかどうかを確認する
 * @returns {boolean} 初期化状態
 */
function isInitialized() {
  return state.initialized;
}

/**
 * レガシーインターフェース互換用のナレッジベース追加関数
 * @param {string} title ドキュメントのタイトル 
 * @param {string} content ドキュメントの内容
 * @param {Object} metadata メタデータ
 * @returns {Promise<Object>} 追加結果
 */
async function addToKnowledgeBase(title, content, metadata = {}) {
  return await addDocument(title, content, metadata);
}

/**
 * テキストクエリでナレッジベースを検索する（commands.js用）
 * @param {string} query 検索クエリ
 * @param {Object} options 検索オプション
 * @returns {Promise<Array<Object>>} 検索結果
 */
async function search(query, options = {}) {
  if (!ragConfig.enabled || !state.initialized) {
    return [];
  }
  
  try {
    const searchResult = await processMessage(query, options);
    return searchResult.results || [];
  } catch (error) {
    logger.error(`Search failed: ${error.message}`);
    return [];
  }
}

/**
 * RAGシステムのインスタンスを取得する
 * @returns {Object|null} RAGシステムのインスタンス
 */
function getRAGSystem() {
  if (!ragConfig.enabled) {
    return null;
  }
  
  return {
    initialize,
    processMessage,
    addDocument,
    listDocuments,
    getDocument,
    deleteDocument,
    checkHealth,
    generateContextForPrompt,
    query: search,
    isInitialized,
    config: ragConfig,
    state
  };
}

// モジュールのエクスポート
module.exports = {
  initialize,
  addDocument,
  listDocuments,
  getDocument,
  deleteDocument,
  checkHealth,
  processMessage,
  generateContextForPrompt,
  isInitialized,
  search,
  addToKnowledgeBase,
  // RAGシステム全体を取得する関数を追加
  getRAGSystem
};