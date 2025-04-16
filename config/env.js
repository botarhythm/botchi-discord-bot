/**
 * Bocchy Discord Bot - 環境設定
 * 環境変数の読み込みと、デフォルト値の設定
 */

const dotenv = require('dotenv');
dotenv.config();

// 文脈介入設定
const INTERVENTION_MODE = process.env.INTERVENTION_MODE || 'balanced';
const INTERVENTION_KEYWORDS = (process.env.INTERVENTION_KEYWORDS || 'ボッチー,Bocchy,ボット,Bot').split(',');
const INTERVENTION_COOLDOWN = parseInt(process.env.INTERVENTION_COOLDOWN || '60', 10);

// AIプロバイダー設定
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const DM_MESSAGE_HANDLER = process.env.DM_MESSAGE_HANDLER || 'legacy';

// メモリシステム設定
const MEMORY_ENABLED = process.env.MEMORY_ENABLED === 'true';

// RAGシステム設定
const RAG_ENABLED = process.env.RAG_ENABLED === 'true';

// 日時表示設定 - DMと通常チャンネルの一貫性確保用
const SHOW_DATETIME = process.env.SHOW_DATETIME === 'true';

// Web検索API設定 - BRAVE_API_KEYに統一
// 環境変数から直接読み込み、APIキーが存在すればその値を使用
// APIキーは 'BSA' で始まる32文字程度の文字列
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || 
                      process.env.BRAVE_SEARCH_API_KEY || 
                      'BSAThZH8RcPF6tqem02e4zuVp1j9Yja'; // フォールバック値

// Web検索機能の有効/無効設定
// 明示的に'false'と設定された場合のみ無効に、それ以外はデフォルトで有効
const BRAVE_SEARCH_ENABLED = process.env.BRAVE_SEARCH_ENABLED === 'false' ? false : true;

// 後方互換性のため両方の変数を保持
const SEARCH_ENABLED = BRAVE_SEARCH_ENABLED;

// 設定のデバッグログ（デバッグモード時のみ）
if (process.env.DEBUG === 'true') {
  console.log(`[ENV] Web検索 API設定: BRAVE_API_KEY=${Boolean(BRAVE_API_KEY)}, BRAVE_SEARCH_ENABLED=${BRAVE_SEARCH_ENABLED}`);
}

// デバッグモード
const DEBUG = process.env.DEBUG === 'true';

// ボットバージョン
const BOT_VERSION = '1.3.5'; // Web検索機能の改善とフィーチャートグル実装

// スクリプト実行環境
const NODE_ENV = process.env.NODE_ENV || 'development';

// コマンドプレフィックス
const PREFIX = process.env.PREFIX || '!';

// エクスポート
module.exports = {
  // 文脈介入設定
  INTERVENTION_MODE,
  INTERVENTION_KEYWORDS,
  INTERVENTION_COOLDOWN,
  
  // AIプロバイダー設定
  AI_PROVIDER,
  DM_MESSAGE_HANDLER,
  
  // デバッグ設定
  DEBUG,
  
  // ボット情報
  BOT_VERSION,
  
  // 環境設定
  NODE_ENV,
  
  // コマンド設定
  PREFIX,
  
  // メモリシステム設定
  MEMORY_ENABLED,
  
  // RAGシステム設定
  RAG_ENABLED,
  
  // 検索API設定
  BRAVE_API_KEY,
  BRAVE_SEARCH_ENABLED,
  SEARCH_ENABLED,
  
  // 日時表示設定
  SHOW_DATETIME
};