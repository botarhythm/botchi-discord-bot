/**
 * Bocchy Discord Bot - パス解決デバッグテスト
 * モジュールパスの解決問題を診断するテストスクリプト
 */

const path = require('path');
const fs = require('fs');

// 基本情報の表示
console.log('=== 環境情報 ===');
console.log(`現在の作業ディレクトリ: ${process.cwd()}`);
console.log(`このファイルの場所: ${__dirname}`);
console.log(`Node.jsバージョン: ${process.version}`);
console.log('');

// ファイル存在確認
const filePathsToCheck = [
  './system/logger.js',
  './extensions/providers/index.js',
  './openai-service.js'
];

console.log('=== ファイル存在確認 ===');
filePathsToCheck.forEach(filePath => {
  const resolvedPath = path.resolve(__dirname, filePath);
  const exists = fs.existsSync(resolvedPath);
  console.log(`${filePath}: ${exists ? '存在します' : '存在しません'} (${resolvedPath})`);
});
console.log('');

// モジュール解決テスト
console.log('=== モジュール解決テスト ===');

try {
  // 1. 通常の相対パスでの読み込み
  console.log('相対パスでのloggerモジュール読み込みテスト...');
  const logger = require('./system/logger');
  console.log('成功: ./system/logger を読み込みました');
} catch (error) {
  console.error(`失敗: ${error.message}`);
}

try {
  // 2. 絶対パスでの読み込み
  console.log('\n絶対パスでのloggerモジュール読み込みテスト...');
  const loggerPath = path.resolve(__dirname, './system/logger');
  const loggerModule = require(loggerPath);
  console.log('成功: 絶対パスでloggerを読み込みました');
} catch (error) {
  console.error(`失敗: ${error.message}`);
}

try {
  // 3. AIプロバイダーモジュールの読み込みテスト
  console.log('\nプロバイダーモジュール読み込みテスト...');
  const providersPath = path.resolve(__dirname, './extensions/providers');
  const providers = require(providersPath);
  console.log('成功: プロバイダーモジュールを読み込みました');
  
  // プロバイダー情報の表示
  console.log(`利用可能なプロバイダー: ${providers.getAvailableProviders()}`);
} catch (error) {
  console.error(`失敗: ${error.message}`);
}

console.log('\n=== テスト完了 ===');
