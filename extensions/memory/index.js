/**
 * Memory Extension - Bocchy Bot記憶システム
 * 
 * Supabaseを使用した会話履歴と記憶の管理システム
 * 会話コンテキスト、ユーザー情報、システム設定の永続化を提供
 * 
 * @module extensions/memory
 */

const memoryManager = require('./memory-manager');
const migration = require('./db-migration');
const supabase = require('./supabase-client');
const logger = require('../../system/logger');

/**
 * 自動マイグレーション設定
 * @private
 */
const AUTO_MIGRATION = process.env.SUPABASE_AUTO_MIGRATION === 'true';

/**
 * メモリシステムの初期化
 * @returns {Promise<Object>} 初期化されたメモリマネージャー
 */
async function initialize() {
  try {
    logger.info('Initializing memory system...');
    
    // 自動マイグレーションが有効な場合、テーブル作成を実行
    if (AUTO_MIGRATION) {
      logger.info('Auto migration enabled, running database migrations...');
      
      try {
        const migrationSuccess = await migration.runMigration();
        if (!migrationSuccess) {
          logger.warn('Migration failed, but continuing with initialization');
        }
      } catch (migrationError) {
        logger.error(`Migration error: ${migrationError.message}`);
        logger.warn('Continuing with initialization despite migration error');
      }
    }
    
    // メモリマネージャーを初期化
    let initialized = false;
    try {
      initialized = await memoryManager.initialize();
    } catch (managerError) {
      logger.error(`Memory manager initialization error: ${managerError.message}`);
      logger.warn('Memory manager failed to initialize properly');
    }
    
    if (!initialized) {
      logger.warn('Memory manager initialization returned false, will use fallback mode');
    } else {
      logger.info('Memory system initialized successfully');
    }
    
    return memoryManager;
  } catch (error) {
    logger.error(`Memory system initialization failed: ${error.message}`);
    // スタックトレースをログに出力
    if (error.stack) {
      logger.debug(`Initialization error stack: ${error.stack}`);
    }
    // 初期化に失敗してもマネージャーを返す
    // アプリケーションは適切にフォールバックする必要がある
    return memoryManager;
  }
}

/**
 * ヘルスチェック実行
 * @returns {Promise<Object>} ヘルスステータス情報
 */
async function checkHealth() {
  try {
    return await memoryManager.checkHealth();
  } catch (error) {
    logger.error(`Health check error: ${error.message}`);
    return {
      status: 'unhealthy',
      message: `Error during health check: ${error.message}`,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 会話履歴の強制リセット（デバッグ/開発用）
 * @param {string} userId ユーザーID
 * @returns {Promise<boolean>} 成功した場合はtrue
 */
async function resetUserConversations(userId) {
  try {
    // 既存の会話を取得
    const client = supabase.getClient();
    const conversationsTable = supabase.getTableName('conversations');
    
    const { data, error } = await client
      .from(conversationsTable)
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true);
    
    if (error) throw error;
    
    // アクティブな会話を全て終了
    if (data && data.length > 0) {
      for (const conv of data) {
        await memoryManager.endConversation(conv.id);
      }
      
      logger.info(`Reset ${data.length} conversations for user ${userId}`);
      return true;
    }
    
    return true;
  } catch (error) {
    logger.error(`Failed to reset user conversations: ${error.message}`);
    return false;
  }
}

// 主要機能をエクスポート
module.exports = {
  initialize,
  checkHealth,
  resetUserConversations,
  manager: memoryManager
};