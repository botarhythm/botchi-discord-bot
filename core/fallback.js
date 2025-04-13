/**
 * Bocchy Discord Bot - Core Fallback Module
 * 障害発生時のフォールバック機能
 */

const logger = require('../system/logger');

// フォールバックモードの状態
let fallbackMode = false;
let originalError = null;
let recoveryAttempts = 0;
let lastRecoveryAttempt = null;

// 定型的なエラー応答メッセージ
const ERROR_RESPONSES = {
  general: '🌿 今、うまく言葉を紐ぐことができません。少し時間をおいてから、また話しかけていただけますか？',
  ai: '🌾 森の奥で言葉を探しているようですが、今はうまく見つかりません。少し後にまたお話ししましょう。',
  discord: '🍃 風が少し強くなっていて、うまく声が届かないようです。また後ほどお話ししましょう。',
  memory: '🍁 記録をとることが難しい状況のようです。でも、あなたの言葉はちゃんと聞いていますよ。',
  timeout: '🕗 考えるのに少し時間がかかりすぎたみたいです。もう少し短い言葉で話しかけていただけますか？',
  rate_limit: '🌿 ここ、とても足早になっているみたいです。少し待ってからまたお話ししましょう。',
  quota: '🌻 今日はたくさんお話ししましたね。少し休みが必要なようです。また明日お話ししましょう。',
  authorization: '🌾 絶え間に森の氏神が離れてしまったようです。後ほど、ご主人様にお知らせください。'
};

/**
 * フォールバックモジュールの初期化
 * @param {Object} options - 初期化オプション
 * @returns {Object} 初期化結果
 */
function initialize(options = {}) {
  logger.info('Fallback module initialized');
  return { initialized: true };
}

/**
 * フォールバックモードをアクティブ化
 * @param {Error} error - 発生したエラー
 * @param {string} type - エラータイプ
 * @returns {boolean} アクティブ化成功かどうか
 */
function activate(error, type = 'general') {
  if (fallbackMode) {
    return false; // 既にアクティブ
  }
  
  fallbackMode = true;
  originalError = error;
  recoveryAttempts = 0;
  
  logger.warn(`Fallback mode activated due to ${type} error:`, error);
  return true;
}

/**
 * フォールバックモードを無効化
 * @returns {boolean} 無効化成功かどうか
 */
function deactivate() {
  if (!fallbackMode) {
    return false; // 既に非アクティブ
  }
  
  fallbackMode = false;
  originalError = null;
  recoveryAttempts = 0;
  lastRecoveryAttempt = null;
  
  logger.info('Fallback mode deactivated');
  return true;
}

/**
 * 現在のフォールバック状態を取得
 * @returns {Object} フォールバック状態
 */
function getStatus() {
  return {
    active: fallbackMode,
    originalError: originalError ? {
      message: originalError.message,
      stack: originalError.stack
    } : null,
    recoveryAttempts,
    lastRecoveryAttempt
  };
}

/**
 * エラータイプに基づいたフォールバックメッセージを取得
 * @param {string} type - エラータイプ
 * @returns {string} フォールバックメッセージ
 */
function getMessage(type = 'general') {
  return ERROR_RESPONSES[type] || ERROR_RESPONSES.general;
}

/**
 * リカバリーを試行
 * @param {Function} recoveryFunction - リカバリー処理を行う関数
 * @returns {Promise<boolean>} リカバリーの成功失敗
 */
async function attemptRecovery(recoveryFunction) {
  if (!fallbackMode) {
    return true; // 非フォールバックモードなら成功とみなす
  }
  
  recoveryAttempts++;
  lastRecoveryAttempt = Date.now();
  
  try {
    logger.info(`Attempting recovery (attempt ${recoveryAttempts})...`);
    const result = await recoveryFunction();
    
    if (result) {
      logger.info('Recovery successful, deactivating fallback mode.');
      deactivate();
      return true;
    } else {
      logger.warn('Recovery function returned false, remaining in fallback mode.');
      return false;
    }
  } catch (error) {
    logger.error('Recovery attempt failed with error:', error);
    return false;
  }
}

/**
 * エラーを認識してタイプを判定
 * @param {Error} error - 認識対象のエラー
 * @returns {string} エラータイプ
 */
