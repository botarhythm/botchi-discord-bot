/**
 * Bocchy Discord Bot - System Configuration
 * 設定管理モジュール
 */

const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// .envファイルの読み込み
dotenv.config();

// デフォルト設定
const DEFAULT_CONFIG = {
  // ボットの基本設定
  bot: {
    version: '2.0.0', // モジュール化アーキテクチャのためにメジャーバージョンアップ
    prefix: '!',
    healthCheckInterval: 10 * 60 * 1000, // 10分
    httpPort: 3000,
    allowAllServers: true,
    debug: false,
  },
  
  // Discord関連設定
  discord: {
    token: null,
    clientId: null,
    guildId: null, // 限定する場合のみ設定
  },
  
  // AIサービス設定
  ai: {
    provider: 'openai',
    openai: {
      apiKey: null,
      model: 'gpt-4o-mini',
      endpoint: 'https://api.openai.com/v1/chat/completions',
    },
    gemini: {
      apiKey: null,
      model: 'gemini-pro',
    },
    // 将来的に他のプロバイダーを追加可能
  },
  
  // メモリ設定
  memory: {
    provider: 'memory', // 'memory', 'supabase', 'redis'など
    bypassSupabase: false, // Supabaseの使用をスキップするか
  },
  
  // キャラクター設定
  character: {
    name: 'Bocchy',
    settingsFile: 'bocchy-character.md',
  },
  
  // 追加設定
  extensions: {
    plugins: [],
    rag: {
      enabled: false,
    },
  }
};

// 設定を保持するオブジェクト
let config = { ...DEFAULT_CONFIG };

// 環境変数の検証ルール
const ENV_VALIDATIONS = {
  DISCORD_TOKEN: { required: true, message: 'Discordトークンが設定されていません。' },
  CLIENT_ID: { required: true, message: 'DiscordクライアントIDが設定されていません。' },
  AI_PROVIDER: { required: false, enum: ['openai', 'gemini'], default: 'openai' },
  OPENAI_API_KEY: { required: (env) => env.AI_PROVIDER === 'openai', message: 'OpenAI APIキーが設定されていません。' },
  GEMINI_API_KEY: { required: (env) => env.AI_PROVIDER === 'gemini', message: 'Gemini APIキーが設定されていません。' },
};

/**
 * 設定モジュールの初期化
 * @param {Object} options - 初期化オプション
 * @returns {Object} 設定オブジェクト
 */
function initialize(options = {}) {
  // ロガーの初期化確認
  if (!logger.getState().initialized) {
    logger.initialize();
  }
  
  // カスタム設定をマージ
  if (options && Object.keys(options).length > 0) {
    config = mergeDeep(config, options);
  }
  
  // 環境変数から設定をロード
  loadFromEnvironment();
  
  // 必須環境変数の検証
  const validationResults = validateEnvironment();
  
  if (validationResults.errors.length > 0) {
    logger.warn('Configuration validation errors:');
    validationResults.errors.forEach(err => logger.warn(`- ${err}`));
  }
  
  if (validationResults.warnings.length > 0) {
    logger.warn('Configuration validation warnings:');
    validationResults.warnings.forEach(warn => logger.warn(`- ${warn}`));
  }
  
  // 依存関係のパスの設定
  setupPaths();
  
  logger.info(`Config initialized with provider: ${config.ai.provider}`);
  
  return config;
}

/**
 * 環境変数から設定をロード
 */
