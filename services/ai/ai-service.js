/**
 * Bocchy Discord Bot - 統合AIサービス
 * さまざまなAIプロバイダーを抽象化して一貫したインターフェースを提供
 */

const logger = require('../../system/logger');
const axios = require('axios');
const config = require('../../config/env');
const searchService = require('../../extensions/search-service');
const dateHandler = require('../../extensions/date-handler');

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
    const apiModel = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    
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
 * @returns {Promise<Object>} 処理された検索結果 または エラー情報
 */
async function performSearch(query) {
  if (!searchService.isInitialized()) {
    logger.warn('検索サービスが初期化されていないため、検索を実行できませんでした。');
    return {
      success: false,
      error: 'SERVICE_UNINITIALIZED',
      content: '検索サービスが利用できません。'
    };
  }
  
  try {
    logger.debug(`検索実行: "${query}"`);
    const searchResponse = await searchService.performSearchNew(query);
    
    // レスポンス自体のチェック
    if (!searchResponse) {
        logger.error('searchService.performSearchNew returned undefined or null');
        return {
          success: false,
          error: 'SEARCH_FAILED',
          content: '検索処理中に予期せぬエラーが発生しました。'
        };
    }
    
    logger.debug(`[performSearch] Received search response: success=${searchResponse.success}, results_count=${searchResponse.results?.length}, error=${searchResponse.error}`);
    
    // 検索が成功した場合
    if (searchResponse.success && Array.isArray(searchResponse.results)) {
      // 結果をAI向けに整形
      let formattedContent = '検索結果が見つかりませんでした。';
      let sourcesList = '';
      
      if (searchResponse.results.length > 0) {
          // content の整形: title と description を連結
          formattedContent = searchResponse.results.map((result, index) => 
              `【${index + 1}】${result.title}\n${result.description}`
          ).join('\n\n');
          
          // sourcesList の整形: title, url, hostname をリスト化
          sourcesList = searchResponse.results.map((result, index) => {
              const hostname = result.url ? new URL(result.url).hostname : '(URLなし)';
              return `${index + 1}. [${result.title}](${result.url || '#'}) - ${hostname}`;
          }).join('\n');
          
          logger.debug('[performSearch] Formatted search results for AI.');
      } else {
          logger.debug('[performSearch] Search was successful but returned 0 results.');
      }
      
      return {
        success: true,
        content: formattedContent,
        sourcesList: sourcesList
      };
    } 
    // 検索が失敗した場合
    else {
        logger.warn(`検索失敗: ${searchResponse.error || '不明なエラー'}. Message: ${searchResponse.message || ''}`);
        const isRateLimited = searchResponse.error && searchResponse.error.includes('RATE_LIMITED');
        
        return {
          success: false,
          error: isRateLimited ? 'RATE_LIMITED' : (searchResponse.error || 'SEARCH_FAILED'),
          content: isRateLimited ? '検索APIの利用制限に達しました。しばらく時間を置いてからお試しください。⏳' : (searchResponse.message || '検索結果の取得に失敗しました。')
        };
    }

  } catch (error) {
    logger.error(`検索中の予期せぬエラー: ${error.message}`, error);
    const isRateLimited = error.message && (error.message.includes('429') || error.message.includes('RATE_LIMITED'));
    
    return {
      success: false,
      error: isRateLimited ? 'RATE_LIMITED' : 'UNEXPECTED_SEARCH_ERROR',
      content: isRateLimited ? '検索APIの利用制限に達しました。しばらく時間を置いてからお試しください。⏳' : '検索処理中に予期せぬエラーが発生しました。'
    };
  }
}

/**
 * 検索結果を含めたAI応答を取得
 * @param {Object} context - リクエストコンテキスト
 * @returns {Promise<string>} AI応答 または エラーメッセージ
 */
