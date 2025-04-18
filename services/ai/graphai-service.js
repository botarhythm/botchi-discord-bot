// GraphAI統合サービス
const axios = require('axios');

// 環境変数から設定を読み込む
const API_KEY = process.env.GRAPHAI_API_KEY || process.env.GRAPH_AI_API_KEY;
const API_ENDPOINT = process.env.GRAPHAI_ENDPOINT || process.env.GRAPH_AI_ENDPOINT || 'https://api.example.com/graphai';

// 会話コンテキストキャッシュ (ユーザーIDをキーとする)
const conversationCache = new Map();

// キャッシュの有効期間 (ミリ秒)
const CACHE_EXPIRY = 30 * 60 * 1000; // 30分

/**
 * GraphAIを使用してメッセージを処理する
 * @param {string} userId - ユーザーID
 * @param {string} message - ユーザーからのメッセージ
 * @param {string} username - ユーザー名 
 * @param {boolean} isDM - DMかどうか
 * @returns {Promise<string>} GraphAIからの応答
 */
async function processMessage(userId, message, username, isDM = false) {
  try {
    console.log(`GraphAI処理開始: ユーザー=${username}, メッセージ=${message}, isDM=${isDM}`);
    
    // コンテキスト情報の取得または作成
    if (!conversationCache.has(userId)) {
      conversationCache.set(userId, {
        context: {},
        lastUpdated: Date.now()
      });
    }
    
    const userContext = conversationCache.get(userId);
    
    // タイムアウトチェック - 30分以上経過していたらコンテキストをリセット
    if (Date.now() - userContext.lastUpdated > CACHE_EXPIRY) {
      userContext.context = {};
    }
    
    // GraphAIリクエストの準備
    const requestData = {
      message,
      user: {
        id: userId,
        name: username
      },
      context: userContext.context,
      channel: isDM ? 'direct_message' : 'server_mention',
      timestamp: new Date().toISOString()
    };

    // GraphAI APIへのリクエスト
    const response = await axios.post(API_ENDPOINT, requestData, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // レスポンスの処理
    const result = response.data;
    
    // 更新されたコンテキストを保存（APIからコンテキストが返される場合）
    if (result.context) {
      userContext.context = result.context;
    }
    
    // 最終更新時刻を更新
    userContext.lastUpdated = Date.now();
    
    // テキスト応答を抽出 (GraphAIの応答形式に応じて調整)
    const textResponse = result.response || result.message || result.text || 'すみません、応答の生成中に問題が発生しました。';
    
    console.log(`GraphAI応答: ${textResponse.substring(0, 100)}${textResponse.length > 100 ? '...' : ''}`);
    return textResponse;
    
  } catch (error) {
    console.error('GraphAIサービスとの通信エラー:', error);
    
    // エラーメッセージの詳細を出力
    if (error.response) {
      console.error('エラーレスポンス:', error.response.data);
      console.error('ステータスコード:', error.response.status);
    } else if (error.request) {
      console.error('レスポンスなしエラー:', error.request);
    } else {
      console.error('エラーメッセージ:', error.message);
    }
    
    return 'すみません、GraphAI処理中にエラーが発生しました。しばらくしてからもう一度お試しください。';
  }
}

/**
 * ユーザーのコンテキストをクリア
 * @param {string} userId - 削除するユーザーID
 */
function clearUserContext(userId) {
  if (conversationCache.has(userId)) {
    conversationCache.delete(userId);
    return true;
  }
  return false;
}

// APIキーが設定されているかどうかの確認用関数
function isConfigured() {
  return !!API_KEY;
}

module.exports = {
  processMessage,
  clearUserContext,
  isConfigured
};
