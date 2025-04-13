/**
 * Bocchy Discord Bot - System Loader
 * モジュール動的ロード機能
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('./config');
const monitor = require('./monitor');

// ロード済みのモジュール一覧
const loadedModules = new Map();

/**
 * ローダーの初期化
 * @param {Object} options - 初期化オプション
 * @returns {Object} 初期化結果
 */
function initialize(options = {}) {
  logger.info('Module loader initialized');
  
  return {
    initialized: true,
    modulesPath: config.get('paths') || {}
  };
}

/**
 * 指定されたカテゴリのモジュールを全てロード
 * @param {string} category - モジュールカテゴリ (core, system, platforms, extensions)
 * @param {Object} options - 追加オプション
 * @returns {Object} ロードされたモジュールのマップ
 */
async function loadCategory(category, options = {}) {
  const basePath = config.get(`paths.${category}`);
  if (!basePath) {
    logger.error(`Invalid module category: ${category}`);
    return {};
  }
  
  try {
    if (!fs.existsSync(basePath)) {
      logger.warn(`Directory for ${category} modules not found: ${basePath}`);
      return {};
    }
    
    const files = fs.readdirSync(basePath)
      .filter(file => file.endsWith('.js'));
    
    const modules = {};
    
    for (const file of files) {
      try {
        const moduleName = path.basename(file, '.js');
        const moduleKey = `${category}.${moduleName}`;
        
        // モジュールをロード
        const loadedModule = await loadModule(category, moduleName, options);
        
        if (loadedModule) {
          modules[moduleName] = loadedModule;
          logger.debug(`Loaded ${category} module: ${moduleName}`);
        }
      } catch (error) {
        logger.error(`Failed to load module ${file}:`, error);
        monitor.recordError(error, { category, file });
      }
    }
    
    return modules;
  } catch (error) {
    logger.error(`Error loading ${category} modules:`, error);
    monitor.recordError(error, { category });
    return {};
  }
}

/**
 * 単一モジュールをロード
 * @param {string} category - モジュールカテゴリ
 * @param {string} moduleName - モジュール名
 * @param {Object} options - 追加オプション
 * @returns {Object} ロードされたモジュールまたはnull
 */
async function loadModule(category, moduleName, options = {}) {
  const moduleKey = `${category}.${moduleName}`;
  
  // 既にロード済みの場合は再利用
  if (loadedModules.has(moduleKey) && !options.reload) {
    return loadedModules.get(moduleKey).module;
  }
  
  try {
    const basePath = config.get(`paths.${category}`);
    const modulePath = path.join(basePath, `${moduleName}.js`);
    
    if (!fs.existsSync(modulePath)) {
      logger.warn(`Module file not found: ${modulePath}`);
      return null;
    }
    
    // キャッシュをクリアして再ロード
    if (options.reload) {
      delete require.cache[require.resolve(modulePath)];
    }
    
    // モジュールをロード
    const moduleExports = require(modulePath);
    
    // 初期化関数があれば実行
    if (typeof moduleExports.initialize === 'function') {
      await moduleExports.initialize(options.initOptions);
    }
    
    // ロード済みモジュールに追加
    loadedModules.set(moduleKey, {
      module: moduleExports,
      path: modulePath,
      loadTime: Date.now(),
      options
    });
    
    // 健全性チェックを登録
    monitor.registerHealthCheck(moduleKey, 'healthy', {
      loadTime: Date.now()
    });
    
    return moduleExports;
  } catch (error) {
    logger.error(`Error loading module ${moduleKey}:`, error);
    monitor.recordError(error, { category, moduleName });
    
    // 健全性チェックを登録
    monitor.registerHealthCheck(moduleKey, 'unhealthy', {
      error: error.message
    });
    
    return null;
  }
}

/**
 * プラグインをロード
 * @param {string} pluginName - プラグイン名
 * @param {Object} options - オプション
 * @returns {Object} プラグインオブジェクト
 */
async function loadPlugin(pluginName, options = {}) {
  return await loadModule('extensions/plugins', pluginName, options);
}

