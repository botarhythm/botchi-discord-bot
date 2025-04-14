/**
 * Providers Manager - AIプロバイダーの管理
 * 
 * 複数のAIプロバイダー（OpenAI、Gemini等）を管理し、
 * 特定の機能拡張（メモリシステム等）との統合を提供します。
 * 
 * @module extensions/providers
 */

// Using path.resolve for more reliable path resolution
const path = require('path');
const logger = require(path.resolve(__dirname, '../../system/logger'));

// プロバイダー登録 - 絶対パスに変換
const PROVIDERS = {
  // 標準プロバイダー
  'openai': path.resolve(__dirname, '../../openai-service.js'),
  'gemini': path.resolve(__dirname, '../../gemini-service.js'),
  // 拡張プロバイダー
  'openai-memory': path.resolve(__dirname, './openai-memory-provider.js')
};

// 現在のプロバイダー
let activeProvider = null;
let providerInstance = null;
let defaultProvider = 'openai';

/**
 * モジュールの初期化
 * @param {Object} options - 初期化オプション
 * @param {string} options.provider - 使用するプロバイダー名
 * @returns {Promise<Object>} 初期化結果
 */
async function initialize(options = {}) {
  try {
    // 環境変数またはオプションからプロバイダーを決定
    const providerName = options.provider || process.env.AI_PROVIDER || defaultProvider;
    
    // メモリサポートの有効化をチェック
    const memoryEnabled = process.env.MEMORY_ENABLED === 'true';
    
    // プロバイダー名を解決（メモリサポートを考慮）
    const resolvedProvider = resolveProviderName(providerName, memoryEnabled);
    
    // プロバイダーをセット
    const success = await setProvider(resolvedProvider);
    
    if (!success) {
      logger.warn(`プロバイダー '${resolvedProvider}' の設定に失敗しました。デフォルトプロバイダーにフォールバックします。`);
      await setProvider(defaultProvider);
    }
    
    logger.info(`プロバイダーを初期化しました: ${activeProvider}`);
    return {
      initialized: true,
      provider: activeProvider,
      availableProviders: Object.keys(PROVIDERS)
    };
  } catch (error) {
    logger.error(`プロバイダー初期化エラー: ${error.message}`);
    return {
      initialized: false,
      error: error.message
    };
  }
}

/**
 * 適切なプロバイダー名を解決
 * @param {string} providerName - ベースプロバイダー名
 * @param {boolean} memoryEnabled - メモリ機能の有効化フラグ
 * @returns {string} 解決されたプロバイダー名
 * @private
 */
function resolveProviderName(providerName, memoryEnabled) {
  // メモリ拡張バージョンのプロバイダー名
  const memoryProviderName = `${providerName}-memory`;
  
  // メモリサポートが有効で、対応するメモリプロバイダーが存在する場合はそれを使用
  if (memoryEnabled && PROVIDERS[memoryProviderName]) {
    return memoryProviderName;
  }
  
  // それ以外はベースプロバイダーを使用
  return providerName;
}

/**
 * プロバイダーを設定
 * @param {string} providerName - プロバイダー名
 * @returns {Promise<boolean>} 設定成功の可否
 */
async function setProvider(providerName) {
  try {
    if (!PROVIDERS[providerName]) {
      logger.error(`プロバイダー '${providerName}' は登録されていません`);
      return false;
    }
    
    // プロバイダーモジュールのロード
    try {
      // 相対パスでモジュールをインポート
      const modulePath = PROVIDERS[providerName];
      providerInstance = require(modulePath);
      activeProvider = providerName;
      
      // プロバイダーの初期化（初期化メソッドがある場合）
      if (typeof providerInstance.initialize === 'function') {
        await providerInstance.initialize();
      }
      
      logger.info(`プロバイダー '${activeProvider}' を設定しました`);
      return true;
    } catch (error) {
      logger.error(`プロバイダー '${providerName}' のロードエラー: ${error.message}`);
      return false;
    }
  } catch (error) {
    logger.error(`プロバイダー設定エラー: ${error.message}`);
    return false;
  }
}

/**
 * 現在のプロバイダーインスタンスを取得
 * @returns {Object|null} プロバイダーインスタンス
 */
function getProvider() {
  return providerInstance;
}

/**
 * 現在のプロバイダー名を取得
 * @returns {string|null} プロバイダー名
 */
function getProviderName() {
  return activeProvider;
}

/**
 * 利用可能なプロバイダーのリストを取得
 * @returns {string[]} プロバイダー名リスト
 */
function getAvailableProviders() {
  return Object.keys(PROVIDERS);
}

/**
 * ヘルスチェックの実行
 * @returns {Promise<Object>} ヘルスステータス
 */
async function checkHealth() {
  try {
    if (!providerInstance) {
      return {
        status: 'unhealthy',
        error: 'プロバイダーが設定されていません',
        provider: null
      };
    }
    
    if (typeof providerInstance.checkHealth !== 'function') {
      return {
        status: 'unknown',
        error: 'プロバイダーにヘルスチェック機能がありません',
        provider: activeProvider
      };
    }
    
    const result = await providerInstance.checkHealth();
    return {
      ...result,
      provider: activeProvider
    };
  } catch (error) {
    logger.error(`ヘルスチェックエラー: ${error.message}`);
    return {
      status: 'error',
      error: error.message,
      provider: activeProvider
    };
  }
}

module.exports = {
  initialize,
  setProvider,
  getProvider,
  getProviderName,
  getAvailableProviders,
  checkHealth
};