function recognizeErrorType(error) {
  if (!error) return 'general';
  
  const message = error.message ? error.message.toLowerCase() : '';
  const stack = error.stack ? error.stack.toLowerCase() : '';
  
  // タイムアウト関連
  if (message.includes('timeout') || 
      message.includes('timed out') || 
      stack.includes('timeout')) {
    return 'timeout';
  }
  
  // レート制限関連
  if (message.includes('rate') && message.includes('limit') || 
      message.includes('429') || 
      message.includes('too many requests')) {
    return 'rate_limit';
  }
  
  // 認証関連
  if (message.includes('auth') || 
      message.includes('token') || 
      message.includes('credential') || 
      message.includes('permission') || 
      message.includes('401') || 
      message.includes('403')) {
    return 'authorization';
  }
  
  // クォータ関連
  if (message.includes('quota') || 
      message.includes('limit exceeded') || 
      message.includes('billing')) {
    return 'quota';
  }
  
  // AIサービス関連
  if (message.includes('openai') || 
      message.includes('gpt') || 
      message.includes('ai') || 
      message.includes('model') || 
      message.includes('completion')) {
    return 'ai';
  }
  
  // Discord関連
  if (message.includes('discord') || 
      message.includes('gateway') || 
      message.includes('channel') || 
      message.includes('guild') || 
      message.includes('message')) {
    return 'discord';
  }
  
  // メモリ/データ関連
  if (message.includes('memory') || 
      message.includes('storage') || 
      message.includes('database') || 
      message.includes('supabase')) {
    return 'memory';
  }
  
  // デフォルト
  return 'general';
}

/**
 * フォールバックメッセージの生成
 * @param {Error} error - 発生したエラー
 * @returns {string} フォールバックメッセージ
 */
function getErrorResponse(error) {
  const errorType = recognizeErrorType(error);
  return getMessage(errorType);
}

/**
 * エラーが発生したかどうかの原因をハンドル
 * @param {Error} error - 発生したエラー
 * @param {Object} context - エラーのコンテキスト
 * @returns {Object} ハンドル結果
 */
function handleError(error, context = {}) {
  const errorType = recognizeErrorType(error);
  activate(error, errorType);
  
  // エラーログ記録
  logger.error(`Fallback handling error of type ${errorType}:`, error, context);
  
  return {
    handled: true,
    type: errorType,
    message: getMessage(errorType),
    shouldRetry: ['timeout', 'rate_limit'].includes(errorType)
  };
}

/**
 * 常に安全なフォールバックメッセージを生成
 * @param {string} originalMessage - オリジナルメッセージ
 * @returns {string} 常に動作するフォールバックメッセージ
 */
function safeResponse(originalMessage = '') {
  if (originalMessage && originalMessage.length > 0) {
    return originalMessage;
  }
  
  return '🌿 林の奥からやさしい気配が漂ってきます。';
}

/**
 * フォールバックAI応答生成関数
 * @param {string} userId - ユーザーID
 * @param {string} message - ユーザーメッセージ
 * @returns {Promise<string>} 応答メッセージ
 */
async function getFallbackResponse(userId, message) {
  // 非常にシンプルな応答パターン
  const simpleResponses = [
    '🌿 やさしい風が収まり、静かに耳を澄ましています。',
    '🍃 あなたの言葉を聞いています。今は静かに対話を続けましょう。',
    '🌾 深い森の奥から、心を澄ます音色が還ってきます。',
    '🍁 この瞬間を大切に、あなたの言葉に対話を続けます。',
    '🌻 光と影の中で、小さな知恵を分かち合いましょう。',
    '🌺 心を開いて静かに耳を澄ませば、明日の風の向こうが見えるかもしれません。',
    '🌼 今は言葉よりも、気配を大切にしたいと思います。',
    '🌸 あなたの思いが、晴れた幻想のように広がりますように。'
  ];
  
  // ユーザーIDをシードとしてランダムな応答を選択
  const seed = parseInt(userId.replace(/\D/g, ''), 10) || 0;
  const index = seed % simpleResponses.length;
  return simpleResponses[index];
}

module.exports = {
  initialize,
  activate,
  deactivate,
  getStatus,
  getMessage,
  attemptRecovery,
  recognizeErrorType,
  getErrorResponse,
  handleError,
  safeResponse,
  getFallbackResponse
};