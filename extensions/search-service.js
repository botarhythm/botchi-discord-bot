/**
 * Bocchy Discord Bot - 検索サービス
 * Google Custom Search APIを使用してウェブ検索と結果の要約を行う
 */

const axios = require('axios');
const logger = require('../system/logger');
const config = require('../config');
const searchProcessor = require('./search-processor');
const { analyzeSearch } = require('./search-analyzer');

// Google Search APIの設定（環境変数から取得）
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || '';
const GOOGLE_SEARCH_API_URL = 'https://www.googleapis.com/customsearch/v1';

// APIキャッシュ（トークン制限回避と高速化のため）
const CACHE_DURATION = 5 * 60 * 1000; // 5分間
const searchCache = new Map();

// バリデーション関数を追加
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

function isValidApiKey(key) {
  // APIキーのフォーマットを確認（簡易チェック）
  return typeof key === 'string' && key.length > 5;
}

/**
 * 検索クエリをURLエンコードして整形する
 * @param {string} query - 検索クエリ
 * @returns {string} URLエンコードされた検索クエリ
 */
function encodeSearchQuery(query) {
  // 基本的なURLエンコーディング
  const encoded = encodeURIComponent(query);
  
  // 日本語検索に適した形式に調整
  return encoded
    .replace(/%20/g, '+') // スペースを+に変換
    .replace(/%2B/g, '+'); // エンコードされた+記号を+に戻す
}

let isInitialized = false;

/**
 * 検索サービスの初期化
 */
function initialize() {
  try {
    // APIキーを process.env から直接読み込み
    const apiKey = process.env.GOOGLE_API_KEY;
    const cseId = process.env.GOOGLE_CSE_ID;
    
    if (!apiKey || !cseId) {
      logger.warn('Google検索APIキーまたはCSE IDが環境変数に設定されていません。検索機能は無効です。');
      isInitialized = false;
      return false;
    }
    
    logger.info('検索サービスが正常に初期化されました。');
    isInitialized = true;
    return true;
  } catch (error) {
    logger.error(`検索サービスの初期化中にエラーが発生しました: ${error.message}`);
    isInitialized = false;
    return false;
  }
}

/**
 * 検索機能のヘルスチェックを実行
 * @returns {Promise<Object>} ヘルスチェック結果
 */
async function checkHealth() {
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
    return {
      status: 'unhealthy',
      message: 'Google検索APIキーまたはCSE IDが設定されていません'
    };
  }
  
  try {
    // 簡単なテスト検索を実行
    const testResponse = await axios.get(GOOGLE_SEARCH_API_URL, {
      params: {
        key: GOOGLE_API_KEY,
        cx: GOOGLE_CSE_ID,
        q: 'test',
        num: 1
      }
    });
    
    if (testResponse.status === 200 && testResponse.data && testResponse.data.items) {
      return {
        status: 'healthy',
        message: 'Google Search APIは正常に動作しています'
      };
    } else {
      return {
        status: 'unhealthy',
        message: `API応答エラー: ${testResponse.status}`
      };
    }
  } catch (error) {
    logger.error(`検索ヘルスチェックエラー: ${error.message}`);
    return {
      status: 'unhealthy',
      message: `API接続エラー: ${error.message}`
    };
  }
}

/**
 * 検索クエリのタイプを分析する
 * @param {string} query - 検索クエリ
 * @returns {Object} クエリタイプ情報
 */
