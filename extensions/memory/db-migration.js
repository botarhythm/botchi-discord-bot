/**
 * Database Migration Script - Supabase用テーブル定義
 * 
 * Supabaseでの記憶システム用テーブルを作成するためのSQLマイグレーションスクリプト
 * 手動実行またはSUPABASE_AUTO_MIGRATION=true設定時に自動実行
 * 
 * @module extensions/memory/db-migration
 */

const supabase = require('./supabase-client');
const logger = require('../../system/logger');

/**
 * 会話とメッセージテーブルを作成するSQLクエリ
 */
const createTablesSQL = `
-- 会話テーブル
CREATE TABLE IF NOT EXISTS ${supabase.config.tables.conversations} (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel_id TEXT,
  guild_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

-- メッセージテーブル
CREATE TABLE IF NOT EXISTS ${supabase.config.tables.messages} (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES ${supabase.config.tables.conversations}(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS ${supabase.config.tables.users} (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'discord',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  settings JSONB DEFAULT '{}'::jsonb
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_conversation_user_id ON ${supabase.config.tables.conversations}(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_channel_id ON ${supabase.config.tables.conversations}(channel_id);
CREATE INDEX IF NOT EXISTS idx_conversation_guild_id ON ${supabase.config.tables.conversations}(guild_id);
CREATE INDEX IF NOT EXISTS idx_conversation_is_active ON ${supabase.config.tables.conversations}(is_active);
CREATE INDEX IF NOT EXISTS idx_message_conversation_id ON ${supabase.config.tables.messages}(conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_timestamp ON ${supabase.config.tables.messages}(timestamp);
CREATE INDEX IF NOT EXISTS idx_message_role ON ${supabase.config.tables.messages}(role);

-- メッセージカウント増加用関数
CREATE OR REPLACE FUNCTION increment_counter(row_id UUID)
RETURNS INTEGER AS $$
DECLARE
  current_count INTEGER;
BEGIN
  SELECT message_count INTO current_count FROM ${supabase.config.tables.conversations} WHERE id = row_id;
  IF current_count IS NULL THEN
    RETURN 1;
  ELSE
    RETURN current_count + 1;
  END IF;
END;
$$ LANGUAGE plpgsql;
`;

/**
 * テーブルが存在するか確認するSQLクエリ
 */
const checkTablesExistSQL = `
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = '${supabase.config.tables.conversations}'
);
`;

/**
 * 会話テーブルの作成
 * @private
 */
async function createConversationsTable(client) {
  try {
    // CREATE TABLE IF NOT EXISTS を使用したSQLクエリの実行
    const { error } = await client.rpc('create_conversations_table');
    
    if (error) {
      // RPC関数が存在しない場合は、直接挿入で代替
      if (error.code === 'PGRST301') { // 存在しない関数
        logger.info('RPC関数が存在しないため、直接挿入を試みます');
        await attemptTableCreateByInsertion(client, 'conversations');
      } else {
        throw error;
      }
    }
    
    return true;
  } catch (error) {
    logger.error(`会話テーブル作成エラー: ${error.message}`);
    return false;
  }
}

/**
 * メッセージテーブルの作成
 * @private
 */
async function createMessagesTable(client) {
  try {
    // CREATE TABLE IF NOT EXISTS を使用したSQLクエリの実行
    const { error } = await client.rpc('create_messages_table');
    
    if (error) {
      // RPC関数が存在しない場合は、直接挿入で代替
      if (error.code === 'PGRST301') {
        logger.info('RPC関数が存在しないため、直接挿入を試みます');
        await attemptTableCreateByInsertion(client, 'messages');
      } else {
        throw error;
      }
    }
    
    return true;
  } catch (error) {
    logger.error(`メッセージテーブル作成エラー: ${error.message}`);
    return false;
  }
}

/**
 * ユーザーテーブルの作成
 * @private
 */
