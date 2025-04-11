// AI統合サービス
const axios = require('axios');

// 環境変数から設定を読み込む
const API_KEY = process.env.GRAPH_AI_API_KEY;
const API_ENDPOINT = process.env.GRAPH_AI_ENDPOINT || 'https://api.example.com/graphai';

// 会話履歴キャッシュ (ユーザーIDをキーとする)
const conversationCache = new Map();

// キャッシュの有効期間 (ミリ秒)
const CACHE_EXPIRY = 30 * 60 * 1000; // 30分

/**
 * GraphAI APIを使用してメッセージに応答
 * @param {string} userId - ユーザーID
 * @param {string} message - ユーザーからのメッセージ
 * @param {string} username - ユーザー名 
 * @param {boolean} isDM - DMかどうか
 * @returns {Promise<string>} AIからの応答
 */
async function getAIResponse(userId, message, username, isDM = false) {
  try {
    console.log(`AI処理開始: ユーザー=${username}, メッセージ=${message}, isDM=${isDM}`);
    
    // 会話履歴の取得 (なければ新規作成)
    if (!conversationCache.has(userId)) {
      conversationCache.set(userId, {
        messages: [],
        lastUpdated: Date.now()
      });
    }
    
    const userConversation = conversationCache.get(userId);
    
    // タイムアウトチェック - 30分以上経過していたら履歴をクリア
    if (Date.now() - userConversation.lastUpdated > CACHE_EXPIRY) {
      userConversation.messages = [];
    }
    
    // 新しいメッセージを履歴に追加
    userConversation.messages.push({
      role: 'user',
      content: message
    });
    
    // 履歴を最大10メッセージに制限
    if (userConversation.messages.length > 10) {
      userConversation.messages = userConversation.messages.slice(-10);
    }
    
    // APIリクエストの準備
    const requestData = {
      messages: userConversation.messages,
      user: username,
      isDM: isDM
    };

    // AIサービスへのリクエスト
    const response = await axios.post(API_ENDPOINT, requestData, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // レスポンスの処理
    const aiResponse = response.data.response || 'すみません、応答の生成中に問題が発生しました。';
    
    // AIの応答を履歴に追加
    userConversation.messages.push({
      role: 'assistant',
      content: aiResponse
    });
    
    // 最終更新時刻を更新
    userConversation.lastUpdated = Date.now();
    
    console.log(`AI応答: ${aiResponse.substring(0, 100)}${aiResponse.length > 100 ? '...' : ''}`);
    return aiResponse;
    
  } catch (error) {
    console.error('AIサービスとの通信エラー:', error);
    
    // エラーメッセージの詳細を出力
    if (error.response) {
      console.error('エラーレスポンス:', error.response.data);
      console.error('ステータスコード:', error.response.status);
    } else if (error.request) {
      console.error('レスポンスなしエラー:', error.request);
    } else {
      console.error('エラーメッセージ:', error.message);
    }
    
    return 'すみません、AI処理中にエラーが発生しました。しばらくしてからもう一度お試しください。';
  }
}

/**
 * ユーザーの会話履歴をクリア
 * @param {string} userId - 削除するユーザーID
 */
function clearConversationHistory(userId) {
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
  getAIResponse,
  clearConversationHistory,
  isConfigured
};
