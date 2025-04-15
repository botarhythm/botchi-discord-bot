/**
 * Providers Manager - AIプロバイダーの管理
 * 
 * 複数のAIプロバイダー（OpenAI、Gemini等）を管理し、
 * 特定の機能拡張（メモリシステム等）との統合を提供します。
 * 
 * @module extensions/providers
 */

// 標準モジュールをインポート
const path = require('path');
const fs = require('fs');

// アプリケーションルートパスの判定（Railway対応）
const isRailwayEnvironment = !!process.env.RAILWAY_SERVICE_ID;
const appRoot = isRailwayEnvironment ? '/app' : path.resolve(__dirname, '../..');

// インライン・シンプルロガーの実装
const logger = {
  debug: (...args) => console.debug('[DEBUG]', ...args),
  info: (...args) => console.info('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  fatal: (...args) => console.error('[FATAL]', ...args)
};

// 安全なrequire関数の実装
function safeRequire(modulePath, fallback = null) {
  try {
    return require(modulePath);
  } catch (e) {
    logger.warn(`モジュール '${modulePath}' のロード失敗: ${e.message}`);
    return fallback;
  }
}

// 環境に依存しないパス生成
function getProviderPath(relativePath) {
  try {
    if (!relativePath) {
      logger.warn('無効なパスが指定されました: 空のパス');
      return null;
    }
    // 相対パスの先頭の.や/を削除
    const cleanPath = relativePath.replace(/^[\.\/]+/, '');
    // 絶対パスを構築
    const absolutePath = path.join(appRoot, cleanPath);
    
    // ファイルの存在確認（デバッグ情報として使用）
    if (fs.existsSync(absolutePath)) {
      logger.debug(`ファイル存在確認：${absolutePath} ✓`);
    } else {
      logger.debug(`ファイル存在確認：${absolutePath} ✗`);
    }
    
    return absolutePath;
  } catch (e) {
    logger.warn(`パス解決エラー: ${e.message}`);
    return relativePath;
  }
}

// 利用可能なプロバイダー定義
const PROVIDERS = {
  // 標準プロバイダー
  'openai': getProviderPath('openai-service.js'),
  'gemini': getProviderPath('gemini-service.js'),
  // 拡張プロバイダー
  'openai-memory': getProviderPath('extensions/providers/openai-memory-provider.js')
};

// プロバイダーパスのログ
logger.debug(`実行環境: ${isRailwayEnvironment ? 'Railway' : 'ローカル開発'}`);
logger.debug(`アプリケーションルートパス: ${appRoot}`);
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
    // 初期化開始のログ
    logger.info('AIプロバイダー初期化を開始します...');
    logger.info(`環境情報: Railway=${isRailwayEnvironment}, MEMORY_ENABLED=${process.env.MEMORY_ENABLED || 'false'}`);
    
    // 環境変数またはオプションからプロバイダーを決定
    const providerName = options.provider || process.env.AI_PROVIDER || defaultProvider;
    logger.info(`指定されたプロバイダー: ${providerName}`);
    
    // メモリサポートの有効化をチェック
    const memoryEnabled = process.env.MEMORY_ENABLED === 'true';
    if (memoryEnabled) {
      logger.info('メモリ機能が有効です - メモリ対応プロバイダーを使用します');
    }
    
    // プロバイダー名を解決（メモリサポートを考慮）
    const resolvedProvider = resolveProviderName(providerName, memoryEnabled);
    if (resolvedProvider !== providerName) {
      logger.info(`プロバイダーを解決しました: ${providerName} → ${resolvedProvider}`);
    }
    
    // 使用可能なプロバイダー一覧を表示
    const availableProviders = Object.keys(PROVIDERS);
    logger.info(`利用可能なプロバイダー(${availableProviders.length}): ${availableProviders.join(', ')}`);
    
    // プロバイダーをセット
    logger.debug(`プロバイダー '${resolvedProvider}' の設定を試行します...`);
    const success = await setProvider(resolvedProvider);
    
    if (!success) {
      logger.warn(`プロバイダー '${resolvedProvider}' の設定に失敗しました。デフォルトプロバイダーにフォールバックします。`);
      
      // 既定プロバイダーが指定済みプロバイダーと同じ場合はさらなる試行は避ける
      if (resolvedProvider !== defaultProvider) {
        const fallbackSuccess = await setProvider(defaultProvider);
        if (!fallbackSuccess) {
          logger.error(`デフォルトプロバイダー '${defaultProvider}' も設定できませんでした。`);
          return {
            initialized: false,
            error: `プロバイダー '${resolvedProvider}' の設定に失敗し、デフォルトプロバイダーも設定できませんでした`,
            availableProviders
          };
        }
      } else {
        // デフォルトプロバイダーでの初期化も失敗した場合
        return {
          initialized: false,
          error: `デフォルトプロバイダー '${defaultProvider}' の設定に失敗しました`,
          availableProviders
        };
      }
    }
    
    logger.info(`プロバイダーを初期化しました: ${activeProvider}`);
    return {
      initialized: true,
      provider: activeProvider,
      availableProviders,
      memoryEnabled
    };
  } catch (error) {
    logger.error(`プロバイダー初期化エラー: ${error.message}`);
    logger.debug(`エラー詳細: ${error.stack || 'スタック情報なし'}`);
    return {
      initialized: false,
      error: error.message,
      availableProviders: Object.keys(PROVIDERS)
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
      const loadedModule = safeRequire(modulePath, {
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
  try {
    // 初期チェック
    if (!context) {
      logger.error('getResponse: 無効なコンテキスト（null/undefined）');
      return '申し訳ありません、会話コンテキストが不正です。';
    }
    
    // プロバイダーの確認
    const provider = getProvider();
    if (!provider) {
      logger.error('getResponse: 有効なプロバイダーがありません');
      return '申し訳ありません、AIサービスが初期化されていません。';
    }

    // contextオブジェクトが文字列の場合の互換性処理（レガシーAPI対応）
    if (typeof context === 'string') {
      logger.debug('文字列形式のコンテキストを検出しました。互換モードで処理します。');
      return await getLegacyResponse(context, 'unknown', false);
    }

    // 必須パラメータの確認
    if (!context.userId || !context.message) {
      logger.error(`getResponse: 不正なコンテキスト形式 - userIdまたはmessageがありません`, 
        { userId: !!context.userId, message: !!context.message });
      return '申し訳ありません、メッセージの形式が不正です。';
    }
    
    // プロバイダーのインターフェースに応じた呼び出し
    logger.debug(`getResponse呼び出し: プロバイダー=${activeProvider}`);
    
    // プロバイダーインターフェースのチェック
    if (typeof provider.getResponse === 'function') {
      // 新しいインターフェース (context)
      logger.debug(`${activeProvider}のgetResponseを使用`);
      
      // 既存のgetResponseメソッドを使用
      const result = await provider.getResponse(context);
      return result;
    } else if (typeof provider.getAIResponse === 'function') {
      // レガシーインターフェース (userId, message, username, isDM)
      const { userId, username = 'User', message, contextType = 'unknown' } = context;
      logger.debug(`${activeProvider}のgetAIResponseを使用: userId=${userId}, contextType=${contextType}`);
      
      const isDM = contextType === 'direct_message';
      return await provider.getAIResponse(
        userId,
        message,
        username,
        isDM
      );
    } else {
      // 両方のメソッドがない場合はエラー
      throw new Error(`プロバイダー ${activeProvider} に応答取得メソッド(getResponse/getAIResponse)がありません`);
    }
  } catch (error) {
    logger.error(`応答取得エラー: ${error.message}`);
    logger.debug(`エラー詳細: ${error.stack || 'スタック情報なし'}`);
    
    // エラー種別に応じたユーザーフレンドリーなメッセージ
    if (error.code === 'ECONNREFUSED' || error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return '申し訳ありません、AIサービスへの接続がタイムアウトしました。しばらく経ってからお試しください。';
    } else if (error.message.includes('API key')) {
      return '申し訳ありません、AI APIの設定に問題があります。システム管理者にご連絡ください。';
    } else if (error.message.includes('rate limit') || error.message.includes('429')) {
      return '申し訳ありません、AIサービスの利用制限に達しました。しばらく経ってからお試しください。';
    }
    
    return '申し訳ありません、応答の生成中にエラーが発生しました。';
  }
}

/**
 * レガシーAPIのための補助関数
 * @param {string} message - ユーザーのメッセージ
 * @param {string} userId - オプションのユーザーID
 * @param {boolean} isDM - DMかどうか
 * @returns {Promise<string>} AIからの応答
 * @private
 */
async function getLegacyResponse(message, userId = 'unknown', isDM = false) {
  try {
    const provider = getProvider();
    
    if (typeof provider.getAIResponse === 'function') {
      return await provider.getAIResponse(userId, message, 'User', isDM);
    } else if (typeof provider.getResponse === 'function') {
      // 新しいインターフェースをレガシー呼び出し用に変換
      const context = {
        userId,
        username: 'User',
        message,
        contextType: isDM ? 'direct_message' : 'unknown'
      };
      
      return await provider.getResponse(context);
    } else {
      throw new Error('利用可能な応答取得メソッドがありません');
    }
  } catch (error) {
    logger.error(`レガシー応答取得エラー: ${error.message}`);
    return '申し訳ありません、処理中にエラーが発生しました。';
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