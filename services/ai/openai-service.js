// OpenAI統合サービス - Bocchy用カスタマイズ版
const axios = require('axios');
const contextManager = require('../../context-manager');
const dateHandler = require('../../extensions/date-handler');

// 環境変数から設定を読み込む
const API_KEY = process.env.OPENAI_API_KEY;
const API_MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
const API_ENDPOINT = process.env.OPENAI_ENDPOINT || 'https://api.openai.com/v1/chat/completions';

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

// コンテキストマネージャーの状態
let contextManagerInitialized = false;

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
 * APIヘッダーを生成する
 * @returns {Object} APIリクエスト用ヘッダー
 */
function getApiHeaders() {
  // APIキーを確認
  if (!API_KEY || typeof API_KEY !== 'string' || API_KEY.trim() === '') {
    throw new Error('API key is not configured properly');
  }
  
  // ヘッダーを作成
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY.trim()}`
  };
}

/**
 * AIサービスの初期化
 * 追加されたinitialize関数：コンテキストマネージャーとの連携を初期化
 */
async function initialize() {
  try {
    // API設定状態を確認（より厳密なチェック）
    const isApiConfigured = !!(API_KEY && typeof API_KEY === 'string' && API_KEY.trim() !== '');
    
    // API設定状態のログ出力
    console.log('OpenAI API設定状態:', isApiConfigured ? '設定済み' : '未設定', 
                `(API_KEY: ${API_KEY ? '設定あり' : '未設定'}, 長さ: ${API_KEY?.length || 0})`);
    
    // コンテキストマネージャーを初期化
    if (!contextManagerInitialized) {
      try {
        // contextManagerが有効か確認
        if (contextManager && typeof contextManager.initialize === 'function') {
          const contextResult = await contextManager.initialize();
          contextManagerInitialized = true;
          console.log('コンテキストマネージャーを初期化しました:', contextResult);
        } else {
          console.warn('コンテキストマネージャーが利用できないか、不完全な状態です');
          contextManagerInitialized = false;
        }
      } catch (contextError) {
        // コンテキストマネージャーの初期化エラーはログに記録するが、サービス自体の初期化は継続
        console.warn('コンテキストマネージャーの初期化エラー:', contextError.message);
        contextManagerInitialized = false;
      }
    }
    
    // 健全性確認（エラー発生時もキャッチしてステータスを更新）
    try {
      await checkHealth();
    } catch (healthError) {
      console.warn('ヘルスチェックエラー:', healthError.message);
      // エラーが発生した場合は健全性ステータスを更新
      HEALTH_STATUS.status = isApiConfigured ? 'unhealthy' : 'unconfigured';
      HEALTH_STATUS.lastCheck = Date.now();
      HEALTH_STATUS.consecutiveFailures = (HEALTH_STATUS.consecutiveFailures || 0) + 1;
    }
    
    // API設定状態を明示的にHealthStatusに反映
    if (!isApiConfigured) {
      HEALTH_STATUS.status = 'unconfigured';
      HEALTH_STATUS.lastCheck = Date.now();
    }
    
    // 初期化成功とするが、API設定状態は正確に反映
    return {
      initialized: true, // サービス自体の初期化は常に成功とみなす
      apiConfigured: isApiConfigured,
      model: API_MODEL || 'undefined',
      healthStatus: HEALTH_STATUS?.status || 'unknown',
      contextManagerInitialized: !!contextManagerInitialized
    };
  } catch (error) {
    console.error('初期化エラー:', error);
    // 予期せぬエラーが発生した場合も健全性ステータスを更新
    HEALTH_STATUS.status = 'error';
    HEALTH_STATUS.lastCheck = Date.now();
    HEALTH_STATUS.consecutiveFailures = (HEALTH_STATUS.consecutiveFailures || 0) + 1;
    
    return {
      initialized: false,
      apiConfigured: false,
      error: error.message,
      healthStatus: 'error'
    };
  }
}

/**
 * OpenAI APIを使用してメッセージに応答（リトライ機能付き）
 * @param {string} userId - ユーザーID
 * @param {string} message - ユーザーメッセージ
 * @param {string} username - ユーザー名
 * @param {boolean} isDM - DMかどうか
 * @param {string} additionalContext - 追加のコンテキスト
 * @returns {Promise<string>} AIからの応答
 */
async function getAIResponse(userId, message, username, isDM = false, additionalContext = null) {
  // API設定状態を確認
  const isApiConfigured = !!(API_KEY && API_KEY !== '');
  
  if (!isApiConfigured) {
    console.error('OpenAI API Key が設定されていません');
    return '🌿 API設定に問題があるようです。少し待ってみてください。';
  }

  // 入力パラメータの検証
  if (!userId || !message) {
    console.warn('必須パラメータが不足しています: ' + 
      (!userId ? 'userId ' : '') + 
      (!message ? 'message ' : '')
    );
    return '🍃 会話を続けるための情報が足りないようです。もう一度話しかけてみてください。';
  }

  let retries = 0;
  while (retries <= MAX_RETRIES) {
    try {
      if (retries > 0) {
        // 指数バックオフでリトライ
        const delay = RETRY_DELAY * Math.pow(2, retries - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      return await processAIRequest(userId, message, username, isDM, additionalContext);
    } catch (error) {
      const isRetryableError = isErrorRetryable(error);
      retries++;
      if (!isRetryableError || retries > MAX_RETRIES) {
        console.error('AI通信失敗:', error);
        updateHealthStatus(false);
        return formatErrorResponse(error);
      }
    }
  }
  
  // 通常はここに到達しないが、念のため
  return '🌿 応答の取得に問題が発生しました。しばらく時間をおいてみてください。';
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

async function processAIRequest(userId, message, username, isDM = false, additionalContext = null) {
  const startTime = Date.now();

  const userConversation = getConversationHistory(userId);
  if (userConversation.messages.length === 0) {
    userConversation.messages.push({ role: 'system', content: BOCCHY_CHARACTER_PROMPT });
  }

  // 追加: additionalContextがあればsystem roleで挿入
  if (additionalContext) {
    // userロールで挿入することでAIが無視しにくくする
    userConversation.messages.push({ role: 'user', content: additionalContext });
  }

  // 日本時間の情報を取得
  const japanTime = dateHandler.getCurrentJapanTime();
  const formattedDate = dateHandler.getFormattedDateString(japanTime);
  const formattedTime = dateHandler.getFormattedTimeString(japanTime);
  
  // ユーザーメッセージに日時情報を追加
  const enhancedMessage = `[現在の日本時間: ${formattedDate} ${formattedTime}]\n\n${message}`;
  userConversation.messages.push({ role: 'user', content: enhancedMessage });

  if (userConversation.messages.length > 11) {
    const systemPrompt = userConversation.messages[0];
    userConversation.messages = userConversation.messages.slice(-10);
    userConversation.messages.unshift(systemPrompt);
  }

  const requestData = {
    model: API_MODEL,
    messages: userConversation.messages,
    temperature: 0.8,
    max_tokens: 1000,
    top_p: 0.95
  };

  const url = API_ENDPOINT;
  const response = await axios.post(url, requestData, {
    timeout: REQUEST_TIMEOUT,
    headers: getApiHeaders()
  });

  const responseText = extractResponseText(response);
  const validatedResponse = validateResponse(responseText, message);

  userConversation.messages.push({ role: 'assistant', content: validatedResponse });
  userConversation.lastUpdated = Date.now();
  userConversation.messageCount++;
  userConversation.lastSuccessful = Date.now();

  updateHealthStatus(true);

  console.log(`[Bocchy] 応答完了 in ${Date.now() - startTime}ms`);
  return validatedResponse;
}

function extractResponseText(response) {
  return response?.data?.choices?.[0]?.message?.content || '（応答が見つかりませんでした）';
}

function validateResponse(responseText, userMessage = '') {
  if (!responseText || responseText.trim() === '') return '🌿 言葉が見つからないようです。もう一度、お話しませんか？';
  if (responseText.length < MIN_ACCEPTABLE_LENGTH) return '🍃 うまく言葉が紡げなかったようです。違う角度から話してみませんか？';
  
  // 日付・時間に関する質問への対応
  const dateTimeQuestion = isDateTimeQuestion(userMessage);
  if (dateTimeQuestion) {
    return fixDateTimeInResponse(responseText);
  }
  
  return responseText;
}

/**
 * ユーザーメッセージが日付や時間に関する質問かどうかを判定
 * @param {string} message ユーザーメッセージ
 * @returns {boolean} 日付・時間の質問であればtrue
 */
function isDateTimeQuestion(message) {
  if (!message) return false;
  
  // 日付・時間に関する質問パターン
  const dateTimePatterns = [
    /今日は何日/i,
    /今日の日付/i,
    /今日は.+(日|月|年)/i,
    /今何時/i,
    /現在.+時刻/i,
    /何月何日/i,
    /日付.*教えて/i,
    /今日.*何曜日/i,
    /今日|本日/i,
    /現在|今の時間/i
  ];

  // ニュースに関連する質問パターン（こちらも日付情報が重要）
  const newsPatterns = [
    /今日のニュース/i,
    /最新ニュース/i,
    /最近のニュース/i,
    /今日の出来事/i,
    /今日起きた/i,
    /今朝のニュース/i,
    /今日の天気/i
  ];
  
  return dateTimePatterns.some(pattern => pattern.test(message)) || 
         newsPatterns.some(pattern => pattern.test(message));
}

/**
 * 応答テキストに正確な日付情報を含める
 * @param {string} responseText 元の応答テキスト
 * @returns {string} 日付情報を含めた応答テキスト
 */
function fixDateTimeInResponse(responseText) {
  // 現在の日本時間を取得
  const now = new Date();
  const japanTime = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).format(now);
  
  // 日付の間違いを検出するパターン
  const wrongDatePattern = /(\d{4})年(\d{1,2})月(\d{1,2})日/;
  const hasWrongDate = wrongDatePattern.test(responseText);
  
  // 間違った日付を検出した場合は修正
  if (hasWrongDate) {
    // 間違った日付を正しい日付に置き換え
    return responseText.replace(wrongDatePattern, `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`);
  }
  
  // 日付を含まない場合は先頭に追加
  if (!responseText.includes('年') || !responseText.includes('月') || !responseText.includes('日')) {
    return `今日は${japanTime}です🌿\n\n${responseText}`;
  }
  
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
    // まず、API設定状態を再確認（より厳密なチェック）
    const isApiConfigured = !!(API_KEY && typeof API_KEY === 'string' && API_KEY.trim() !== '');
    const now = Date.now();
    
    // APIキーが設定されていない場合は未設定ステータスを返す
    if (!isApiConfigured) {
      // グローバル健全性ステータスを確実に更新
      if (HEALTH_STATUS) {
        HEALTH_STATUS.status = 'unconfigured';
        HEALTH_STATUS.lastCheck = now;
        HEALTH_STATUS.consecutiveFailures = 0; // 設定されていないので失敗とは見なさない
      }
      
      // API設定状態の詳細をログ出力
      console.log('API健全性確認: API未設定', 
                `(API_KEY: ${API_KEY ? '存在するが無効' : '未設定'}, 長さ: ${API_KEY?.length || 0})`);
      
      return {
        status: 'unconfigured',
        lastCheck: now,
        apiConfigured: false,
        consecutiveFailures: 0,
        message: 'API key is not configured or empty'
      };
    }
    
    try {
      // AI APIへの簡易接続テスト
      const url = API_ENDPOINT || 'https://api.openai.com/v1/chat/completions'; // デフォルト値の保証
      const model = API_MODEL || 'gpt-3.5-turbo'; // デフォルトモデルの保証
      
      // テスト用リクエストデータ
      const requestData = {
        model: model,
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 5,
        temperature: 0.7
      };
      
      // 接続テスト開始ログ
      console.log(`API健全性確認: 接続テスト開始 (URL: ${url}, モデル: ${model})`);
      
      // POSTリクエスト実行
      await axios.post(url, requestData, {
        timeout: 5000, // 短めのタイムアウト
        headers: getApiHeaders()
      });
      
      // 成功した場合
      if (HEALTH_STATUS) {
        HEALTH_STATUS.status = 'healthy';
        HEALTH_STATUS.lastCheck = now;
        HEALTH_STATUS.consecutiveFailures = 0;
      }
      
      console.log('API健全性確認: 接続テスト成功');
      
      return {
        status: 'healthy',
        lastCheck: now,
        apiConfigured: true,
        consecutiveFailures: 0,
        message: 'API is responding correctly'
      };
    } catch (apiError) {
      // API呼び出しエラーの場合
      const errorStatus = apiError.response?.status;
      const errorMessage = apiError.message || 'Unknown API error';
      
      // グローバル健全性ステータスを更新
      if (HEALTH_STATUS) {
        HEALTH_STATUS.consecutiveFailures = (HEALTH_STATUS.consecutiveFailures || 0) + 1;
        HEALTH_STATUS.lastCheck = now;
        
        if (HEALTH_STATUS.consecutiveFailures >= 3) {
          HEALTH_STATUS.status = 'unhealthy';
        }
      }
      
      // エラー状態ログ出力
      console.warn(`API健全性確認: 接続テスト失敗 (ステータス: ${errorStatus || 'なし'}, エラー: ${errorMessage})`);
      
      return {
        status: 'unhealthy',
        lastCheck: now,
        apiConfigured: true, // APIキーは設定されているが通信に失敗
        error: errorMessage,
        statusCode: errorStatus,
        consecutiveFailures: HEALTH_STATUS?.consecutiveFailures || 1,
        message: `API connection failed: ${errorMessage}`
      };
    }
  } catch (error) {
    // 予期せぬエラーの場合
    const now = Date.now();
    const errorMessage = error.message || 'Unknown error during health check';
    
    // グローバル健全性ステータスを更新
    if (HEALTH_STATUS) {
      HEALTH_STATUS.status = 'error';
      HEALTH_STATUS.lastCheck = now;
      HEALTH_STATUS.consecutiveFailures = (HEALTH_STATUS.consecutiveFailures || 0) + 1;
    }
    
    console.error(`API健全性確認: 予期せぬエラー: ${errorMessage}`);
    
    return {
      status: 'error',
      lastCheck: now,
      error: errorMessage,
      consecutiveFailures: HEALTH_STATUS?.consecutiveFailures || 1,
      message: `Unexpected error during health check: ${errorMessage}`
    };
  }
}

function isConfigured() {
  const configured = !!(API_KEY && API_KEY !== '');
  console.log(`OpenAI API設定状態: ${configured ? '設定済み' : '未設定'}`);
  return configured;
}

// テスト用の会話キャッシュアクセサ（プライベートメンバーへのアクセス）
// このメソッドはテスト環境でのみ使用し、プロダクション環境では使用しない
function __getConversationCache() {
  return conversationCache;
}

/**
 * 新インターフェース用のレスポンス取得メソッド
 * @param {Object} context - 会話コンテキスト
 * @returns {Promise<string>} AIからの応答
 */
async function getResponse(context) {
  try {
    const { userId, username = 'User', message, contextType = 'unknown', additionalContext } = context;
    console.log(`OpenAI getResponse呼び出し: userId=${userId}, contextType=${contextType}`);
    
    // 日時関連の質問かチェック
    const isDateTimeRelated = isDateTimeQuestion(message);
    if (isDateTimeRelated) {
      console.log(`日付・時間関連の質問を検出: "${message}"`);
    }
    
    // getAIResponseメソッドに変換して呼び出し
    const isDM = contextType === 'direct_message';
    const response = await getAIResponse(
      userId,
      message,
      username,
      isDM,
      additionalContext
    );
    
    // 日時関連の質問に対しては、応答後も再確認
    if (isDateTimeRelated) {
      // 現在の日本時間を取得
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      
      // 応答に現在の年が含まれているかチェック
      if (!response.includes(String(year))) {
        console.log(`日付修正: 応答に現在の年(${year})が含まれていないため修正します`);
        // 現在の日本時間を取得して応答の先頭に追加
        const japanTime = new Intl.DateTimeFormat('ja-JP', {
          timeZone: 'Asia/Tokyo',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long'
        }).format(now);
        
        return `今日は${japanTime}です🌿\n\n${response}`;
      }
    }
    
    return response;
  } catch (error) {
    console.error(`OpenAI getResponse呼び出しエラー: ${error.message}`);
    throw error;
  }
}

/**
 * 現在の設定情報を取得
 * @returns {Object} 設定情報
 */
function getConfig() {
  // より堅牢なcontextManager参照チェック（デフォルト値を明示）
  let contextManagerConfig = { 
    useSupabase: false, 
    userCount: 0,
    initialized: contextManagerInitialized || false
  };
  
  try {
    // contextManagerの存在と型チェックを厳密に行う
    if (contextManager && 
        typeof contextManager === 'object' && 
        typeof contextManager.getConfig === 'function') {
      
      // getConfigの実行を試み、存在しない場合のフォールバック処理
      try {
        const config = contextManager.getConfig();
        if (config && typeof config === 'object') {
          contextManagerConfig = {
            ...contextManagerConfig,
            useSupabase: Boolean(config.useSupabase),
            userCount: typeof config.userCount === 'number' ? config.userCount : 0
          };
        }
      } catch (configError) {
        console.warn('コンテキストマネージャーのgetConfig実行中にエラー:', configError.message);
        // エラー発生時のフォールバック設定をより明示的に
        contextManagerConfig = {
          useSupabase: false,
          userCount: 0,
          initialized: contextManagerInitialized || false,
          error: configError.message
        };
      }
    }
  } catch (error) {
    console.warn('コンテキストマネージャー設定の取得に失敗:', error.message);
    // エラー発生時のフォールバック設定をより明示的に
    contextManagerConfig = {
      useSupabase: false,
      userCount: 0,
      initialized: false,
      error: error.message
    };
  }
  
  // 未定義値の安全な処理
  const safeConversationCacheSize = conversationCache ? conversationCache.size || 0 : 0;
  const safeHealthStatus = HEALTH_STATUS ? HEALTH_STATUS.status || 'unknown' : 'unknown';
  
  return {
    model: API_MODEL || 'undefined', // 空文字列も許容しないようにする
    endpoint: API_ENDPOINT || 'undefined',
    userCount: safeConversationCacheSize,
    healthStatus: safeHealthStatus,
    contextManager: contextManagerConfig
  };
}

module.exports = {
  initialize,
  getAIResponse,
  getResponse,
  clearConversationHistory,
  isConfigured,
  checkHealth,
  getConfig,
  __getConversationCache
};