/**
 * キャラクター設定をロード
 * @param {string} characterName - キャラクター名またはファイル名
 * @returns {string} キャラクター設定文字列
 */
function loadCharacterSettings(characterName = null) {
  const settingsName = characterName || config.get('character.settingsFile') || 'bocchy-character.md';
  const characterPath = config.get('paths.character');
  const settingsPath = path.join(characterPath, settingsName);
  
  try {
    if (!fs.existsSync(settingsPath)) {
      logger.warn(`Character settings file not found: ${settingsPath}`);
      return null;
    }
    
    const content = fs.readFileSync(settingsPath, 'utf8');
    logger.debug(`Loaded character settings: ${settingsName}`);
    
    return content;
  } catch (error) {
    logger.error(`Error loading character settings: ${settingsName}`, error);
    monitor.recordError(error, { characterName });
    return null;
  }
}

/**
 * フォールバックモジュールをロード
 * @param {string} modulePath - モジュールの相対パス
 * @returns {Object} フォールバックモジュール
 */
function loadFallback(modulePath) {
  try {
    const fullPath = path.join(config.get('paths.core'), 'fallback.js');
    if (fs.existsSync(fullPath)) {
      logger.warn(`Loading fallback module for ${modulePath}`);
      return require(fullPath);
    }
    return createGenericFallback(modulePath);
  } catch (error) {
    logger.error(`Error loading fallback module:`, error);
    return createGenericFallback(modulePath);
  }
}

/**
 * 汎用的なフォールバックモジュールを生成
 * @param {string} failedModulePath - 失敗したモジュールのパス
 * @returns {Object} フォールバックモジュール
 */
function createGenericFallback(failedModulePath) {
  const moduleName = path.basename(failedModulePath, '.js');
  
  // 汎用的なフォールバックモジュールを生成
  return {
    name: `${moduleName}-fallback`,
    initialize: () => {
      logger.warn(`Using generic fallback for ${moduleName}`);
      return { initialized: true, fallback: true };
    },
    // 汎用的なエラーメッセージを返すプロキシハンドラ
    __noSuchMethod__: function(name) {
      return function() {
        logger.error(`Attempt to call ${name} on fallback module for ${moduleName}`);
        return null;
      };
    }
  };
}

/**
 * ロードされた全モジュールのリストを取得
 * @returns {Array} ロードされたモジュールのリスト
 */
function getLoadedModules() {
  const result = [];
  loadedModules.forEach((value, key) => {
    result.push({
      key,
      path: value.path,
      loadTime: value.loadTime,
      hasInitialize: typeof value.module.initialize === 'function'
    });
  });
  return result;
}

/**
 * モジュールがロードされているか確認
 * @param {string} moduleKey - 確認するモジュールのキー
 * @returns {boolean} ロードされていればtrue
 */
function isModuleLoaded(moduleKey) {
  return loadedModules.has(moduleKey);
}

/**
 * モジュールをアンロード
 * @param {string} moduleKey - アンロードするモジュールのキー
 * @returns {boolean} 成功した場合true
 */
function unloadModule(moduleKey) {
  if (!loadedModules.has(moduleKey)) {
    return false;
  }
  
  try {
    const moduleInfo = loadedModules.get(moduleKey);
    
    // モジュールに終了処理があれば呼び出す
    if (moduleInfo.module.shutdown && typeof moduleInfo.module.shutdown === 'function') {
      moduleInfo.module.shutdown();
    }
    
    // キャッシュから削除
    delete require.cache[require.resolve(moduleInfo.path)];
    
    // 管理リストから削除
    loadedModules.delete(moduleKey);
    
    logger.debug(`Unloaded module: ${moduleKey}`);
    return true;
  } catch (error) {
    logger.error(`Error unloading module ${moduleKey}:`, error);
    monitor.recordError(error, { operation: 'unload', moduleKey });
    return false;
  }
}

module.exports = {
  initialize,
  loadCategory,
  loadModule,
  loadPlugin,
  loadCharacterSettings,
  loadFallback,
  getLoadedModules,
  isModuleLoaded,
  unloadModule
};