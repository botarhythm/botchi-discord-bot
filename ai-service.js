/**
 * Bocchy Discord Bot - 統合AIサービス
 * さまざまなAIプロバイダーを抽象化して一貫したインターフェースを提供
 */

const logger = require('./system/logger');

// 環境変数から設定を読み込み
require('dotenv').config();

// プロバイダーの設定
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const DEBUG = process.env.DEBUG === 'true';

// ユーザーエラーメッセージ
const ERROR_MESSAGES = {
  init: 'AIサービスの初期化に失敗しました。',
  common: '🌿 すみません、うまく応答できませんでした。少し経ってからお試しください。',
  timeout: '🕰️ 応答に時間がかかりすぎています。もう少し短い質問でお試しください。',
  unavailable: '🍃 AIサービスに一時的に接続できません。しばらくお待ちください。',
  invalid: '🌱 有効な応答を生成できませんでした。別の言い方でお試しください。'
};

// プロバイダーインスタンス
let provider = null;

// AIプロバイダーの初期化
async function initialize() {
  try {
    logger.info(`AI Provider: ${AI_PROVIDER}`);
    
    // 選択されたプロバイダーをロード
    switch (AI_PROVIDER.toLowerCase()) {
      case 'openai':
        provider = require('./openai-service');
        break;
      case 'gemini':
        provider = require('./gemini-service');
        break;
      case 'anthropic':
        provider = require('./anthropic-service');
        break;
      case 'graphai':
        provider = require('./graphai-service');
        break;
      default:
        provider = require('./openai-service');
        logger.warn(`Unknown provider '${AI_PROVIDER}', falling back to OpenAI`);
    }

    // プロバイダーが既に初期化済みか確認
    if (provider && typeof provider.initialize === 'function') {
      logger.info('Initializing AI provider...');
      const result = await provider.initialize();
      
      if (DEBUG) {
        logger.debug(`Provider initialization result: ${JSON.stringify(result)}`);
      }
      
      if (!result || !result.initialized) {
        logger.error(`Failed to initialize provider: ${JSON.stringify(result)}`);
        return { success: false, error: 'Provider initialization failed' };
      }
      
      logger.info('AI provider initialized successfully');
      return { success: true };
    } else {
      logger.error('Invalid provider: initialize method not found');
      return { success: false, error: 'Invalid provider structure' };
    }
  } catch (error) {
    logger.error(`Error initializing AI service: ${error.message}`, error);
    return { success: false, error: error.message };
  }
}

/**
 * 健全性チェック
 * @returns {Promise<Object>} 健全性状態
 */
async function checkHealth() {
  if (!provider || typeof provider.checkHealth !== 'function') {
    return { status: 'error', message: 'Provider not initialized or health check unavailable' };
  }
  
  try {
    const result = await provider.checkHealth();
    return result;
  } catch (error) {
    logger.error(`Health check error: ${error.message}`);
    return { status: 'error', message: error.message };
  }
}

/**
 * AIサービスの設定を取得
 * @returns {Object} AIサービス設定
 */
function getConfig() {
  // プロバイダーから設定を取得
  const providerConfig = provider && typeof provider.getConfig === 'function' 
    ? provider.getConfig() 
    : {};
  
  // 共通設定と組み合わせ
  return {
    provider: AI_PROVIDER,
    ...providerConfig
  };
}

/**
 * AIからの応答を取得
 * @param {Object} context - メッセージコンテキスト
 * @returns {Promise<string>} AI応答
 */
async function getResponse(context) {
  if (!provider || typeof provider.getResponse !== 'function') {
    logger.error('Provider not initialized or getResponse method unavailable');
    return ERROR_MESSAGES.unavailable;
  }
  
  try {
    // プロバイダーのレスポンス取得メソッドを呼び出し
    logger.debug(`Calling AI provider with context: ${JSON.stringify(context, null, 2)}`);
    const startTime = Date.now();
    
    const response = await provider.getResponse(context);
    
    const duration = Date.now() - startTime;
    logger.debug(`AI response received in ${duration}ms`);
    
    return response;
  } catch (error) {
    logger.error(`Error getting AI response: ${error.message}`, error);
    
    // エラータイプに応じた応答
    if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
      return ERROR_MESSAGES.timeout;
    } else if (error.response && error.response.status === 401) {
      return ERROR_MESSAGES.unavailable;
    } else {
      return ERROR_MESSAGES.common;
    }
  }
}

/**
 * 会話履歴をクリア
 * @param {string} userId - ユーザーID
 * @returns {boolean} 成功したかどうか
 */
function clearConversationHistory(userId) {
  if (!provider || typeof provider.clearConversationHistory !== 'function') {
    logger.error('Provider not initialized or clearConversationHistory method unavailable');
    return false;
  }
  
  try {
    return provider.clearConversationHistory(userId);
  } catch (error) {
    logger.error(`Error clearing conversation history: ${error.message}`);
    return false;
  }
}

// エクスポート
module.exports = {
  initialize,
  getResponse,
  checkHealth,
  clearConversationHistory,
  getConfig,
  ERROR_MESSAGES
};