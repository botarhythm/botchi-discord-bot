/**
 * Bocchy Discord Bot - メインエントリーポイント
 * 
 * このファイルは以下の処理を行います：
 * 1. 環境変数の読み込み
 * 2. ヘルスチェックサーバーの起動
 * 3. Discordクライアントのセットアップと起動
 * 4. 文脈介入機能とメッセージハンドリングの統合
 */

// 環境変数の設定を読み込み
require('dotenv').config();

// 統合パス解決モジュールをインポート
const syncUtil = require('./local-sync-utility');

// ロガーを初期化
const logger = syncUtil.safeRequire('./system/logger', syncUtil.createSimpleLogger());

// 設定を読み込み
const config = syncUtil.safeRequire('./config/env', {
  INTERVENTION_MODE: process.env.INTERVENTION_MODE || 'balanced',
  INTERVENTION_KEYWORDS: (process.env.INTERVENTION_KEYWORDS || 'ボッチー,Bocchy,ボット,Bot').split(','),
  INTERVENTION_COOLDOWN: parseInt(process.env.INTERVENTION_COOLDOWN || '60', 10),
  AI_PROVIDER: process.env.AI_PROVIDER || 'openai',
  DM_MESSAGE_HANDLER: process.env.DM_MESSAGE_HANDLER || 'legacy',
  DEBUG: process.env.DEBUG === 'true',
  BOT_VERSION: '1.3.1' // DMバグ修正版
});

// Bocchyのバージョン情報を表示
logger.info(`Bocchy Discord Bot v${config.BOT_VERSION} starting...`);
logger.info(`Node.js Version: ${process.version}`);
logger.info(`Discord.js Version: ${require('discord.js').version}`);
logger.info(`Context intervention mode: ${config.INTERVENTION_MODE || 'balanced'}`);
logger.info(`Running environment: ${syncUtil.isRailwayEnvironment ? 'Railway' : 'Local'}`);
logger.info(`Application root: ${syncUtil.appRoot}`);

// ヘルスチェックサーバーを起動
try {
  const { createServer } = syncUtil.safeRequire('./server/health-server', { createServer: () => logger.warn('Health server module not found, skipping') });
  createServer();
  logger.info('Health check server started');
} catch (error) {
  logger.warn('Failed to start health check server:', error);
}

// メッセージ履歴システムの初期化
logger.info('Initializing message history system...');
const messageHistory = syncUtil.safeRequire('./extensions/message-history', {
  initialize: () => Promise.resolve({ status: 'fallback' }),
  addMessageToHistory: () => {},
  getRecentMessages: () => [],
  getLastBotMessageTime: () => 0,
  updateLastBotMessageTime: () => {}
});

if (typeof messageHistory.initialize === 'function') {
  messageHistory.initialize()
    .then(() => logger.info('Message history system initialized successfully'))
    .catch(err => logger.error('Failed to initialize message history system:', err));
} else {
  logger.warn('Message history system has no initialize method, using fallback');
}

// Discordクライアントをセットアップして起動
logger.info('Setting up Discord client...');
const { setupClient } = syncUtil.safeRequire('./core/discord-init', {
  setupClient: () => {
    logger.error('Critical error: Discord client setup module not found');
    process.exit(1); // ここだけは致命的なため終了
    return null;
  }
});
const client = setupClient();

// DMメッセージの監視用RAWイベントリスナー
// 必ずDEBUG=trueの場合のみ有効にする（本番環境には影響させない）
if (config.DEBUG) {
  logger.info('DM検出のためのRAWイベントリスナーを有効化');
  
  // RAWイベントによるDM監視
  client.on('raw', packet => {
    if (packet.t === 'MESSAGE_CREATE' && packet.d && packet.d.channel_type === 1) {
      logger.debug('DM RAW MESSAGE DETECTED:');
      logger.debug(`- Content: ${packet.d.content || '[空]'}`);
      logger.debug(`- Author: ${packet.d.author?.username || '不明'} (${packet.d.author?.id || '不明'})`);
      logger.debug(`- Channel ID: ${packet.d.channel_id}`);
      
      // DMメッセージの場合の追加処理
      // 他のイベントでメッセージが処理されなかった場合の保険
      if (packet.d.author?.id !== client.user.id) { // 自分自身のメッセージは除外
        try {
          const { handleMessage } = syncUtil.safeRequire('./handlers/message-handler');
          // ここでは何もしない（ログ出力のみ）
        } catch (error) {
          logger.error('DM処理中のエラー:', error);
        }
      }
    }
  });
  
  logger.info('DMモニタリングの強化を有効化しました');
}

// 未処理の例外ハンドラ
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

// 未処理のPromise拒否ハンドラ
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});