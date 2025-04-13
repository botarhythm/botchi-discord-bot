/**
 * Logger - システムロガー
 * 
 * ロギングレベルとフォーマットを提供するシンプルなロガー。
 * 環境変数 LOG_LEVEL で出力レベルを制御します。
 * 
 * @module system/logger
 */

// ログレベルの定義（優先順位順）
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// 環境変数からログレベルを取得、デフォルトは'info'
const ENV_LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const CURRENT_LOG_LEVEL = LOG_LEVELS[ENV_LOG_LEVEL] !== undefined 
  ? LOG_LEVELS[ENV_LOG_LEVEL] 
  : LOG_LEVELS.info;

/**
 * タイムスタンプを生成
 * @returns {string} フォーマットされたタイムスタンプ
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * デバッグメッセージをログ出力
 * @param {string} message - ログメッセージ
 * @param {Object} [data] - 追加データ（オプション）
 */
function debug(message, data) {
  if (CURRENT_LOG_LEVEL >= LOG_LEVELS.debug) {
    const timestamp = getTimestamp();
    if (data) {
      console.debug(`[${timestamp}] [DEBUG] ${message}`, data);
    } else {
      console.debug(`[${timestamp}] [DEBUG] ${message}`);
    }
  }
}

/**
 * 情報メッセージをログ出力
 * @param {string} message - ログメッセージ
 * @param {Object} [data] - 追加データ（オプション）
 */
function info(message, data) {
  if (CURRENT_LOG_LEVEL >= LOG_LEVELS.info) {
    const timestamp = getTimestamp();
    if (data) {
      console.info(`[${timestamp}] [INFO] ${message}`, data);
    } else {
      console.info(`[${timestamp}] [INFO] ${message}`);
    }
  }
}

/**
 * 警告メッセージをログ出力
 * @param {string} message - ログメッセージ
 * @param {Object} [data] - 追加データ（オプション）
 */
function warn(message, data) {
  if (CURRENT_LOG_LEVEL >= LOG_LEVELS.warn) {
    const timestamp = getTimestamp();
    if (data) {
      console.warn(`[${timestamp}] [WARN] ${message}`, data);
    } else {
      console.warn(`[${timestamp}] [WARN] ${message}`);
    }
  }
}

/**
 * エラーメッセージをログ出力
 * @param {string} message - ログメッセージ
 * @param {Object} [data] - 追加データ（オプション）
 */
function error(message, data) {
  if (CURRENT_LOG_LEVEL >= LOG_LEVELS.error) {
    const timestamp = getTimestamp();
    if (data) {
      console.error(`[${timestamp}] [ERROR] ${message}`, data);
    } else {
      console.error(`[${timestamp}] [ERROR] ${message}`);
    }
  }
}

module.exports = {
  debug,
  info,
  warn,
  error
};