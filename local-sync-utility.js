/**
 * 統合パス解決モジュール
 * 
 * このユーティリティは、異なる環境（ローカル開発/Railway）間での
 * モジュールパス解決の問題を解決するためのヘルパーを提供します。
 * 標準のpathモジュールを使用して堅牢性を強化しています。
 */

const fs = require('fs');
const path = require('path');

// 現在の環境がRailwayかどうかを判断
const isRailwayEnvironment = !!process.env.RAILWAY_SERVICE_ID;

// アプリのルートディレクトリを特定（標準のpath.resolveを使用）
const appRoot = isRailwayEnvironment ? '/app' : path.resolve(__dirname);

// デバッグモードの場合のみログ出力
if (process.env.DEBUG === 'true') {
  console.log(`実行環境: ${isRailwayEnvironment ? 'Railway' : 'ローカル開発'}`);
  console.log(`アプリケーションルートパス: ${appRoot}`);
}

/**
 * モジュールの安全なインポート
 * @param {string} modulePath - インポートするモジュールのパス
 * @param {Object} fallback - モジュールが見つからない場合のフォールバック
 * @returns {Object} インポートされたモジュールまたはフォールバック
 */
function safeRequire(modulePath, fallback = null) {
  try {
    // 相対パスで試みる
    const result = require(modulePath);
    return result;
  } catch (originalError) {
    try {
      // ファイルが存在しないエラーの場合は絶対パスを試みる
      // 相対パスから絶対パスに変換（先頭の./や../を削除）
      const normalizedPath = modulePath.replace(/^[\.\/]+/, '');
      const absolutePath = path.resolve(appRoot, normalizedPath);
      
      // エラーが発生した場合のデバッグ情報を出力
      if (process.env.DEBUG === 'true') {
        console.debug(`相対パス '${modulePath}' でのロードに失敗。絶対パス '${absolutePath}' を試みます`);
      }
      
      return require(absolutePath);
    } catch (fallbackError) {
      // 両方の方法でロードに失敗した場合
      if (process.env.DEBUG === 'true') {
        console.warn(`モジュール '${modulePath}' のロードに失敗しました: ${fallbackError.message}`);
        console.warn(`元のエラー: ${originalError.message}`);
      }
      return fallback;
    }
  }
}

/**
 * シンプルなロガーフォールバックの作成
 * @returns {Object} 簡易ロガーオブジェクト
 */
function createSimpleLogger() {
  return {
    debug: (...args) => console.debug('[DEBUG]', ...args),
    info: (...args) => console.info('[INFO]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    fatal: (...args) => console.error('[FATAL]', ...args)
  };
}

// エクスポート
module.exports = {
  appRoot,
  isRailwayEnvironment,
  safeRequire,
  createSimpleLogger
};