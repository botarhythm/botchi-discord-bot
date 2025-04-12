// Gemini AI統合サービス - Bocchy用カスタマイズ版
const axios = require('axios');

// 環境変数から設定を読み込む
const API_KEY = process.env.GEMINI_API_KEY;
const API_ENDPOINT = process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

// 会話履歴キャッシュ (ユーザーIDをキーとする)
const conversationCache = new Map();

// 設定
const CACHE_EXPIRY = 30 * 60 * 1000; // 30分
const MAX_RETRIES = 3;               // 最大リトライ回数
const RETRY_DELAY = 1000;            // リトライ間隔の基本値（ミリ秒）
const REQUEST_TIMEOUT = 30000;       // リクエストタイムアウト（30秒）
const MIN_ACCEPTABLE_LENGTH = 5;     // 最小許容応答長
const HEALTH_STATUS = {              // APIの健全性状態
  status: 'unknown',
  lastCheck: null,
  consecutiveFailures: 0
};

// Bocchyのキャラクター設定（システムプロンプト）
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
 * Gemini APIを使用してメッセージに応答（リトライ機能付き）
 * @param {string} userId - ユーザーID
 * @param {string} message - ユーザーからのメッセージ
 * @param {string} username - ユーザー名
 * @param {boolean} isDM - DMかどうか
 * @returns {Promise<string>} AIからの応答
 */
async function getAIResponse(userId, message, username, isDM = false) {
  // APIキーチェック
  if (!API_KEY) {
    console.error('Gemini API Key が設定されていません');
    return '🌿 API設定に問題があるようです。少し待ってみてください。';
  }
  
  let retries = 0;
  while (retries <= MAX_RETRIES) {
    try {
      if (retries > 0) {
        console.log(`リトライ ${retries}/${MAX_RETRIES}`);
        // 指数バックオフ（リトライごとに待ち時間を増加）
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, retries - 1)));
      }
      
      return await processAIRequest(userId, message, username, isDM);
    } catch (error) {
      // リトライ可能なエラーかどうかを判断
      const isRetryableError = isErrorRetryable(error);
      retries++;
      
      if (isRetryableError && retries <= MAX_RETRIES) {
        console.warn(`リトライ可能なエラーが発生: ${error.message}. リトライ ${retries}/${MAX_RETRIES}`);
        continue;
      }
      
      // リトライ回数を超えたか、リトライできないエラーの場合
      console.error('AIサービスとの通信に失敗しました:', error);
      
      // 健全性ステータスを更新
      updateHealthStatus(false);
      
      return formatErrorResponse(error);
    }
  }
}

/**
 * エラーがリトライ可能かどうかを判断
 * @param {Error} error - 発生したエラー
 * @returns {boolean} リトライ可能な場合はtrue
 */
function isErrorRetryable(error) {
  // ネットワークエラー
  if (!error.response && error.code === 'ECONNABORTED') return true;
  
  // レートリミットやサーバーエラー
  if (error.response) {
    const status = error.response.status;
    return status === 429 || status === 503 || status === 502 || status >= 500;
  }
  
  return false;
}

/**
 * エラーメッセージをユーザーフレンドリーな形式に整形
 * @param {Error} error - 発生したエラー
 * @returns {string} フォーマットされたエラーメッセージ
 */
function formatErrorResponse(error) {
  if (error.response) {
    const status = error.response.status;
    
    // ステータスコード別のエラーメッセージ（Bocchyのキャラクターに合わせて柔らかく）
    if (status === 429) {
      return '🌿 今、少し混みあっているみたい。少し時間をおいて、またお話ししようか。';
    } else if (status === 401 || status === 403) {
      return '🍃 通信に問題が起きたようです。この森の小道が一時的に閉じているのかもしれません。';
    } else if (status >= 500) {
      return '🌱 向こう側との繋がりが、今ちょっと揺らいでいるみたい。また少し経ってから話しかけてくれるかな？';
    }
    
    return `🌙 ごめんね、今うまく応えられないみたい。また後で試してみてくれるかな。`;
  } else if (error.code === 'ECONNABORTED') {
    return '🕰️ 待ちすぎてしまったようです。もう一度、話しかけてくれませんか？';
  } else {
    return '🌿 今は少し、言葉を紡ぐのが難しいようです。また後でお話ししましょう。';
  }
}

/**
 * 実際のAIリクエスト処理
 * @param {string} userId - ユーザーID
 * @param {string} message - ユーザーからのメッセージ
 * @param {string} username - ユーザー名
 * @param {boolean} isDM - DMかどうか
 * @returns {Promise<string>} AIからの応答
 */