function analyzeQueryType(query) {
  if (!query) return {};
  
  const normalizedQuery = query.toLowerCase();
  
  // 事実質問（何、いつ、どこ、誰）
  const isFactQuestion = /^(何|いつ|どこ|誰|なぜ|どうして|何故|どの|どんな|どうやって).+(か|？|\?)$/.test(query) ||
                       /^(what|when|where|who|why|which|how).+(\?|？)$/.test(normalizedQuery);
  
  // 比較質問
  const isComparisonQuestion = /(.+と.+の|.+または.+の|.+vs.+|.+対.+)(違い|比較|どっち|どちら)/.test(query) ||
                             /(difference|compare|versus|vs\.|\bor\b).+(\?|？)$/.test(normalizedQuery);
  
  // 方法や手順に関する質問
  const isHowToQuery = /^(方法|やり方|手順|手続き|手法|作り方|作成方法|設定方法|実装方法|使い方)/.test(query) ||
                     /^how\s+to\s+|^ways?\s+to\s+|^steps?\s+to\s+/.test(normalizedQuery);
  
  // 定義や意味に関する質問
  const isDefinitionQuery = /^(.+とは|.+の意味|.+の定義)/.test(query) ||
                          /^(what\s+is|meaning\s+of|definition\s+of)/.test(normalizedQuery);
  
  // 最新情報に関する質問
  const isRecentQuery = /(最新|最近|今日|今週|今月|今年|直近|最新版|アップデート|ニュース)/.test(query) ||
                      /(latest|recent|today|this week|this month|this year|update|news)/.test(normalizedQuery);
  
  return {
    isFactQuestion,
    isComparisonQuestion,
    isHowToQuery,
    isDefinitionQuery,
    isRecentQuery
  };
}

/**
 * 検索結果を処理してAIに提供する形式に整形
 * @param {Object} apiResponse - Google Search APIレスポンス
 * @returns {Object} 処理された検索結果
 */
function processSearchResults(apiResponse) {
  // 検索結果のバリデーション
  if (!apiResponse || !apiResponse.items || !Array.isArray(apiResponse.items)) {
    logger.warn('検索結果の処理: 無効なAPIレスポンス形式');
    return {
      summary: '検索結果を取得できませんでした。',
      sources: []
    };
  }
  
  // 結果がない場合の処理
  if (apiResponse.items.length === 0) {
    return {
      summary: '検索結果はありませんでした。別のキーワードで試してみてください。',
      sources: []
    };
  }
  
  // 結果の整形
  const sources = apiResponse.items.map((result, index) => {
    return {
      index: index + 1,
      title: result.title,
      url: result.link,
      description: result.snippet,
      hostname: new URL(result.link).hostname
    };
  });
  
  // 検索結果から要約テキストを構築
  const summaryText = sources.map(source => 
    `【${source.index}】${source.title}\n${source.description}`
  ).join('\n\n');
  
  // 出典リスト生成（マークダウン形式）
  const sourcesList = sources.map(source => 
    `${source.index}. [${source.title}](${source.url}) - ${source.hostname}`
  ).join('\n');
  
  const resultObj = {
    summary: summaryText,
    sources: sources,
    sourcesList: sourcesList,
    query: apiResponse.queries?.request[0]?.searchTerms || '',
    totalResults: parseInt(apiResponse.searchInformation?.totalResults || sources.length)
  };
  // 生成したsourcesやsourcesListをデバッグ出力
  logger.debug('Processed search results (sources):', JSON.stringify(resultObj.sources, null, 2));
  logger.debug('Processed search results (sourcesList):', resultObj.sourcesList);
  return resultObj;
}

/**
 * モック検索結果の生成（APIが利用できない場合のフォールバック）
 * @param {string} query - 検索クエリ
 * @returns {Object} モック検索結果
 */
function createMockResult(query) {
  const currentTime = new Date().toISOString();
  
  return {
    summary: `検索機能は一時的に利用できません。「${query}」の検索結果を取得できませんでした。`,
    sources: [],
    sourcesList: '',
    query: query,
    totalResults: 0,
    error: 'Search API unavailable',
    timestamp: currentTime
  };
}

/**
 * 検索キャッシュをクリア
 */
function clearCache() {
  searchCache.clear();
  logger.info('検索キャッシュをクリアしました');
}

