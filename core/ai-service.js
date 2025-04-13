/**
 * Bocchy Discord Bot - Core AI Service
 * 汎用AIサービスインターフェース
 */

// 将来的にはAIプロバイダーのファクトリーパターン実装
const adapters = {
  openai: null,  // Lazy load
  gemini: null,  // Lazy load
  // 将来的に他のプロバイダを追加可能
};

// 現在のプロバイダーインスタンス
let currentProvider = null;
let currentProviderName = null;

/**
 * AIサービスの初期化
 * @param {Object} config - 設定オブジェクト
 * @param {string} config.provider - プロバイダ名 ('openai', 'gemini' など)
 * @param {Object} config.options - プロバイダ固有の設定
 * @returns {Promise<Object>} 初期化結果
 */
async function initialize(config = {}) {
  try {
    // 環境変数またはパラメータからプロバイダを取得
    const providerName = config.provider || process.env.AI_PROVIDER || 'openai';
    
    // 大文字小文字を問わない
    const normalizedProviderName = providerName.toLowerCase();
    
    // サポートしているプロバイダかチェック
    if (!Object.keys(adapters).includes(normalizedProviderName)) {
      throw new Error(`未サポートのAIプロバイダ: ${providerName}。サポート済み: ${Object.keys(adapters).join(', ')}`);
    }
    
    // プロバイダーがまだロードされていない場合は遅延ロード
    if (!adapters[normalizedProviderName]) {
      try {
        adapters[normalizedProviderName] = require(`../extensions/providers/${normalizedProviderName}-provider.js`);
      } catch (loadError) {
        // 新しいパスでの読み込みに失敗した場合、従来のパスを試す (後方互換性)
        try {
          adapters[normalizedProviderName] = require(`../${normalizedProviderName}-service.js`);
        } catch (legacyLoadError) {
          throw new Error(`プロバイダモジュールの読み込みに失敗: ${loadError.message}\n旧フォーマットでも試行: ${legacyLoadError.message}`);
        }
      }
    }
    
    // プロバイダの初期化
    const providerResult = await adapters[normalizedProviderName].initialize(config.options);
    
    // 現在のプロバイダをセット
    currentProvider = adapters[normalizedProviderName];
    currentProviderName = normalizedProviderName;
    
    console.log(`AIサービス初期化完了: ${normalizedProviderName}`);
    
    return {
      initialized: true,
      provider: normalizedProviderName,
      result: providerResult
    };
  } catch (error) {
    console.error(`AIサービス初期化エラー:`, error);
    return {
      initialized: false,
      error: error.message
    };
  }
}

/**
 * AIによる応答生成
 * @param {string} userId - ユーザーID
 * @param {string} message - ユーザーメッセージ
 * @param {string} username - ユーザー名 (任意)
 * @param {boolean} isDM - DMかどうか
 * @param {Object} options - その他のオプション
 * @returns {Promise<string>} AI応答
 */
async function getResponse(userId, message, username = '', isDM = false, options = {}) {
  if (!currentProvider) {
    throw new Error('AIサービスが初期化されていません。initialize()を最初に呼び出してください。');
  }
  
  // プロバイダに処理を委譲
  return currentProvider.getAIResponse(userId, message, username, isDM, options);
}

/**
 * 会話履歴のクリア
 * @param {string} userId - ユーザーID
 * @returns {Promise<boolean>} 成功したかどうか
 */
async function clearConversation(userId) {
  if (!currentProvider) {
    return false;
  }
  
  return currentProvider.clearConversationHistory(userId);
}

/**
 * AIサービスの健全性確認
 * @returns {Promise<Object>} ヘルスステータス
 */
async function checkHealth() {
  if (!currentProvider || !currentProvider.checkHealth) {
    return {
      status: 'unconfigured',
      provider: currentProviderName || 'none',
      lastCheck: Date.now()
    };
  }
  
  return currentProvider.checkHealth();
}

/**
 * 現在の設定情報の取得
 * @returns {Object} 設定情報
 */
function getConfig() {
  if (!currentProvider) {
    return {
      initialized: false,
      provider: null
    };
  }
  
  const providerConfig = currentProvider.getConfig ? currentProvider.getConfig() : {};
  
  return {
    initialized: true,
    provider: currentProviderName,
    ...providerConfig
  };
}

/**
 * サービスが設定済みかを確認
 * @returns {boolean} 設定済みかどうか
 */
function isConfigured() {
  if (!currentProvider) {
    return false;
  }
  
  return currentProvider.isConfigured ? currentProvider.isConfigured() : true;
}

module.exports = {
  initialize,
  getResponse,
  clearConversation,
  checkHealth,
  getConfig,
  isConfigured
};