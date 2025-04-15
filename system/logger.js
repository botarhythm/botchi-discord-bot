/**
 * Bocchy Discord Bot - ロガーモジュール
 * 一貫したロギング形式を提供するユーティリティ
 */

const fs = require('fs');
const path = require('path');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, errors } = format;

// 環境設定
const DEBUG = process.env.DEBUG === 'true';
const LOG_LEVEL = DEBUG ? 'debug' : 'info';

// ログディレクトリが存在しない場合は作成
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// カスタムログフォーマット
const customFormat = printf(({ level, message, timestamp, stack }) => {
  // エラーオブジェクトがある場合はスタックトレースを表示
  if (stack) {
    return `${timestamp} [${level}]: ${message}\n${stack}`;
  }
  return `${timestamp} [${level}]: ${message}`;
});

// ロガーを作成
const logger = createLogger({
  level: LOG_LEVEL,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    customFormat
  ),
  transports: [
    // コンソール出力
    new transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        customFormat
      )
    }),
    // ファイル出力（通常ログ）
    new transports.File({
      filename: path.join(logDir, 'bocchy.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    // ファイル出力（エラーログ）
    new transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

/**
 * エラーオブジェクトの詳細情報を取得
 * @param {Error} error - エラーオブジェクト
 * @returns {string} フォーマットされたエラー詳細
 */
function formatError(error) {
  if (!error) return '';
  
  let details = error.toString();
  
  if (error.stack) {
    details += `\nStack Trace: ${error.stack}`;
  }
  
  if (error.code) {
    details += `\nError Code: ${error.code}`;
  }
  
  if (error.path) {
    details += `\nPath: ${error.path}`;
  }
  
  if (error.syscall) {
    details += `\nSystem Call: ${error.syscall}`;
  }
  
  return details;
}

// エクスポートするロギング関数
module.exports = {
  /**
   * デバッグレベルのログを出力
   * @param {...any} args - ログメッセージと追加データ
   */
  debug: (...args) => {
    logger.debug(args.map(arg => 
      typeof arg === 'object' && arg !== null ? JSON.stringify(arg, null, 2) : arg
    ).join(' '));
  },
  
  /**
   * 情報レベルのログを出力
   * @param {...any} args - ログメッセージと追加データ
   */
  info: (...args) => {
    logger.info(args.map(arg => 
      typeof arg === 'object' && arg !== null ? JSON.stringify(arg, null, 2) : arg
    ).join(' '));
  },
  
  /**
   * 警告レベルのログを出力
   * @param {...any} args - ログメッセージと追加データ
   */
  warn: (...args) => {
    logger.warn(args.map(arg => 
      typeof arg === 'object' && arg !== null ? JSON.stringify(arg, null, 2) : arg
    ).join(' '));
  },
  
  /**
   * エラーレベルのログを出力
   * @param {string} message - エラーメッセージ
   * @param {Error} [error] - エラーオブジェクト（オプション）
   */
  error: (message, error) => {
    if (error instanceof Error) {
      logger.error(`${message} ${formatError(error)}`);
    } else if (typeof error === 'object' && error !== null) {
      logger.error(`${message} ${JSON.stringify(error, null, 2)}`);
    } else {
      logger.error(message);
    }
  },
  
  /**
   * 致命的エラーのログを出力
   * @param {string} message - エラーメッセージ
   * @param {Error} [error] - エラーオブジェクト（オプション）
   */
  fatal: (message, error) => {
    if (error instanceof Error) {
      logger.error(`[FATAL] ${message} ${formatError(error)}`);
    } else if (typeof error === 'object' && error !== null) {
      logger.error(`[FATAL] ${message} ${JSON.stringify(error, null, 2)}`);
    } else {
      logger.error(`[FATAL] ${message}`);
    }
  }
};