/**
 * 検索結果をキャッシュに保存する
 * @param {string} query - 検索クエリ
 * @param {Object} result - 検索結果
 * @param {Object} options - 検索オプション
 */
function cacheSearchResult(query, result, options = {}) {
  try {
    const cacheKey = `${query}:${options.count || 5}:${options.language || 'jp'}`;
    searchCache.set(cacheKey, {
      timestamp: Date.now(),
      data: result
    });
    logger.debug(`検索結果をキャッシュに保存: "${query}"`);
    
    // キャッシュサイズの管理（50件を超えた場合、古いものから削除）
    if (searchCache.size > 50) {
      const oldestKey = [...searchCache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      searchCache.delete(oldestKey);
      logger.debug(`古いキャッシュを削除: "${oldestKey}"`);
    }
  } catch (error) {
    logger.warn(`検索結果のキャッシュに失敗: ${error.message}`);
  }
}

/**
 * キャッシュから検索結果を取得
 * @param {string} query - 検索クエリ
 * @param {Object} options - 検索オプション
 * @returns {Object|null} キャッシュされた検索結果、または null
 */
function getFromCache(query, options = {}) {
  const cacheKey = `${query}:${options.count || 5}:${options.language || 'jp'}`;
  const cachedItem = searchCache.get(cacheKey);
  
  if (cachedItem) {
    const now = Date.now();
    const elapsed = now - cachedItem.timestamp;
    
    // キャッシュ有効期限内（デフォルト5分）
    if (elapsed < (options.cacheDuration || CACHE_DURATION)) {
      logger.debug(`キャッシュから検索結果を取得: "${query}"`);
      return cachedItem.data;
    } else {
      // 期限切れのキャッシュを削除
      searchCache.delete(cacheKey);
      logger.debug(`期限切れのキャッシュを削除: "${query}"`);
    }
  }
  
  return null;
}

/**
 * Web検索を実行する
 * @param {string} query - 検索クエリ
 * @param {Object} options - 検索オプション
 * @returns {Promise<Object>} 検索結果
 */
async function performSearch(query, options = {}) {
  if (!query) {
    logger.warn('検索クエリが空です');
    return createMockResult('');
  }
  
  const searchQuery = query.trim();
  logger.info(`検索実行: "${searchQuery}"`);
  
  // オプションの設定
  const searchOptions = {
    count: options.count || 5, // 結果の数
    language: options.language || 'lang_ja', // デフォルトは日本語
    country: options.country || 'jp', // デフォルトは日本
    useCache: options.useCache !== false, // デフォルトはキャッシュ使用
    useMockOnError: options.useMockOnError !== false, // エラー時にモックデータを使用
    timeout: options.timeout || 10000, // タイムアウト（デフォルト10秒）
    cacheDuration: options.cacheDuration || CACHE_DURATION
  };
  
  // APIキャッシュをチェック
  if (searchOptions.useCache) {
    const cachedResult = getFromCache(searchQuery, searchOptions);
    if (cachedResult) {
      return cachedResult;
    }
  }
  
  try {
    // 検索クエリを分析
    const queryType = analyzeQueryType(searchQuery);
    
    // Google Search APIにリクエスト
    const response = await axios.get(GOOGLE_SEARCH_API_URL, {
      params: {
        key: GOOGLE_API_KEY,
        cx: GOOGLE_CSE_ID,
        q: searchQuery,
        num: searchOptions.count,
        lr: searchOptions.language,
        gl: searchOptions.country
      },
      timeout: searchOptions.timeout
    });
    
    if (response.status !== 200) {
      throw new Error(`API応答エラー: ${response.status}`);
    }
    
    // Google APIからのレスポンス取得直後に生データをデバッグ出力
    logger.debug('Google API raw response:', JSON.stringify(response?.data || response, null, 2));
    
    // 検索結果を処理
    const processedResults = processSearchResults(response.data);
    
    // クエリタイプ情報を追加
    processedResults.queryType = queryType;
    processedResults.timestamp = new Date().toISOString();
    
    // 結果をキャッシュに保存
    if (searchOptions.useCache) {
      cacheSearchResult(searchQuery, processedResults, searchOptions);
    }
    
    return processedResults;
    
  } catch (error) {
    logger.error(`検索エラー: ${error.message}`);
    
    let errorType = 'UNKNOWN_ERROR';
    let errorMessage = `検索中に不明なエラーが発生しました: ${error.message}`;
    let statusCode = null;

    if (error.response) {
      // HTTPエラーの場合
      statusCode = error.response.status;
      errorMessage = `API応答エラー: ステータスコード ${statusCode}`;
      if (statusCode === 429) {
        errorType = 'RATE_LIMITED';
        errorMessage = '検索APIの利用制限に達しました。しばらくしてから再試行してください。';
        logger.warn('Google Search API rate limit reached.');
      } else if (statusCode >= 400 && statusCode < 500) {
        errorType = 'CLIENT_ERROR';
        errorMessage = `検索リクエストに問題があります (コード: ${statusCode})。`;
      } else if (statusCode >= 500) {
        errorType = 'SERVER_ERROR';
        errorMessage = `検索サービス側で問題が発生しています (コード: ${statusCode})。`;
      }
    } else if (error.request) {
      // リクエストは行われたが応答がない場合
      errorType = 'NO_RESPONSE';
      errorMessage = '検索サービスから応答がありませんでした。';
    } else if (error.code === 'ECONNABORTED') {
      // タイムアウトエラー
       errorType = 'TIMEOUT';
       errorMessage = `検索リクエストがタイムアウトしました (タイムアウト設定: ${searchOptions.timeout}ms)。`;
    }

    // エラー時のフォールバック
    if (searchOptions.useMockOnError) {
      logger.warn(`API呼び出しが失敗しました。モックデータを返します: ${errorMessage}`);
      // モックデータにもエラー情報を付与する
      const mockResult = createMockResult(searchQuery);
      mockResult.error = errorMessage;
      mockResult.errorType = errorType; // エラータイプを追加
      mockResult.statusCode = statusCode; // ステータスコードを追加
      return mockResult;
    }
    
    // useMockOnErrorがfalseの場合は、エラー情報をそのまま返す
    return {
        summary: `検索エラー: ${errorMessage}`,
        sources: [],
        sourcesList: '',
        query: searchQuery,
        totalResults: 0,
        error: errorMessage,
        errorType: errorType, // エラータイプを追加
        statusCode: statusCode, // ステータスコードを追加
        timestamp: new Date().toISOString()
    };
  }
}

/**
 * AI用の検索結果を提供する
 * @param {string} query - 検索クエリ
 * @returns {Promise<Object>} 検索結果
 */
async function provideSearchForAI(query) {
  try {
    // 検索を実行し、結果を取得
    const searchResults = await performSearch(query, {
      count: 5,
      useCache: true,
      useMockOnError: true
    });
    
    // AI用に整形したレスポンス
    return {
      summary: searchResults.summary || `「${query}」の検索結果はありませんでした。`,
      sources: searchResults.sourcesList || '',
      query: searchResults.query || query,
      totalResults: searchResults.totalResults || 0,
      timestamp: searchResults.timestamp || new Date().toISOString()
    };
  } catch (error) {
    logger.error(`AI用検索処理エラー: ${error.message}`);
    return {
      summary: `検索処理中にエラーが発生しました: ${error.message}`,
      sources: '',
      query: query,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 検索サービスの初期化状態を返す
 * @returns {boolean} 初期化されていればtrue
 */
function getInitializationStatus() {
  return isInitialized;
}

// エクスポートする関数リスト
module.exports = {
  initialize,
  checkHealth,
  performSearch,
  provideSearchForAI,
  analyzeQueryType,
  getInitializationStatus
};