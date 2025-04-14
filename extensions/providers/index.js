/**
 * Providers Manager - AIプロバイダーの管理
 * 
 * 複数のAIプロバイダー（OpenAI、Gemini等）を管理し、
 * 特定の機能拡張（メモリシステム等）との統合を提供します。
 * 
 * @module extensions/providers
 */

// 環境非依存のパス解決ユーティリティを使用
const utils = require('../../local-sync-utility');

// ロガーを安全にロード
const logger = utils.safeRequire('../../system/logger', utils.createSimpleLogger());

// 環境に依存しないパス生成（パス関数を使って安全にパスを構築）
function getProviderPath(relativePath) {
  try {
    return utils.appRoot + '/' + relativePath.replace(/^[\.\/]+/, '');
  } catch (e) {
    logger.warn(`パス解決エラー: ${e.message}`);
    return relativePath;
  }
}

// 利用可能なプロバイダー定義
const PROVIDERS = {
  // 標準プロバイダー (親ディレクトリ)
  'openai': getProviderPath('../../openai-service.js'),
  'gemini': getProviderPath('../../gemini-service.js'),
  // 拡張プロバイダー (同じディレクトリ)
  'openai-memory': getProviderPath('./openai-memory-provider.js')
};

// プロバイダーパスのログ
logger.debug('利用可能なプロバイダーパス:');
Object.entries(PROVIDERS).forEach(([name, path]) => {
  logger.debug(`  ${name}: ${path}`);
});

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
      
      // 登録されたプロバイダー一覧を表示（デバッグ用）
      const availableProviders = Object.keys(PROVIDERS).join(', ');
      logger.info(`利用可能なプロバイダー: ${availableProviders || 'なし'}`);
      
      return false;
    }
    
    // プロバイダーモジュールのロード
    try {
      const modulePath = PROVIDERS[providerName];
      logger.debug(`プロバイダーモジュールのロード試行: ${modulePath}`);
      
      // 安全なモジュールローダーを使用
      const loadedModule = utils.safeRequire(modulePath, {
        // フォールバック（プロバイダーの必須メソッド）
        getResponse: async () => '申し訳ありません、AIプロバイダーのロードに失敗しました。',
        isConfigured: () => false,
        initialize: async () => ({ status: 'fallback' }),
        checkHealth: async () => ({ status: 'unhealthy' })
      });
      
      // プロバイダーが必要なAPIを提供しているか確認
      const hasGetResponse = typeof loadedModule.getResponse === 'function';
      const hasGetAIResponse = typeof loadedModule.getAIResponse === 'function';
      const hasRequiredApi = hasGetResponse || hasGetAIResponse;
      
      if (!hasRequiredApi) {
        logger.error(`プロバイダー '${providerName}' に必要なAPI(getResponse または getAIResponse)が実装されていません`);
        return false;
      }
      
      // API実装の詳細をログに出力
      logger.debug(`プロバイダー '${providerName}' のAPI実装: getResponse=${hasGetResponse}, getAIResponse=${hasGetAIResponse}`);
      
      // プロバイダーを設定
      providerInstance = loadedModule;
      activeProvider = providerName;
      
      // プロバイダーの初期化（初期化メソッドがある場合）
      if (typeof providerInstance.initialize === 'function') {
        logger.debug(`プロバイダー '${providerName}' の初期化を実行`);
        const initResult = await providerInstance.initialize();
        logger.debug(`初期化結果: ${JSON.stringify(initResult)}`);
      }
      
      logger.info(`プロバイダー '${activeProvider}' を設定しました`);
      return true;
    } catch (error) {
      logger.error(`プロバイダー '${providerName}' のロードエラー: ${error.message}`);
      logger.debug(`エラー詳細: ${error.stack || 'スタック情報なし'}`);
      return false;
    }
  } catch (error) {
    logger.error(`プロバイダー設定エラー: ${error.message}`);
    logger.debug(`エラー詳細: ${error.stack || 'スタック情報なし'}`);
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
 * 互換性のあるレスポンス取得メソッド
 * message-handler.jsからの呼び出しに合わせた形式
 * @param {Object} context - 会話コンテキスト
 * @returns {Promise<string>} AIからの応答
 */
async function getResponse(context) {
  const provider = getProvider();
  if (!provider) {
    logger.error('有効なプロバイダーがありません');
    return '申し訳ありません、AIサービスが初期化されていません。';
  }

  // プロバイダーのインターフェースに応じた呼び出し
  try {
    logger.debug(`getResponse呼び出し: プロバイダー=${activeProvider}, コンテキスト=`, context);
    
    // プロバイダーインターフェースのチェック
    if (typeof provider.getResponse === 'function') {
      // 新しいインターフェース (context)
      logger.debug(`${activeProvider}のgetResponseを使用`);
      return await provider.getResponse(context);
    } else if (typeof provider.getAIResponse === 'function') {
      // レガシーインターフェース (userId, message, username, isDM)
      const { userId, username, message, contextType } = context;
      logger.debug(`${activeProvider}のgetAIResponseを使用: userId=${userId}, contextType=${contextType}`);
      return await provider.getAIResponse(
        userId,
        message,
        username,
        contextType === 'direct_message'
      );
    } else {
      throw new Error(`プロバイダー ${activeProvider} に応答取得メソッドがありません`);
    }
  } catch (error) {
    logger.error(`応答取得エラー: ${error.message}`);
    logger.debug(`エラー詳細: ${error.stack || 'スタック情報なし'}`);
    return '申し訳ありません、応答の生成中にエラーが発生しました。';
  }
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
  checkHealth,
  // 互換性レイヤー
  getResponse
};