async function processAIRequest(userId, message, username, isDM = false) {
  const startTime = Date.now();
  console.log(`AI処理開始: ユーザー=${username}, メッセージ=${message}, isDM=${isDM}`);
  
  // 会話履歴の取得と管理
  const userConversation = getConversationHistory(userId);
  
  // 初回のみシステムプロンプト（キャラクター設定）を追加
  if (userConversation.messages.length === 0) {
    userConversation.messages.push({
      role: 'system',
      content: BOCCHY_CHARACTER_PROMPT
    });
  }
  
  // 新しいメッセージを履歴に追加
  userConversation.messages.push({
    role: 'user',
    content: message
  });
  
  // 履歴を最大10メッセージに制限（古いものを削除）- ただしシステムプロンプトは保持
  if (userConversation.messages.length > 11) { // システムプロンプト + 最大10メッセージ
    const systemPrompt = userConversation.messages[0]; // システムプロンプトを保存
    userConversation.messages = userConversation.messages.slice(-10); // 最新10メッセージを保持
    userConversation.messages.unshift(systemPrompt); // システムプロンプトを先頭に戻す
  }
  
  // GeminiのAPIリクエスト形式に変換
  const contents = userConversation.messages.map(msg => {
    if (msg.role === 'system') {
      return {
        role: 'user',
        parts: [{ text: msg.content }]
      };
    } else {
      return {
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      };
    }
  });
  
  // APIリクエストの準備（キャラクターに合わせて調整したパラメータ）
  const requestData = {
    contents,
    generationConfig: {
      temperature: 0.8, // 少し高めに設定して詩的な表現を引き出す
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1000,
      safetySettings: [
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        }
      ]
    }
  };

  // APIリクエストURLの準備
  const url = `${API_ENDPOINT}?key=${API_KEY}`;
  console.log('APIリクエスト送信中...');
  
  // Gemini APIへのリクエスト（タイムアウト設定）
  const response = await axios.post(url, requestData, {
    timeout: REQUEST_TIMEOUT,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  // レスポンスの処理と検証
  const responseText = extractResponseText(response);
  const validatedResponse = validateResponse(responseText);
  
  // ユーザー会話履歴を更新
  userConversation.messages.push({
    role: 'assistant',
    content: validatedResponse
  });
  userConversation.lastUpdated = Date.now();
  userConversation.messageCount++;
  userConversation.lastSuccessful = Date.now();
  
  // 処理時間の計測
  const processingTime = Date.now() - startTime;
  console.log(`AI応答完了: ${processingTime}ms, 長さ=${validatedResponse.length}`);
  console.log(`AI応答: ${validatedResponse.substring(0, 100)}${validatedResponse.length > 100 ? '...' : ''}`);
  
  // 健全性ステータスを更新
  updateHealthStatus(true);
  
  return validatedResponse;
}

/**
 * レスポンスからテキストを抽出する
 * @param {Object} response - APIレスポンス
 * @returns {string} 抽出されたテキスト
 */
function extractResponseText(response) {
  if (!response.data) {
    throw new Error('APIからの応答が空です');
  }
  
  if (response.data.candidates && 
      response.data.candidates.length > 0 && 
      response.data.candidates[0].content && 
      response.data.candidates[0].content.parts && 
      response.data.candidates[0].content.parts.length > 0 &&
      response.data.candidates[0].content.parts[0].text) {
    
    return response.data.candidates[0].content.parts[0].text;
  }
  
  // エラーメッセージがある場合
  if (response.data.error) {
    throw new Error(`APIエラー: ${response.data.error.message || '不明なエラー'}`);
  }
  
  throw new Error('APIレスポンスの形式が予期しないものです');
}

/**
 * 応答の妥当性を検証する
 * @param {string} responseText - AIからの応答テキスト
 * @returns {string} 検証済みの応答テキスト
 */
function validateResponse(responseText) {
  // 空の応答をチェック
  if (!responseText || responseText.trim() === '') {
    return '🌿 言葉が見つからないようです。もう一度、お話しませんか？';
  }
  
  // 極端に短い応答をチェック
  if (responseText.length < MIN_ACCEPTABLE_LENGTH) {
    return '🍃 うまく言葉が紡げなかったようです。少し違う角度から話してみませんか？';
  }
  
  // APIエラーのパターンをチェック
  if (responseText.match(/^(API Error|Error:|Exception:|Failed:)/i)) {
    return '🌱 今、うまく応えられないようです。少し時間をおいて、また話しかけてもらえますか？';
  }
  
  return responseText;
}

/**
 * 会話履歴を取得または初期化する
 * @param {string} userId - ユーザーID 
 * @returns {Object} ユーザーの会話履歴
 */
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
  
  const userConversation = conversationCache.get(userId);
  
  // 有効期限チェック - 30分以上経過していたら履歴をクリア
  if (Date.now() - userConversation.lastUpdated > CACHE_EXPIRY) {
    userConversation.messages = [];
    userConversation.messageCount = 0;
    userConversation.errorCount = 0;
  }
  
  return userConversation;
}

/**
 * ユーザーの会話履歴をクリア
 * @param {string} userId - 削除するユーザーID
 * @returns {boolean} 成功したらtrue、ユーザーが存在しなければfalse
 */
function clearConversationHistory(userId) {
  if (conversationCache.has(userId)) {
    conversationCache.delete(userId);
    return true;
  }
  return false;
}

/**
 * APIの健全性ステータスを更新
 * @param {boolean} success - APIリクエストが成功したかどうか
 */
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

/**
 * APIサービスの健全性をチェック
 * @returns {Object} 健全性のステータス
 */
async function checkHealth() {
  try {
    // 簡単なテストリクエストを実行
    await getAIResponse('health-check', 'こんにちは', 'system', false);
    return {
      status: 'healthy',
      lastCheck: HEALTH_STATUS.lastCheck,
      consecutiveFailures: 0
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      lastCheck: Date.now(),
      error: error.message,
      consecutiveFailures: HEALTH_STATUS.consecutiveFailures + 1
    };
  }
}

/**
 * APIキーが設定されているかどうかの確認
 * @returns {boolean} 設定されていればtrue
 */
function isConfigured() {
  const configured = !!API_KEY;
  console.log(`Gemini API設定状態: ${configured ? '設定済み' : '未設定'}`);
  return configured;
}

/**
 * 現在の設定情報を取得
 * @returns {Object} 設定情報
 */
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
  getAIResponse,
  clearConversationHistory,
  isConfigured,
  checkHealth,
  getConfig
};
