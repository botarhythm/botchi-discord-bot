/**
 * Bocchy Discord Bot - Discord Client Initialization
 * 
 * このモジュールはDiscord.jsクライアントの初期化と設定を担当します。
 * イベントリスナーの設定やクライアントの基本設定を行います。
 */

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const logger = require('../system/logger');
const config = require('../config/env');

// Discord.jsクライアントインスタンス
let client = null;

/**
 * Discordクライアントをセットアップ
 * @returns {Client} 設定済みのDiscordクライアント
 */
function setupClient() {
  if (client) return client;

  logger.info('Setting up Discord client...');
  
  // 必要なインテントを設定
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessageReactions
  ];
  
  // パーシャルを設定（DMなどの部分的なオブジェクトの受信に必要）
  const partials = [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction
  ];
  
  // クライアントを作成
  client = new Client({ 
    intents, 
    partials,
    allowedMentions: { parse: ['users', 'roles'], repliedUser: true }
  });
  
  // 基本的なイベントリスナーの設定
  setupEventListeners();
  
  return client;
}

/**
 * 基本的なDiscordイベントリスナーの設定
 */
function setupEventListeners() {
  // Ready イベント
  client.on('ready', () => {
    logger.info(`Bot logged in as ${client.user.tag}`);
    
    // アクティビティを設定
    client.user.setActivity(config.BOT_ACTIVITY || 'AIチャット', { type: 'LISTENING' });
    
    // ログイン成功メッセージをログに出力
    logger.info(`Connected to ${client.guilds.cache.size} servers, serving ${getTotalUsers()} users`);
  });
  
  // エラーイベント
  client.on('error', (error) => {
    logger.error(`Discord client error: ${error.message}`);
  });
  
  // 警告イベント
  client.on('warn', (warning) => {
    logger.warn(`Discord client warning: ${warning}`);
  });
  
  // 切断イベント
  client.on('disconnect', () => {
    logger.warn('Discord client disconnected');
  });
  
  // 再接続イベント
  client.on('reconnecting', () => {
    logger.info('Discord client reconnecting...');
  });
}

/**
 * 総ユーザー数を取得
 * @returns {number} ボットがアクセス可能なユーザー総数
 */
function getTotalUsers() {
  let totalUsers = 0;
  client.guilds.cache.forEach(guild => {
    totalUsers += guild.memberCount;
  });
  return totalUsers;
}

/**
 * Discordクライアントのログイン
 * @returns {Promise<void>} ログイン完了時に解決するPromise
 */
async function loginClient() {
  try {
    if (!client) setupClient();
    
    // Discordトークンが設定されているか確認
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      throw new Error('DISCORD_TOKEN environment variable not set');
    }
    
    logger.info('Logging in to Discord...');
    await client.login(token);
    return true;
  } catch (error) {
    logger.error(`Bot login failed: ${error}`);
    throw error;
  }
}

// モジュールをエクスポート
module.exports = {
  setupClient,
  loginClient,
  getClient: () => client
};