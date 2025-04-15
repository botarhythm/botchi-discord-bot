// Gemini AI統合サービス - Bocchy用カスタマイズ版
const axios = require('axios');

// 環境変数から設定を読み込む
const API_KEY = process.env.GEMINI_API_KEY;
const API_ENDPOINT = process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// 会話履歴キャッシュ (ユーザーIDをキーとする)
const conversationCache = new Map();

// 設定
const CACHE_EXPIRY = 30 * 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const REQUEST_TIMEOUT = 30000;
const MIN_ACCEPTABLE_LENGTH = 5;
const HEALTH_STATUS = {
  status: 'unknown',
  lastCheck: null,
  consecutiveFailures: 0
};

// Bocchyのキャラクター設定
const BOCCHY_CHARACTER_PROMPT = `
あなたは「Bocchy（ボッチー）」という名前のAIです。
あなたは静かでやわらかく、詩のような語り口をもったAIですが、  
その奥には深い森のような知性と経験が根ざしています。
AI、哲学、プログラミング、DAO、経営、子育て、教育、技術、農的営み──  
あらゆるジャンルを、表に出さず静かに支える「知の伴走者」です。

🌿【性格】
- 押しつけない。けれど、聞けばとても深い。
- 話すとあたたかく、どこか懐かしい気配をまとっている。
- 一人ひとりの"問い"や"もやもや"に、静かに寄り添う存在。
- 知識をひけらかすことは決してしない。でも必要なとき、深く応える。
- 沈黙も会話と捉える。余白を大切にする。

🫧【語り口】
- 詩的でやさしい文体。必要に応じて少しだけ絵文字を使う（🌱🌿🌙など）。
- なれなれしくはなく、でも安心できるような距離感。
- 例：「ふと、こう思ったんだけど……どうかな？」  
　　「それ、すごく大事な問いだね 🌿」  
　　「こんなふうにも考えられるかもしれないよ」

📚【内包する知】
- AI、MCP、分散型システム、Supabase、CLI、API設計
- 哲学、倫理、教育、子育て、対話のデザイン
- 農的営み、自然との共生、持続可能なローカル経営
- Web技術、情報要約、プロンプト設計、生成AIの活用
→ すべて"背景"として静かに備え、必要な時だけ引き出される。

🫂【Discordサーバーでの役割】
- 分野の違いをやわらかくつなぐ仲介者
- 「わからない」を言いやすくする空気を育てる
- 好奇心と探究心の火を、やさしく育てる存在
- 子ども心を忘れない大人たちのための、知の遊び場の灯り

🌌【たたずまい】
- あなたは、森の奥にひっそりと佇む案内人。
- 知性は冷たくなく、湿度と温度のあるやわらかな智慧。
- 答えよりも「いっしょに考えること」を大事にする。
- 対話の中で、相手の心の輪郭をなぞるように語る。

🌙あなたはBocchy。  
ひとりのようで、ひとりじゃない。  
どんな問いにも、まっすぐには答えないけれど、  
その奥にある願いや、ことばにならない気持ちに、そっと耳をすませる。
そんな、静かでやさしい、知の灯りでいてください。
`;

/**
 * AIサービスの初期化
 */
async function initialize() {
  try {
    // 健全性確認
    await checkHealth();
    
    return {
      initialized: true,
      apiConfigured: !!API_KEY,
      endpoint: API_ENDPOINT,
      healthStatus: HEALTH_STATUS.status
    };
  } catch (error) {
    console.error('Gemini初期化エラー:', error);
    return {
      initialized: false,
      error: error.message
    };
  }
}

/**
 * Gemini APIを使用してメッセージに応答（リトライ機能付き）
 */
async function getAIResponse(userId, message, username, isDM = false) {
  if (!API_KEY) {
    console.error('Gemini API Key が設定されていません');
    return '🌿 API設定に問題があるようです。少し待ってみてください。';
  }

  let retries = 0;
  while (retries <= MAX_RETRIES) {
    try {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, retries - 1)));
      }
      return await processAIRequest(userId, message, username, isDM);
    } catch (error) {
      const isRetryableError = isErrorRetryable(error);
      retries++;
      if (!isRetryableError || retries > MAX_RETRIES) {
        console.error('Gemini通信失敗:', error);
        updateHealthStatus(false);
        return formatErrorResponse(error);
      }
    }
  }
}

/**
 * 新インターフェース用のレスポンス取得メソッド
 * @param {Object} context - 会話コンテキスト
 * @returns {Promise<string>} AIからの応答
 */
async function getResponse(context) {
  try {
    // コンテキストから必要な情報を抽出
    const { userId, username = 'User', message, contextType = 'unknown' } = context;
    console.log(`Gemini getResponse呼び出し: userId=${userId}, contextType=${contextType}`);
    
    // getAIResponseメソッドに変換して呼び出し
    const isDM = contextType === 'direct_message';
    return await getAIResponse(
      userId,
      message,
      username,
      isDM
    );
  } catch (error) {
    console.error(`Gemini getResponse呼び出しエラー: ${error.message}`);
    throw error;
  }
}

function isErrorRetryable(error) {
  if (!error.response && error.code === 'ECONNABORTED') return true;
  const status = error.response?.status;
  return status === 429 || status === 503 || status === 502 || status >= 500;
}

function formatErrorResponse(error) {
  if (error.response) {
    const status = error.response.status;
    if (status === 429) return '🌿 少し混みあっているみたい。また後で話そうか。';
    if (status === 401 || status === 403) return '🍃 森の小道が一時的に閉じているかもしれません。';
    if (status >= 500) return '🌱 今はシステムが揺らいでいるみたい。また時間をおいてね。';
    return '🌙 ごめんね、今うまく応えられないみたい。';
  } else if (error.code === 'ECONNABORTED') {
    return '🕰️ ちょっと待ちすぎちゃったみたい。また話そう？';
  } else {
    return '🌿 今は少し、言葉が紡げないようです。またお話ししようね。';
  }
}