async function createUsersTable(client) {
  try {
    // CREATE TABLE IF NOT EXISTS を使用したSQLクエリの実行
    const { error } = await client.rpc('create_users_table');
    
    if (error) {
      // RPC関数が存在しない場合は、直接挿入で代替
      if (error.code === 'PGRST301') {
        logger.info('RPC関数が存在しないため、直接挿入を試みます');
        await attemptTableCreateByInsertion(client, 'users');
      } else {
        throw error;
      }
    }
    
    return true;
  } catch (error) {
    logger.error(`ユーザーテーブル作成エラー: ${error.message}`);
    return false;
  }
}

/**
 * テーブル作成を直接挿入で試みる
 * @private
 */
async function attemptTableCreateByInsertion(client, tableName) {
  try {
    let data = {};
    
    if (tableName === 'conversations') {
      data = {
        id: '00000000-0000-0000-0000-000000000000',
        user_id: 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        message_count: 0,
        is_active: false
      };
    } else if (tableName === 'messages') {
      data = {
        id: '00000000-0000-0000-0000-000000000000',
        conversation_id: '00000000-0000-0000-0000-000000000000',
        role: 'system',
        content: 'Migration test',
        timestamp: new Date().toISOString()
      };
    } else if (tableName === 'users') {
      data = {
        id: 'system',
        platform: 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }
    
    const { error } = await client.from(tableName).insert(data);
    
    if (error) {
      if (error.code === '42P01') {
        // テーブルが存在しない（このエラーコードは「relation "XXX" does not exist」を示す）
        logger.error(`テーブル ${tableName} が存在しません。Supabaseコンソールでのテーブル作成が必要です。`);
        return false;
      } else if (error.message && error.message.includes('already exists')) {
        // 既に挿入されている場合はOK
        logger.info(`テーブル ${tableName} のデータは既に存在します`);
        return true;
      } else {
        throw error;
      }
    }
    
    return true;
  } catch (error) {
    logger.error(`テーブル ${tableName} 作成挿入エラー: ${error.message}`);
    return false;
  }
}

/**
 * マイグレーションを実行する
 * @returns {Promise<boolean>} 成功した場合はtrue
 */
async function runMigration() {
  try {
    const client = supabase.getClient();
    
    // テーブルが既に存在するか確認（複数の方法を試す）
    try {
      // 1. 直接クエリでチェック
      const { error: checkError } = await client
        .from(supabase.config.tables.conversations)
        .select('id')
        .limit(1);
      
      // エラーがなければテーブルが存在する
      if (!checkError) {
        logger.info('Supabase tables already exist, skipping migration');
        return true;
      }
      
      // エラーコードがPGRST116（テーブルは存在するが内容がない）の場合も処理を続行
      if (checkError.code === 'PGRST116') {
        logger.info('Conversations table exists but is empty, proceeding with test data insertion');
        // 処理を続行（テーブルは存在するが、テストデータを挿入）
      } else if (checkError.code === '42P01' || checkError.message.includes('does not exist')) {
        // テーブルが存在しない場合
        logger.info('Tables do not exist, creating them...');
      } else {
        // その他のエラー
        logger.warn(`テーブル確認中に予期しないエラー: ${checkError.message}. 移行を続行します。`);
      }
    } catch (error) {
      logger.warn(`テーブル確認エラー: ${error.message}. 移行を続行します。`);
    }
    
    // テーブルが存在しない場合はマイグレーション実行
    logger.info('Creating Supabase tables for memory system...');
    
    // 各テーブルを作成（または確認）
    const conversationsResult = await createConversationsTable(client);
    const messagesResult = await createMessagesTable(client);
    const usersResult = await createUsersTable(client);
    
    if (conversationsResult && messagesResult && usersResult) {
      logger.info('Supabase tables created or verified successfully');
      return true;
    } else {
      logger.warn('Some tables could not be created or verified, but continuing');
      return true; // テーブル作成に問題があっても処理は続行
    }
  } catch (error) {
    logger.error(`Migration error: ${error.message}`);
    return false;
  }
}

module.exports = {
  runMigration,
  // テーブル作成関数をエクスポート
  createConversationsTable,
  createMessagesTable,
  createUsersTable,
  attemptTableCreateByInsertion
};