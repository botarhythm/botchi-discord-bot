/**
 * Bocchy Discord Bot - ヘルスチェックサーバー
 * Railwayでのヘルスチェックやボットのステータス確認用のシンプルなWebサーバー
 */

const http = require('http');
const logger = require('../system/logger');
const config = require('../config/env');

// ヘルスチェックサーバーのポート
const PORT = process.env.PORT || 3000;

/**
 * シンプルなHTTPサーバーを作成
 */
function createServer() {
  const server = http.createServer((req, res) => {
    // リクエストパスに基づいて処理を分岐
    if (req.url === '/health' || req.url === '/') {
      handleHealthCheck(req, res);
    } else if (req.url === '/status') {
      handleStatusCheck(req, res);
    } else {
      // 404 Not Found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'Not Found' }));
    }
  });
  
  // サーバーを指定ポートで起動
  server.listen(PORT, () => {
    logger.info(`Health check server is running on port ${PORT}`);
  });
  
  // エラーハンドリング
  server.on('error', (error) => {
    logger.error('Health check server error:', error);
  });
  
  return server;
}

/**
 * ヘルスチェックエンドポイントのハンドラー
 * @param {Object} req - HTTPリクエストオブジェクト
 * @param {Object} res - HTTPレスポンスオブジェクト
 */
function handleHealthCheck(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    version: config.BOT_VERSION,
    timestamp: new Date().toISOString()
  }));
}

/**
 * ステータスチェックエンドポイントのハンドラー
 * @param {Object} req - HTTPリクエストオブジェクト
 * @param {Object} res - HTTPレスポンスオブジェクト
 */
function handleStatusCheck(req, res) {
  // AIサービスを取得
  let aiService;
  if (config.DM_MESSAGE_HANDLER === 'new') {
    // 新プロバイダーシステム
    aiService = require('../extensions/providers');
  } else {
    // レガシーシステム
    aiService = config.AI_PROVIDER === 'openai' 
      ? require('../openai-service') 
      : require('../gemini-service');
  }
  
  // 詳細なステータス情報を取得（非同期）
  aiService.checkHealth()
    .then(healthStatus => {
      // レスポンスを送信
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        version: config.BOT_VERSION,
        aiProvider: config.AI_PROVIDER,
        aiStatus: healthStatus.status,
        messageHandler: config.DM_MESSAGE_HANDLER,
        interventionMode: config.INTERVENTION_MODE,
        interventionCooldown: config.INTERVENTION_COOLDOWN,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime())
      }));
    })
    .catch(error => {
      logger.error('Error checking health in status endpoint:', error);
      
      // エラー時のレスポンス
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'error',
        version: config.BOT_VERSION,
        error: 'Health check failed',
        aiProvider: config.AI_PROVIDER,
        messageHandler: config.DM_MESSAGE_HANDLER,
        timestamp: new Date().toISOString()
      }));
    });
}

module.exports = {
  createServer
};