function loadFromEnvironment() {
  // Debugモード
  config.bot.debug = process.env.DEBUG === 'true' || process.env.DEBUG === 'verbose';
  
  // 基本設定
  config.bot.prefix = process.env.PREFIX || config.bot.prefix;
  config.bot.healthCheckInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL) || config.bot.healthCheckInterval;
  config.bot.httpPort = parseInt(process.env.PORT) || config.bot.httpPort;
  config.bot.allowAllServers = process.env.ALLOW_ALL_SERVERS === 'true' || config.bot.allowAllServers;
  
  // Discord関連
  config.discord.token = process.env.DISCORD_TOKEN || config.discord.token;
  config.discord.clientId = process.env.CLIENT_ID || config.discord.clientId;
  config.discord.guildId = process.env.GUILD_ID || config.discord.guildId;
  
  // AIプロバイダ設定
  config.ai.provider = process.env.AI_PROVIDER || config.ai.provider;
  
  // OpenAI設定
  config.ai.openai.apiKey = process.env.OPENAI_API_KEY || config.ai.openai.apiKey;
  config.ai.openai.model = process.env.OPENAI_MODEL || config.ai.openai.model;
  config.ai.openai.endpoint = process.env.OPENAI_ENDPOINT || config.ai.openai.endpoint;
  
  // Gemini設定
  config.ai.gemini.apiKey = process.env.GEMINI_API_KEY || config.ai.gemini.apiKey;
  config.ai.gemini.model = process.env.GEMINI_MODEL || config.ai.gemini.model;
  
  // メモリ設定
  config.memory.bypassSupabase = process.env.BYPASS_SUPABASE === 'true' || config.memory.bypassSupabase;
  
  // キャラクター設定
  if (process.env.CHARACTER_SETTINGS_FILE) {
    config.character.settingsFile = process.env.CHARACTER_SETTINGS_FILE;
  }
}

/**
 * 環境変数の検証
 * @returns {Object} 検証結果
 */
function validateEnvironment() {
  const results = {
    valid: true,
    errors: [],
    warnings: []
  };
  
  // エントリを全てチェック
  Object.entries(ENV_VALIDATIONS).forEach(([key, validation]) => {
    const value = process.env[key];
    const isRequired = typeof validation.required === 'function' ? 
                       validation.required(process.env) : validation.required;
    
    // 必須チェック
    if (isRequired && !value) {
      results.errors.push(validation.message || `${key} is required but not set.`);
      results.valid = false;
    }
    
    // 列挙型チェック
    if (value && validation.enum && !validation.enum.includes(value)) {
      results.warnings.push(`${key} has invalid value: ${value}. Expected one of: ${validation.enum.join(', ')}. Using default: ${validation.default}.`);
    }
  });
  
  return results;
}

/**
 * パス設定
 */
function setupPaths() {
  // リソースディレクトリの設定
  const rootDir = path.resolve(__dirname, '..');
  
  // 各フォルダのパスを設定
  config.paths = {
    root: rootDir,
    core: path.join(rootDir, 'core'),
    system: path.join(rootDir, 'system'),
    extensions: path.join(rootDir, 'extensions'),
    platforms: path.join(rootDir, 'platforms'),
    character: path.join(rootDir, 'extensions', 'character'),
    memory: path.join(rootDir, 'extensions', 'memory'),
    rag: path.join(rootDir, 'extensions', 'rag'),
    plugins: path.join(rootDir, 'extensions', 'plugins'),
  };
  
  // キャラクターファイルのパスを設定
  config.character.settingsPath = path.join(
    config.paths.character,
    config.character.settingsFile
  );
}

/**
 * 設定の取得
 * @param {string} key - 取得したい設定キー
 * @returns {any} 設定値
 */
function get(key) {
  if (!key) return { ...config };
  
  const keys = key.split('.');
  let result = config;
  
  for (const k of keys) {
    if (result === undefined || result === null) return undefined;
    result = result[k];
  }
  
  return result;
}

/**
 * 設定の更新
 * @param {string} key - 更新したい設定キー
 * @param {any} value - 新しい値
 */
function set(key, value) {
  if (!key) return;
  
  const keys = key.split('.');
  let current = config;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (current[k] === undefined || current[k] === null) {
      current[k] = {};
    }
    current = current[k];
  }
  
  current[keys[keys.length - 1]] = value;
  
  logger.debug(`Config updated: ${key} = ${JSON.stringify(value)}`);
}

/**
 * オブジェクトを再帰的にマージ
 * @param {Object} target - マージ先オブジェクト
 * @param {Object} source - マージ元オブジェクト
 * @returns {Object} マージされたオブジェクト
 */
function mergeDeep(target, source) {
  const output = Object.assign({}, target);
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = mergeDeep(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  
  return output;
}

/**
 * オブジェクトかどうか判定
 * @param {any} item - チェックする値
 * @returns {boolean} オブジェクトかどうか
 */
function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

module.exports = {
  initialize,
  get,
  set,
  mergeDeep
};