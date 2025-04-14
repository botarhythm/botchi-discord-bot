/**
 * OpenAI Memory Provider - Supabase記憶システムと統合したOpenAIプロバイダー
 * 
 * OpenAI APIと記憶システムを統合したプロバイダー。
 * 会話履歴をSupabaseに保存し、コンテキスト管理を行います。
 * 
 * @module extensions/providers/openai-memory-provider
 */

const { OpenAI } = require('openai');
const memorySystem = require('../memory');
const logger = require('../../system/logger');
const character = require('../character/character');

// APIクライアント
let openaiClient = null;

// 設定
const DEFAULT_MODEL = 'gpt-4o-mini';

// システムプロンプト
const SYSTEM_PROMPTS = {
  default: '' // 初期化時に character.js から読み込む
};

/**
 * モジュールの初期化
 * @returns {Promise<boolean>} 初期化成功の可否
 */
async function initialize() {
  try {
    // APIキーの確認
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error('OpenAI API Keyが設定されていません');
      return false;
    }
    
    // モデルの設定
    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
    
    // OpenAIクライアントの初期化
    openaiClient = new OpenAI({
      apiKey
    });
    
    // メモリシステムの初期化
    await memorySystem.initialize();
    
    // キャラクター設定を読み込む
    SYSTEM_PROMPTS.default = character.getCharacterPrompt({ format: 'raw', extended: true });
    logger.info('キャラクター設定を読み込みました');
    
    logger.info(`OpenAI Memory Providerが初期化されました (モデル: ${model})`);
    return true;
  } catch (error) {
    logger.error(`OpenAI Memory Provider初期化エラー: ${error.message}`);
    return false;
  }
}

/**
 * AIからの応答を取得
 * @param {string} userId - ユーザーID
 * @param {string} message - メッセージ内容
 * @param {string} username - ユーザー名
 * @param {boolean} isDM - DMかどうか
 * @returns {Promise<string>} AIからの応答
 */
async function getAIResponse(userId, message, username, isDM = false) {
  try {
    if (!openaiClient) {
      throw new Error('OpenAIクライアントが初期化されていません');
    }
    
    // メモリシステムから会話コンテキストを取得
    const conversation = await memorySystem.manager.getOrCreateConversationContext({
      userId,
      channelId: isDM ? 'dm' : null,
      guildId: isDM ? null : 'discord',
      systemMessage: SYSTEM_PROMPTS.default
    });
    
    // 過去の会話コンテキストを取得
    const contextMessages = await memorySystem.manager.getContextMessages(
      conversation.conversationId,
      10 // 最新10件を使用
    );
    
    // 新しいメッセージを追加
    const userMessage = {
      role: 'user',
      content: message
    };
    
    // OpenAIに送信するメッセージ配列を構築
    const messages = [
      { role: 'system', content: SYSTEM_PROMPTS.default },
      ...contextMessages,
      userMessage
    ];
    
    // APIリクエスト設定
    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
    
    // OpenAI APIを呼び出し
    const response = await openaiClient.chat.completions.create({
      model,
      messages,
      max_tokens: 1000,
      temperature: 0.7
    });
    
    if (!response.choices || response.choices.length === 0) {
      throw new Error('OpenAIから応答がありませんでした');
    }
    
    const aiMessage = response.choices[0].message;
    
    // ユーザーメッセージを会話履歴に保存
    await memorySystem.manager.addMessageToConversation(
      conversation.conversationId,
      'user',
      message,
      { username }
    );
    
    // AIの応答を会話履歴に保存
    await memorySystem.manager.addMessageToConversation(
      conversation.conversationId,
      'assistant',
      aiMessage.content,
      { tokens: response.usage?.total_tokens || 0 }
    );
    
    return aiMessage.content;
  } catch (error) {
    logger.error(`OpenAI Memory Provider応答エラー: ${error.message}`);
    throw error;
  }
}

/**
 * 会話履歴をクリア
 * @param {string} userId - ユーザーID
 * @returns {Promise<boolean>} クリア成功の可否
 */
async function clearConversationHistory(userId) {
  try {
    const conversation = await memorySystem.manager.getOrCreateConversationContext({
      userId,
      channelId: 'dm', // DMでもサーバーでも共通の履歴をクリア
      guildId: null
    });
    
    // 会話を終了（アーカイブ）
    if (conversation && conversation.conversationId) {
      await memorySystem.manager.endConversation(conversation.conversationId);
      logger.info(`ユーザー ${userId} の会話履歴がクリアされました`);
      return true;
    }
    
    // 会話が見つからない場合
    return false;
  } catch (error) {
    logger.error(`会話履歴クリアエラー: ${error.message}`);
    return false;
  }
}

/**
 * サービスのヘルスチェック
 * @returns {Promise<Object>} ヘルスステータス
 */
async function checkHealth() {
  try {
    if (!openaiClient) {
      return {
        status: 'unhealthy',
        message: 'OpenAIクライアントが初期化されていません',
        provider: 'openai-memory'
      };
    }
    
    // APIの疎通確認（モデルリストを取得）
    await openaiClient.models.list();
    
    // メモリシステムのヘルスチェック
    const memoryHealth = await memorySystem.checkHealth();
    
    // 両方正常な場合のみ健全とみなす
    if (memoryHealth.status === 'healthy') {
      return {
        status: 'healthy',
        message: 'OpenAI APIとメモリシステムは正常に動作しています',
        provider: 'openai-memory',
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        status: 'degraded',
        message: `OpenAI APIは正常ですが、メモリシステムに問題があります: ${memoryHealth.message}`,
        provider: 'openai-memory',
        memoryStatus: memoryHealth.status,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    logger.error(`OpenAI Memory Providerヘルスチェックエラー: ${error.message}`);
    return {
      status: 'unhealthy',
      message: `ヘルスチェックエラー: ${error.message}`,
      provider: 'openai-memory',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 設定情報を取得
 * @returns {Object} 設定情報
 */
function getConfig() {
  return {
    provider: 'openai-memory',
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    memoryEnabled: memorySystem.manager.isInitialized(),
    timestamp: new Date().toISOString()
  };
}

/**
 * プロバイダーが設定されているかどうかを確認
 * @returns {boolean} 設定済みかどうか
 */
function isConfigured() {
  return !!process.env.OPENAI_API_KEY && !!openaiClient;
}

/**
 * 新インターフェース用のレスポンス取得メソッド
 * @param {Object} context - 会話コンテキスト
 * @returns {Promise<string>} AIからの応答
 */
async function getResponse(context) {
  try {
    // コンテキストから必要な情報を抽出
    const { userId, username, message, contextType } = context;
    
    // getAIResponseメソッドに変換して呼び出し
    return await getAIResponse(
      userId,
      message,
      username || 'user',
      contextType === 'direct_message'
    );
  } catch (error) {
    logger.error(`getResponse呼び出しエラー: ${error.message}`);
    throw error;
  }
}

module.exports = {
  initialize,
  getAIResponse,
  getResponse, // 新インターフェース用メソッドを追加
  clearConversationHistory,
  checkHealth,
  getConfig,
  isConfigured
};