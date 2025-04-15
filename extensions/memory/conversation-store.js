/**
 * Conversation Store - 会話履歴の永続化と取得を管理
 * 
 * Supabaseを使用して会話履歴を保存・取得する機能を提供します
 * 会話セッション、メッセージ履歴、コンテキスト情報などを管理
 * 
 * @module extensions/memory/conversation-store
 */

const supabase = require('./supabase-client');
const logger = require('../../system/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * 会話テーブル名
 * @private
 */
const CONVERSATIONS_TABLE = supabase.getTableName('conversations');

/**
 * メッセージテーブル名
 * @private
 */
const MESSAGES_TABLE = supabase.getTableName('messages');

/**
 * 新しい会話セッションを作成する
 * @param {Object} sessionData 会話セッション情報
 * @param {string} sessionData.userId ユーザーID (DiscordのユーザーIDなど)
 * @param {string} sessionData.channelId チャンネルID (任意)
 * @param {string} sessionData.guildId サーバーID (任意)
 * @param {Object} sessionData.metadata 追加のメタデータ (任意)
 * @returns {Promise<Object>} 作成された会話セッション情報
 */
async function createConversation(sessionData) {
  try {
    const client = supabase.getClient();
    
    const conversationData = {
      id: uuidv4(),
      user_id: sessionData.userId,
      channel_id: sessionData.channelId || null,
      guild_id: sessionData.guildId || null,
      metadata: sessionData.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: 0,
      is_active: true
    };
    
    const { data, error } = await client
      .from(CONVERSATIONS_TABLE)
      .insert(conversationData)
      .select();
    
    if (error) throw error;
    
    logger.debug(`Created new conversation: ${conversationData.id}`);
    return data[0];
  } catch (error) {
    logger.error(`Failed to create conversation: ${error.message}`);
    throw error;
  }
}

/**
 * 会話履歴にメッセージを追加する
 * @param {Object} messageData メッセージデータ
 * @param {string} messageData.conversationId 会話ID
 * @param {string} messageData.role メッセージの役割 ('user', 'assistant', 'system')
 * @param {string} messageData.content メッセージ内容
 * @param {Object} messageData.metadata 追加のメタデータ (任意)
 * @returns {Promise<Object>} 保存されたメッセージ情報
 */
async function addMessage(messageData) {
  try {
    const client = supabase.getClient();
    
    // 入力データを検証
    if (!messageData.conversationId || !messageData.role || !messageData.content) {
      throw new Error('Missing required message data (conversationId, role, or content)');
    }
    
    const message = {
      id: uuidv4(),
      conversation_id: messageData.conversationId,
      role: messageData.role,
      content: messageData.content,
      metadata: messageData.metadata || {},
      timestamp: new Date().toISOString()
    };
    
    // メッセージを保存
    const { data, error } = await client
      .from(MESSAGES_TABLE)
      .insert(message)
      .select();
    
    if (error) throw error;
    
    // 会話のメッセージカウントと更新日時を更新
    await client
      .from(CONVERSATIONS_TABLE)
      .update({
        message_count: client.rpc('increment_counter', { row_id: messageData.conversationId }),
        updated_at: new Date().toISOString()
      })
      .eq('id', messageData.conversationId);
    
    logger.debug(`Added message to conversation ${messageData.conversationId}`);
    return data[0];
  } catch (error) {
    logger.error(`Failed to add message: ${error.message}`);
    throw error;
  }
}

/**
 * 特定の会話の過去のメッセージを取得する
 * @param {string} conversationId 会話ID
 * @param {Object} options 取得オプション
 * @param {number} options.limit 取得するメッセージ数の上限 (デフォルト: 50)
 * @param {number} options.offset オフセット (ページネーション用)
 * @param {string[]} options.roles 取得するメッセージの役割フィルタ (例: ['user', 'assistant'])
 * @returns {Promise<Array>} メッセージの配列
 */
async function getMessages(conversationId, options = {}) {
  try {
    const client = supabase.getClient();
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    
    let query = client
      .from(MESSAGES_TABLE)
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true })
      .range(offset, offset + limit - 1);
    
    // 役割でフィルタリングする場合
    if (options.roles && Array.isArray(options.roles) && options.roles.length > 0) {
      query = query.in('role', options.roles);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return data;
  } catch (error) {
    logger.error(`Failed to get messages: ${error.message}`);
    throw error;
  }
}

/**
 * アクティブな会話を取得する
 * @param {Object} filter フィルター条件
 * @param {string} filter.userId ユーザーID
 * @param {string} filter.channelId チャンネルID (任意)
 * @param {string} filter.guildId サーバーID (任意)
 * @returns {Promise<Object|null>} 会話情報、または存在しない場合はnull
 */
async function getActiveConversation(filter) {
  try {
    const client = supabase.getClient();
    
    let query = client
      .from(CONVERSATIONS_TABLE)
      .select('*')
      .eq('user_id', filter.userId)
      .eq('is_active', true);
    
    if (filter.channelId) {
      query = query.eq('channel_id', filter.channelId);
    }
    
    if (filter.guildId) {
      query = query.eq('guild_id', filter.guildId);
    }
    
    query = query.order('updated_at', { ascending: false }).limit(1);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    logger.error(`Failed to get active conversation: ${error.message}`);
    throw error;
  }
}

/**
 * 会話を不活性化する（アーカイブ）
 * @param {string} conversationId 会話ID
 * @returns {Promise<boolean>} 成功した場合はtrue
 */
async function deactivateConversation(conversationId) {
  try {
    const client = supabase.getClient();
    
    const { error } = await client
      .from(CONVERSATIONS_TABLE)
      .update({ is_active: false })
      .eq('id', conversationId);
    
    if (error) throw error;
    
    logger.debug(`Deactivated conversation: ${conversationId}`);
    return true;
  } catch (error) {
    logger.error(`Failed to deactivate conversation: ${error.message}`);
    throw error;
  }
}

/**
 * 会話の最後のN件のメッセージをコンテキストとして取得する
 * AIサービスに送信するフォーマットに変換
 * @param {string} conversationId 会話ID
 * @param {number} limit 取得するメッセージ数 (デフォルト: 10)
 * @returns {Promise<Array>} AI用のコンテキストメッセージ配列
 */
async function getConversationContext(conversationId, limit = 10) {
  try {
    const messages = await getMessages(conversationId, { 
      limit,
      roles: ['user', 'assistant', 'system']
    });
    
    // AI用のフォーマットに変換
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  } catch (error) {
    logger.error(`Failed to get conversation context: ${error.message}`);
    throw error;
  }
}

module.exports = {
  createConversation,
  addMessage,
  getMessages,
  getActiveConversation,
  deactivateConversation,
  getConversationContext
};