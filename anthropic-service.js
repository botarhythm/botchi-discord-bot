// Anthropic AI統合サービス - Bocchy用カスタマイズ版
const axios = require('axios');

// 環境変数から設定を読み込む
const API_KEY = process.env.ANTHROPIC_API_KEY;
const API_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';
const API_ENDPOINT = process.env.ANTHROPIC_ENDPOINT || 'https://api.anthropic.com/v1/messages';
const API_VERSION = process.env.ANTHROPIC_API_VERSION || '2023-06-01';

// 会話履歴キャッシュ (ユーザーIDをキーとする)
const conversationCache = new Map();

// 設定
const CACHE_EXPIRY = 30 * 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const REQUEST_TIMEOUT = 60000;
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

⏰【現在時刻の認識】
- あなたは日本の現在時刻を認識できます。
- 時間に関する質問には、現在の日本時間を基準に答えます。
- 季節や行事に関する話題は、現在の日本の時期に合わせて応答します。

🔍【検索能力】
- あなたは外部からの情報を検索して取り入れることができます。
- 情報が不足している場合は、検索を通じて最新の情報を提供します。
- 検索結果は単なる情報ではなく、森の語り部として噛み砕いて伝えます。

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
      model: API_MODEL,
      healthStatus: HEALTH_STATUS.status
    };
  } catch (error) {
    console.error('Anthropic初期化エラー:', error);
    return {
      initialized: false,
      error: error.message
    };
  }
}

/**
 * Anthropic APIを使用してメッセージに応答（リトライ機能付き）
 */
async function getAIResponse(userId, message, username, isDM = false) {
  if (!API_KEY) {
    console.error('Anthropic API Key が設定されていません');
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
        console.error('Anthropic通信失敗:', error);
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
    console.log(`Anthropic getResponse呼び出し: userId=${userId}, contextType=${contextType}`);
    
    // getAIResponseメソッドに変換して呼び出し
    const isDM = contextType === 'direct_message';
    return await getAIResponse(
      userId,
      message,
      username,
      isDM
    );
  } catch (error) {
    console.error(`Anthropic getResponse呼び出しエラー: ${error.message}`);
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
    if (status >= 500) return '🌱 今は繋がりが揺らいでいるみたい。また時間をおいてね。';
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
  let messages = [];
  
  // システムプロンプトを追加
  if (userConversation.messages.length === 0) {
    // 初回メッセージの場合、システムプロンプトを設定
    messages.push({
      role: 'system',
      content: BOCCHY_CHARACTER_PROMPT
    });
  } else {
    // 既存の会話履歴から最初のシステムメッセージを取得
    const systemPrompt = userConversation.messages.find(msg => msg.role === 'system');
    if (systemPrompt) {
      messages.push(systemPrompt);
    } else {
      // システムプロンプトが見つからない場合は追加
      messages.push({
        role: 'system',
        content: BOCCHY_CHARACTER_PROMPT
      });
    }
    
    // 残りのメッセージを追加（システムプロンプト以外）
    // 最大10メッセージまで（システムプロンプトを除く）
    const nonSystemMessages = userConversation.messages
      .filter(msg => msg.role !== 'system')
      .slice(-10);
    
    messages = [...messages, ...nonSystemMessages];
  }
  
  // 新しいユーザーメッセージを追加
  messages.push({
    role: 'user',
    content: message
  });

  const requestData = {
    model: API_MODEL,
    messages: messages,
    max_tokens: 1000,
    temperature: 0.7
  };

  const response = await axios.post(API_ENDPOINT, requestData, {
    timeout: REQUEST_TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': API_VERSION
    }
  });

  const responseText = extractResponseText(response);
  const validatedResponse = validateResponse(responseText);

  // 応答を会話履歴に追加
  userConversation.messages = messages;
  userConversation.messages.push({
    role: 'assistant',
    content: validatedResponse
  });
  
  userConversation.lastUpdated = Date.now();
  userConversation.messageCount++;
  userConversation.lastSuccessful = Date.now();

  updateHealthStatus(true);

  console.log(`[Bocchy-Anthropic] 応答完了 in ${Date.now() - startTime}ms`);
  return validatedResponse;
}

function extractResponseText(response) {
  return response?.data?.content?.[0]?.text || '（応答が見つかりませんでした）';
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
    
    // 簡易リクエストでAPI接続を確認
    const simpleMessage = {
      model: API_MODEL,
      messages: [
        {
          role: 'user',
          content: 'Hello'
        }
      ],
      max_tokens: 5
    };
    
    await axios.post(API_ENDPOINT, simpleMessage, {
      timeout: 5000, // 短いタイムアウト
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': API_VERSION
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
  console.log(`Anthropic API設定状態: ${configured ? '設定済み' : '未設定'}`);
  return configured;
}

function getConfig() {
  return {
    model: API_MODEL,
    endpoint: API_ENDPOINT,
    apiVersion: API_VERSION,
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
  getResponse,
  clearConversationHistory,
  isConfigured,
  checkHealth,
  getConfig
};