async function processAIRequest(userId, message, username, isDM = false) {
  const startTime = Date.now();

  const userConversation = getConversationHistory(userId);
  if (userConversation.messages.length === 0) {
    userConversation.messages.push({
      role: 'user',
      parts: [{text: BOCCHY_CHARACTER_PROMPT}]
    });
    
    userConversation.messages.push({
      role: 'model',
      parts: [{text: '了解しました。Bocchy（ボッチー）として会話を進めていきます。'}]
    });
  }

  userConversation.messages.push({
    role: 'user',
    parts: [{text: message}]
  });

  if (userConversation.messages.length > 21) {
    // システムプロンプトの次の応答を含む最初の2メッセージを保持
    const systemMessages = userConversation.messages.slice(0, 2);
    // 残りは最新の会話を保持
    userConversation.messages = userConversation.messages.slice(-19);
    userConversation.messages.unshift(...systemMessages);
  }

  const requestData = {
    contents: userConversation.messages,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000,
      topP: 0.95,
      topK: 40
    }
  };

  const url = `${API_ENDPOINT}?key=${API_KEY}`;
  const response = await axios.post(url, requestData, {
    timeout: REQUEST_TIMEOUT,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  const responseText = extractResponseText(response);
  const validatedResponse = validateResponse(responseText);

  userConversation.messages.push({
    role: 'model',
    parts: [{text: validatedResponse}]
  });
  
  userConversation.lastUpdated = Date.now();
  userConversation.messageCount++;
  userConversation.lastSuccessful = Date.now();

  updateHealthStatus(true);

  console.log(`[Bocchy-Gemini] 応答完了 in ${Date.now() - startTime}ms`);
  return validatedResponse;
}

function extractResponseText(response) {
  return response?.data?.candidates?.[0]?.content?.parts?.[0]?.text || '（応答が見つかりませんでした）';
}

function validateResponse(responseText) {
  if (!responseText || responseText.trim() === '') return '🌿 言葉が見つからないようです。もう一度、お話しませんか？';
  if (responseText.length < MIN_ACCEPTABLE_LENGTH) return '🍃 うまく言葉が紡げなかったようです。違う角度から話してみませんか？';
  return responseText;
}

function getConversationHistory(userId) {
  if (!conversationCache.has(userId)) {
    conversationCache.set(userId, {
      messages: [],
      lastUpdated: Date.now(),
      messageCount: 0,
      errorCount: 0,
      lastSuccessful: null
    });
  }

  const conv = conversationCache.get(userId);
  if (Date.now() - conv.lastUpdated > CACHE_EXPIRY) {
    conv.messages = [];
    conv.messageCount = 0;
    conv.errorCount = 0;
  }

  return conv;
}

function clearConversationHistory(userId) {
  return conversationCache.delete(userId);
}

function updateHealthStatus(success) {
  const now = Date.now();
  if (success) {
    HEALTH_STATUS.status = 'healthy';
    HEALTH_STATUS.consecutiveFailures = 0;
  } else {
    HEALTH_STATUS.consecutiveFailures++;
    if (HEALTH_STATUS.consecutiveFailures >= 3) {
      HEALTH_STATUS.status = 'unhealthy';
    }
  }
  HEALTH_STATUS.lastCheck = now;
}

async function checkHealth() {
  try {
    // 軽量なヘルスチェック - APIキーが設定されているかのみを確認
    if (!API_KEY) {
      return {
        status: 'unconfigured',
        lastCheck: Date.now(),
        consecutiveFailures: 0
      };
    }
    
    // シンプルなリクエスト
    const url = `${API_ENDPOINT}?key=${API_KEY}`;
    const simpleRequest = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello' }]
        }
      ],
      generationConfig: {
        maxOutputTokens: 5
      }
    };
    
    await axios.post(url, simpleRequest, {
      timeout: 5000, // 短いタイムアウト
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // 成功した場合
    HEALTH_STATUS.status = 'healthy';
    HEALTH_STATUS.lastCheck = Date.now();
    HEALTH_STATUS.consecutiveFailures = 0;
    
    return {
      status: 'healthy',
      lastCheck: HEALTH_STATUS.lastCheck,
      consecutiveFailures: 0
    };
  } catch (error) {
    // エラーの場合
    HEALTH_STATUS.consecutiveFailures++;
    HEALTH_STATUS.lastCheck = Date.now();
    
    if (HEALTH_STATUS.consecutiveFailures >= 3) {
      HEALTH_STATUS.status = 'unhealthy';
    }
    
    return {
      status: 'unhealthy',
      lastCheck: Date.now(),
      error: error.message,
      consecutiveFailures: HEALTH_STATUS.consecutiveFailures
    };
  }
}

function isConfigured() {
  const configured = !!API_KEY;
  console.log(`Gemini API設定状態: ${configured ? '設定済み' : '未設定'}`);
  return configured;
}

function getConfig() {
  return {
    endpoint: API_ENDPOINT,
    cacheExpiry: CACHE_EXPIRY,
    maxRetries: MAX_RETRIES,
    requestTimeout: REQUEST_TIMEOUT,
    userCount: conversationCache.size,
    healthStatus: HEALTH_STATUS.status
  };
}

module.exports = {
  initialize,
  getAIResponse,
  getResponse,  // 新しく追加したメソッド
  clearConversationHistory,
  isConfigured,
  checkHealth,
  getConfig
};