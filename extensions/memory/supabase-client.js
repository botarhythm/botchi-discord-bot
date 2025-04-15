/**
 * Supabase Client - Bocchy Bot記憶システム用クライアント
 * 
 * Supabaseへの接続と基本操作を管理するモジュール
 * 環境変数からSupabase URLとAPIキーを取得して接続します
 * 
 * @module extensions/memory/supabase-client
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../../system/logger');

/**
 * Supabase設定情報
 * @private
 */
const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  tables: {
    conversations: process.env.SUPABASE_CONVERSATION_TABLE || 'conversations',
    messages: process.env.SUPABASE_MESSAGE_TABLE || 'messages',
    users: process.env.SUPABASE_USER_TABLE || 'users'
  }
};

/**
 * Supabaseクライアントインスタンス
 * @private
 */
let supabaseClient = null;

/**
 * Supabaseクライアントを初期化する
 * @returns {Object} 初期化されたSupabaseクライアント
 * @throws {Error} 必要な環境変数が設定されていない場合
 */
function initializeClient() {
  try {
    // 必要な環境変数のチェック
    if (!config.supabaseUrl || !config.supabaseKey) {
      throw new Error('Supabase URL and Key must be set in environment variables');
    }

    // クライアントを作成
    supabaseClient = createClient(config.supabaseUrl, config.supabaseKey);
    logger.info('Supabase client initialized successfully');
    
    return supabaseClient;
  } catch (error) {
    logger.error(`Failed to initialize Supabase client: ${error.message}`);
    // エラーを上位に伝播させる
    throw error;
  }
}

/**
 * Supabaseクライアントを取得する
 * 未初期化の場合は初期化を行う
 * @returns {Object} Supabaseクライアント
 */
function getClient() {
  if (!supabaseClient) {
    return initializeClient();
  }
  return supabaseClient;
}

/**
 * テーブル名を取得する
 * @param {string} tableName テーブル種別 ('conversations', 'messages', 'users')
 * @returns {string} 設定されたテーブル名
 */
function getTableName(tableName) {
  return config.tables[tableName] || tableName;
}

/**
 * サービスとしてのステータスを確認する
 * @returns {Promise<Object>} サービスステータス情報
 */
async function checkHealth() {
  try {
    const client = getClient();
    // 簡単なクエリを実行してステータスチェック
    const { data, error } = await client
      .from(getTableName('conversations'))
      .select('id')
      .limit(1);
    
    if (error) throw error;
    
    return {
      status: 'healthy',
      message: 'Supabase connection is working',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Supabase health check failed: ${error.message}`);
    return {
      status: 'unhealthy',
      message: `Connection error: ${error.message}`,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  getClient,
  getTableName,
  checkHealth,
  // 設定情報も外部から参照できるようにエクスポート
  config
};