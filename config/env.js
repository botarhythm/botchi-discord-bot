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

// Web検索API設定 - BRAVE_API_KEY を推奨
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY;
const SEARCH_ENABLED = !!BRAVE_API_KEY;

// デバッグモード
const DEBUG = process.env.DEBUG === 'true';

// ボットバージョン
const BOT_VERSION = '1.3.2'; // メモリシステムの統合と強化

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
  SEARCH_ENABLED
};