async function getResponseWithSearch(context) {
  const { message } = context;
  let searchContext = ''; // AIに渡す検索関連コンテキスト
  let searchSuccess = false;
  let searchErrorType = null;

  try {
    // 検索を実行 (provideSearchForAIを使うように修正)
    const searchResult = await searchService.provideSearchForAI(message);
    searchSuccess = searchResult && !searchResult.error; // エラーがない場合に成功とみなす
    searchErrorType = searchResult?.errorType || null;
    
    if (searchSuccess) {
      // 検索成功: 結果を整形してコンテキストに追加
      if (searchResult.summary && searchResult.sources) {
        searchContext = `
以下は「${searchResult.query || message}」という質問に関するWeb検索結果です。これを最優先の情報源として回答を生成してください。

### 検索結果の要約:
${searchResult.summary}

### 参照ソース:
${searchResult.sources}

上記の検索結果に基づいて、ユーザーの質問に具体的に答えてください。情報源を適切に引用・要約し、検索結果にない情報は推測しないでください。
`;
        logger.debug('検索結果をAIコンテキストに追加しました。');
      } else {
        searchContext = `
「${searchResult.query || message}」についてWeb検索を行いましたが、関連性の高い情報は見つかりませんでした。検索結果には頼らず、あなたの知識に基づいて回答してください。
`;
        logger.debug('検索結果が空のため、その旨をAIコンテキストに追加しました。');
      }
    } else {
      // 検索失敗
      logger.warn(`検索に失敗しました。Error: ${searchResult.error || '不明'}, Type: ${searchErrorType || '不明'}`);
      if (searchErrorType === 'RATE_LIMITED') {
        searchContext = `
Web検索機能を利用しようとしましたが、一時的なAPI利用制限のため情報を取得できませんでした。この状況をユーザーに伝えた上で、検索結果には頼らず、あなたの知識の範囲で質問に答えてください。
`;
        logger.warn('検索APIレート制限のため、AIには検索不可で応答するよう指示します。');
      } else {
        searchContext = `
Web検索を試みましたが、技術的な問題により失敗しました。検索結果には頼らず、あなたの知識に基づいてユーザーの質問に答えてください。
`;
        logger.warn(`検索エラー(${searchErrorType || '不明'})のため、AIには検索不可で応答するよう指示します。`);
      }
      // 失敗した場合でも、エラーメッセージ自体を応答として返すわけではない
      // AIにフォールバック応答を生成させる
    }

    // 検索コンテキストを含む拡張コンテキストを作成
    const enhancedContext = {
      ...context,
      searchInfo: { // searchResults を searchInfo に変更し、より詳細な情報を持たせる
          performed: true,
          success: searchSuccess,
          errorType: searchErrorType,
          query: searchResult?.query || message
      },
      additionalContext: searchContext // AIへの指示を含む
    };
    
    // 拡張コンテキストでAI応答を取得
    logger.debug(`AI応答生成を呼び出します (検索成功: ${searchSuccess}, エラータイプ: ${searchErrorType})`);
    return getResponse(enhancedContext); // getResponseに処理を委譲

  } catch (error) {
    logger.error(`getResponseWithSearch 内で予期せぬエラー: ${error.message}`, error);
    // 予期せぬエラーの場合は、検索なしでAI応答を試みる
    logger.warn('予期せぬエラーのため、検索なしでAI応答を試みます。');
    const fallbackContext = {
        ...context,
        searchInfo: { performed: false }, // 検索が実行されなかったことを示す
        additionalContext: '\n(内部エラーによりWeb検索は実行できませんでした。知識のみで回答してください)\n'
    };
    return getResponse(fallbackContext);
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

/**
 * AI応答を取得するコア関数
 * @param {Object} context - リクエストコンテキスト（検索情報を含む可能性あり）
 * @returns {Promise<string>} AI応答 または エラーメッセージ
 */
async function getResponse(context) {
  // ... (関数の中身は変更なし - 以前の修正を適用済み)
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