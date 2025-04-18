/**
 * Bocchy Discord Bot - 統合AIサービス
 * さまざまなAIプロバイダーを抽象化して一貫したインターフェースを提供
 */

const logger = require('./system/logger');
const axios = require('axios');
const config = require('./config');
const searchService = require('./extensions/search-service');
const dateHandler = require('./extensions/date-handler');

// 環境変数から設定を読み込み
require('dotenv').config();

// プロバイダーの設定
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const DEBUG = process.env.DEBUG === 'true';

// ユーザーエラーメッセージ
const ERROR_MESSAGES = {
  init: 'AIサービスの初期化に失敗しました。',
  common: '🌿 すみません、うまく応答できませんでした。少し経ってからお試しください。',
  timeout: '🕰️ 応答に時間がかかりすぎています。もう少し短い質問でお試しください。',
  unavailable: '🍃 AIサービスに一時的に接続できません。しばらくお待ちください。',
  invalid: '🌱 有効な応答を生成できませんでした。別の言い方でお試しください。'
};

// プロバイダーインスタンス
let provider = null;

// AIプロバイダーの初期化
async function initialize() {
  try {
    // 設定の確認 (process.envから直接読み込み)
    const apiKey = process.env.OPENAI_API_KEY;
    const apiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    
    if (!apiKey) {
      logger.warn('OpenAI APIキーが環境変数に設定されていません');
      return false;
    }
    
    logger.info(`AI Service initialized with model: ${apiModel}`);
    
    // 検索サービスの初期化
    const searchInitialized = await searchService.initialize();
    if (!searchInitialized) {
        logger.warn('Search service failed to initialize, proceeding without search capabilities.')
    }
    
    return true;
  } catch (error) {
    logger.error(`AI Service initialization error: ${error.message}`);
    return false;
  }
}

/**
 * 健全性チェック
 * @returns {Promise<Object>} 健全性状態
 */
async function checkHealth() {
  if (!provider || typeof provider.checkHealth !== 'function') {
    return { status: 'error', message: 'Provider not initialized or health check unavailable' };
  }
  
  try {
    const result = await provider.checkHealth();
    return result;
  } catch (error) {
    logger.error(`Health check error: ${error.message}`);
    return { status: 'error', message: error.message };
  }
}

/**
 * 現在の設定情報を取得
 * @returns {Object} 設定情報
 */
function getConfig() {
  return {
    initialized: true,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini', // process.envから読み込み
    endpoint: process.env.OPENAI_ENDPOINT || 'https://api.openai.com/v1/chat/completions', // process.envから読み込み
    searchEnabled: searchService.isInitialized()
  };
}

/**
 * 検索を実行してAIに送信する
 * @param {string} query - 検索クエリ
 * @returns {Promise<Object>} 処理された検索結果
 */
async function performSearch(query) {
  // まず検索サービスが初期化されているか確認
  if (!searchService.isInitialized()) {
    logger.warn('検索サービスが初期化されていないため、検索を実行できませんでした。');
    return {
      success: false,
      error: '検索サービスが初期化されていません',
      content: '検索サービスが利用できません。'
    };
  }
  
  try {
    logger.debug(`検索実行: "${query}"`);
    const searchResults = await searchService.performSearchNew(query);
    
    if (!searchResults || !searchResults.success) { // searchResults自体もチェック
      logger.warn(`検索失敗: ${searchResults?.error || '不明なエラー'}`);
      return {
        success: false,
        error: searchResults?.error || '検索に失敗しました',
        content: searchResults?.message || '検索結果の取得に失敗しました。'
      };
    }
    
    // formattedResultsが存在するか確認
    if (!searchResults.formattedResults) {
      logger.warn('検索結果のフォーマットに失敗しました。');
       return {
         success: false,
         error: '検索結果のフォーマットエラー',
         content: '検索結果の表示形式に問題がありました。'
       };
    }
    
    return {
      success: true,
      content: searchResults.formattedResults,
      sourcesList: searchResults.sourcesList || '' // sourcesListがない場合も考慮
    };
  } catch (error) {
    logger.error(`検索エラー: ${error.message}`);
    return {
      success: false,
      error: `検索エラー: ${error.message}`,
      content: '検索処理中にエラーが発生しました。'
    };
  }
}

/**
 * 検索結果を含めたAI応答を取得
 * @param {Object} context - リクエストコンテキスト
 * @returns {Promise<string>} AI応答
 */
async function getResponseWithSearch(context) {
  const { message } = context;
  
  try {
    // 検索を実行
    const searchResult = await performSearch(message);
    
    if (!searchResult.success) {
      logger.warn('検索に失敗したため、通常の応答を返します');
      return getResponse(context);
    }
    
    // 検索結果を含めたプロンプトを作成
    const searchContext = `
以下は「${message}」という質問に関する検索結果です：

${searchResult.content}

出典：
${searchResult.sourcesList || '(出典情報なし)'}

上記の検索結果を参考にして、ユーザーの質問に答えてください。必ず情報源を引用し、出典を明記してください。
検索結果にない情報は推測せず、わからないことははっきりとその旨を伝えてください。
`;
    
    // 検索結果を含むコンテキストを作成
    const searchEnhancedContext = {
      ...context,
      searchResults: searchResult,
      additionalContext: searchContext
    };
    
    // 拡張コンテキストでAI応答を取得
    logger.debug('検索結果を含めてAI応答を取得します');
    return getResponse(searchEnhancedContext);
  } catch (error) {
    logger.error(`検索+AI応答取得エラー: ${error.message}`);
    return getResponse(context);
  }
}

/**
 * メッセージが検索クエリかどうか判定
 * @param {string} message - メッセージ
 * @returns {boolean} 検索クエリならtrue
 */
