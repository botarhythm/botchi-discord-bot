/**
 * Bocchy Discord Bot - Main Entry Point
 * モジュール化アーキテクチャ版
 */

// システム層のモジュールを読み込み
const logger = require('./system/logger');
const config = require('./system/config');
const monitor = require('./system/monitor');
const loader = require('./system/loader');

// コア層のモジュールを読み込み
const fallback = require('./core/fallback');

// 最初に設定を初期化
config.initialize();

// ロガーの設定
logger.initialize({
  level: process.env.DEBUG === 'true' ? logger.LOG_LEVELS.DEBUG :
         process.env.DEBUG === 'verbose' ? logger.LOG_LEVELS.VERBOSE : logger.LOG_LEVELS.INFO,
  includeSourceInfo: process.env.DEBUG === 'true' || process.env.DEBUG === 'verbose'
});

// 環境情報を表示
logger.info(`Bocchy Discord Bot v${config.get('bot.version')} starting up...`);
logger.info(`Node.js Version: ${process.version}`);
logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
logger.debug('Debug mode enabled');

// ローダーとモニターを初期化
loader.initialize();
monitor.initialize();
fallback.initialize();

// 実行関数
async function main() {
  try {
    // Discordアダプターをロード
    const discordAdapter = await loader.loadModule('platforms/discord', 'discord-adapter');
    
    if (!discordAdapter) {
      logger.error('Failed to load Discord adapter');
      process.exit(1);
    }
    
    // Discordアダプターを初期化
    await discordAdapter.initialize();
    
    logger.info('Bocchy Discord Bot is now running');
    
    // シャットダウンを注意深く処理
    setupGracefulShutdown(discordAdapter);
  } catch (error) {
    logger.error('Error during startup:', error);
    monitor.recordError(error, { stage: 'startup' });
    
    // エラー時は少し待機してから終了
    setTimeout(() => {
      logger.error('Shutting down due to startup error');
      process.exit(1);
    }, 1000);
  }
}

/**
 * 終了処理を設定
 * @param {Object} discordAdapter - Discordアダプター
 */
function setupGracefulShutdown(discordAdapter) {
  // SIGINTやSIGTERMを受け取る
  const signals = ['SIGINT', 'SIGTERM'];
  
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`${signal} received. Gracefully shutting down...`);
      
      try {
        // モニタリングを停止
        monitor.stopMetricsCollection();
        
        // Discordアダプターを停止
        await discordAdapter.shutdown();
        
        logger.info('Shutdown complete. Goodbye!');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    });
  }
  
  // 予期しないエラーを捕捉
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    monitor.recordError(error, { type: 'uncaughtException' });
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection:', reason);
    monitor.recordError(reason, { type: 'unhandledRejection' });
  });
}

// メイン関数を実行
main().catch(error => {
  logger.error('Fatal error in main function:', error);
  process.exit(1);
});