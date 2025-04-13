/**
 * Bocchy Discord Bot - System Logger
 * ログ処理モジュール
 */

// ログレベル定義
const LOG_LEVELS = {
  VERBOSE: 0,  // 最も詳細なレベル
  DEBUG: 1,    // デバッグ情報
  INFO: 2,     // 一般的な情報
  WARN: 3,     // 警告
  ERROR: 4,    // エラー
  NONE: 5      // ログ出力なし
};

// デフォルト設定
let config = {
  level: process.env.DEBUG === 'true' ? LOG_LEVELS.DEBUG : 
         process.env.DEBUG === 'verbose' ? LOG_LEVELS.VERBOSE : LOG_LEVELS.INFO,
  useColors: true,
  timestamp: true,
  includeSourceInfo: process.env.DEBUG === 'true' || process.env.DEBUG === 'verbose',
  logToFile: false,
  logFilePath: './logs/bocchy.log',
  rotation: false,
};

// 状態管理
let state = {
  initialized: false,
  startTime: Date.now(),
  logCount: {
    verbose: 0,
    debug: 0,
    info: 0,
    warn: 0,
    error: 0
  }
};

/**
 * ロガーの初期化
 * @param {Object} options - ロガーの設定オプション
 * @returns {Object} 初期化結果
 */
function initialize(options = {}) {
  config = { ...config, ...options };
  
  // 環境変数からの設定可能性
  if (process.env.LOG_LEVEL) {
    const envLevel = process.env.LOG_LEVEL.toUpperCase();
    if (LOG_LEVELS[envLevel] !== undefined) {
      config.level = LOG_LEVELS[envLevel];
    }
  }
  
  state.initialized = true;
  
  // 起動ログ
  info('Logger initialized with level:', Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === config.level));
  
  return { initialized: true, config };
}

/**
 * ロガー設定を取得
 * @returns {Object} 現在の設定
 */
function getConfig() {
  return { ...config };
}

/**
 * ロガー状態を取得
 * @returns {Object} ロガーの現在の状態
 */
function getState() {
  return { ...state };
}

/**
 * ログレベルを設定
 * @param {string|number} level - 設定するログレベル
 */
function setLevel(level) {
  if (typeof level === 'string') {
    const upperLevel = level.toUpperCase();
    if (LOG_LEVELS[upperLevel] !== undefined) {
      config.level = LOG_LEVELS[upperLevel];
      info(`Log level set to: ${upperLevel}`);
    } else {
      warn(`Invalid log level: ${level}. Using current level.`);
    }
  } else if (typeof level === 'number' && level >= LOG_LEVELS.VERBOSE && level <= LOG_LEVELS.NONE) {
    config.level = level;
    const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level);
    info(`Log level set to: ${levelName}`);
  } else {
    warn(`Invalid log level: ${level}. Using current level.`);
  }
}

/**
 * タイムスタンプ生成
 * @returns {string} 時刻文字列
 */
function getTimestamp() {
  const now = new Date();
  return now.toISOString();
}

/**
 * ソース情報取得
 * @returns {Object} 呼び出し元情報
 */
function getSourceInfo() {
  const error = new Error();
  const stack = error.stack.split('\n');
  // 0: Error, 1: getSourceInfo, 2: log関数, 3: 実際の呼び出し元
  const callerLine = stack[3] || '';
  const match = callerLine.match(/at (?:(.+?) \()?(?:(.+?):([0-9]+)(?::([0-9]+))?|([^)]+))\)?/);
  
  if (!match) return { file: 'unknown', line: 0 };
  
  const file = match[2] || match[5];
  const line = match[3] ? parseInt(match[3], 10) : 0;
  
  // ファイル名のみを取得
  const fileNameMatch = file.match(/([^\/\\]+)$/);
  const fileName = fileNameMatch ? fileNameMatch[1] : file;
  
  return { file: fileName, line };
}

/**
 * ログ出力共通処理
 * @param {string} level - ログレベル
 * @param {Array} args - ログ引数
 */
function log(level, ...args) {
  const logLevel = LOG_LEVELS[level.toUpperCase()];
  if (logLevel < config.level) return;
  
  // カウンタ増加
  state.logCount[level.toLowerCase()]++;
  
  let output = '';
  
  // タイムスタンプ
  if (config.timestamp) {
    output += `[${getTimestamp()}] `;
  }
  
  // レベル表示
  const levelColors = {
    VERBOSE: '\x1b[90m', // グレー
    DEBUG: '\x1b[36m',  // シアン
    INFO: '\x1b[32m',   // 緑
    WARN: '\x1b[33m',   // 黄
    ERROR: '\x1b[31m',  // 赤
  };
  
  const levelDisplay = level.toUpperCase().padEnd(7);
  
  if (config.useColors && levelColors[level.toUpperCase()]) {
    output += `${levelColors[level.toUpperCase()]}${levelDisplay}\x1b[0m `;
  } else {
    output += `${levelDisplay} `;
  }
  
  // ソース情報
  if (config.includeSourceInfo) {
    const source = getSourceInfo();
    output += `[${source.file}:${source.line}] `;
  }
  
  // 値の出力
  console.log(output, ...args);
  
  // TODO: ファイル出力処理を実装
}

/**
 * Verboseレベルログ
 * @param {...any} args - ログ出力引数
 */
function verbose(...args) {
  log('VERBOSE', ...args);
}

/**
 * Debugレベルログ
 * @param {...any} args - ログ出力引数
 */
function debug(...args) {
  log('DEBUG', ...args);
}

/**
 * Infoレベルログ
 * @param {...any} args - ログ出力引数
 */
function info(...args) {
  log('INFO', ...args);
}

/**
 * Warningレベルログ
 * @param {...any} args - ログ出力引数
 */
function warn(...args) {
  log('WARN', ...args);
}

/**
 * Errorレベルログ
 * @param {...any} args - ログ出力引数
 */
function error(...args) {
  log('ERROR', ...args);
}

module.exports = {
  initialize,
  getConfig,
  getState,
  setLevel,
  LOG_LEVELS,
  verbose,
  debug,
  info,
  warn,
  error
};