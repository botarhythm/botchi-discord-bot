// Bocchy Discord Bot - メインファイル
const { Client, GatewayIntentBits, Events, ChannelType, Partials, EmbedBuilder } = require('discord.js');
const http = require('http');
const dotenv = require('dotenv');

// 環境変数の読み込み
dotenv.config();

// AI Providerの設定
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';

// プロバイダに応じてサービスを読み込む
let aiService;
if (AI_PROVIDER === 'openai') {
  aiService = require('./openai-service');
} else {
  // デフォルトはGemini
  aiService = require('./gemini-service');
}

// Debug mode
const DEBUG = process.env.DEBUG === 'true';

// バージョン情報
const BOT_VERSION = '1.2.0'; // コンテキスト管理機能を追加したためバージョンを上げる

// ボットトークンをログに出力（セキュリティのため一部を隠す）
if (DEBUG) {
  const token = process.env.DISCORD_TOKEN;
  if (token) {
    console.log(`Debug: Provided token: ${token.substring(0, 4)}...${token.substring(token.length - 4)}`);