function isSearchQuery(message) {
  if (!message || typeof message !== 'string') {
    return false;
  }
  
  // 検索クエリの特徴を正規表現でチェック
  const searchPatterns = [
    /検索|調べて|教えて|何(です|でしょう)|いつ(です|でしょう)|どこ(です|でしょう)|誰(です|でしょう)|方法|やり方/,
    /最新|ニュース|情報|更新|発表/,
    /^(what|when|where|who|how|why|which)/i,
    /\?$/,
    /について$/
  ];
  
  return searchPatterns.some(pattern => pattern.test(message));
}

/**
 * AI応答を取得
 * @param {Object} context - リクエストコンテキスト
 * @returns {Promise<string>} AI応答
 */
async function getResponse(context) {
  try {
    // 日時関連の質問かチェック
    const isDateTimeRelated = isDateTimeQuestion(context.message);
    
    // 検索クエリかチェック
    const needsSearch = isSearchQuery(context.message);
    
    // 日時関連または検索クエリの場合
    if (needsSearch) {
      logger.debug(`検索が必要なクエリと判断: "${context.message}"`);
      return getResponseWithSearch(context);
    }
    
    // OpenAI APIキーを取得 (process.envから)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error('OpenAI APIキーが環境変数に設定されていません');
      return '申し訳ありません、AI機能が現在利用できません。';
    }
    
    // APIモデルを取得 (process.envから)
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    // API URLを取得 (process.envから)
    const apiUrl = process.env.OPENAI_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
    
    logger.debug(`OpenAI API呼び出し: モデル=${model}`);
    
    // 追加コンテキストがある場合は含める
    const additionalContextText = context.additionalContext || '';
    
    // システムプロンプトを作成
    const systemPrompt = `あなたは「Bocchy（ボッチー）」という名前のAIアシスタントです。
静かでやわらかく、詩のような語り口をもち、深い知識と経験に基づいた回答をします。
現在の日本時間は ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} です。`;
    
    // メッセージ配列を作成
    const messages = [
      { role: 'system', content: systemPrompt }
    ];
    
    // 追加コンテキストがある場合は含める
    if (additionalContextText) {
      messages.push({ 
        role: 'system', 
        content: additionalContextText 
      });
    }
    
    // ユーザーメッセージを追加
    messages.push({
      role: 'user',
      content: context.message
    });
    
    // OpenAI APIリクエストの作成
    const requestBody = {
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000
    };
    
    // OpenAI APIを呼び出し
    logger.debug('[Bocchy] OpenAI API呼び出し開始');
    const startTime = Date.now();
    
    const response = await axios.post(apiUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 30000 // 30秒でタイムアウト
    });
    
    const duration = Date.now() - startTime;
    logger.debug(`[Bocchy] 応答完了 in ${duration}ms`);
    
    // レスポンスからテキストを抽出
    if (response.data && 
        response.data.choices && 
        response.data.choices.length > 0 && 
        response.data.choices[0].message &&
        response.data.choices[0].message.content) {
      
      const responseText = response.data.choices[0].message.content.trim();
      
      // 日時関連の質問の場合、現在の日本時間を確認
      if (isDateTimeRelated && !responseText.includes(new Date().getFullYear())) {
        const now = new Date();
        const japanTime = now.toLocaleString('ja-JP', { 
          timeZone: 'Asia/Tokyo',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long' 
        });
        
        return `今日は${japanTime}です🌿\n\n${responseText}`;
      }
      
      return responseText;
    }
    
    logger.warn('OpenAI APIから有効な応答が得られませんでした');
    return '申し訳ありません、応答の取得に失敗しました。もう一度お試しください。';
  } catch (error) {
    logger.error(`AI応答取得エラー: ${error.message}`);
    
    // エラータイプに基づいたメッセージ
    if (error.response) {
      logger.error(`API応答エラー: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      
      if (error.response.status === 401) {
        return '申し訳ありません、APIの認証に失敗しました。管理者に連絡してください。';
      } else if (error.response.status === 429) {
        return '申し訳ありません、APIのレート制限に達しました。しばらく経ってからもう一度お試しください。';
      }
    } else if (error.code === 'ECONNABORTED') {
      return '申し訳ありません、応答がタイムアウトしました。しばらく経ってからもう一度お試しください。';
    }
    
    return '申し訳ありません、処理中にエラーが発生しました。しばらく経ってからもう一度お試しください。';
  }
}

/**
 * 日時関連の質問かどうかをチェック
 * @param {string} message - ユーザーメッセージ
 * @returns {boolean} 日時関連ならtrue
 */
function isDateTimeQuestion(message) {
  if (!message || typeof message !== 'string') {
    return false;
  }
  
  const timePatterns = [
    /今日|本日|現在|時間|日付|日時|何時|何日|曜日/,
    /date|time|today|now|current/i
  ];
  
  return timePatterns.some(pattern => pattern.test(message));
}

/**
 * 会話履歴をクリア
 * @param {string} userId - ユーザーID
 * @returns {boolean} 成功したかどうか
 */
function clearConversationHistory(userId) {
  if (!provider || typeof provider.clearConversationHistory !== 'function') {
    logger.error('Provider not initialized or clearConversationHistory method unavailable');
    return false;
  }
  
  try {
    return provider.clearConversationHistory(userId);
  } catch (error) {
    logger.error(`Error clearing conversation history: ${error.message}`);
    return false;
  }
}

// モジュールをエクスポート
module.exports = {
  initialize,
  getResponse,
  getResponseWithSearch,
  performSearch,
  isSearchQuery,
  isDateTimeQuestion,
  getConfig,
  checkHealth,
  clearConversationHistory,
  ERROR_MESSAGES
};