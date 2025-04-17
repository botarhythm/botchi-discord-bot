/**
 * Bocchy Discord Bot - 検索サービス
 * BraveSearchを使用してウェブ検索と結果の要約を行う
 */

const axios = require('axios');
const logger = require('../system/logger');
const BraveSearchClient = require('../core/search/brave-search');
const config = require('../config');
const searchProcessor = require('./search-processor');
const { analyzeSearch } = require('./search-analyzer');
const { processResults } = require('../core/search/search-processor');

// BraveSearchの設定（環境変数から取得）
const BRAVE_SEARCH_API_KEY = process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY || '';
const BRAVE_SEARCH_API_URL = 'https://api.search.brave.com/res/v1/web/search';

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

// Brave検索クライアントのインスタンス
let braveClient = null;

/**
 * 検索サービスの初期化
 */
function initialize() {
  try {
    const apiKey = config.get('BRAVE_SEARCH_API_KEY');
    if (!apiKey) {
      logger.warn('Brave検索APIキーが設定されていません。検索機能は無効です。');
      return false;
    }
    
    braveClient = new BraveSearchClient(apiKey);
    logger.info('検索サービスが初期化されました');
    return true;
  } catch (error) {
    logger.error(`検索サービスの初期化に失敗しました: ${error.message}`);
    return false;
  }
}

/**
 * 検索機能のヘルスチェックを実行
 * @returns {Promise<Object>} ヘルスチェック結果
 */
async function checkHealth() {
  if (!braveClient) {
    return false;
  }
  
  try {
    // 簡単なテスト検索を実行
    const testResponse = await braveClient.search('test', { count: 1 });
    return !!testResponse && !!testResponse.results;
  } catch (error) {
    logger.error(`検索ヘルスチェックエラー: ${error.message}`);
    return false;
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
 * @param {Object} apiResponse - BraveSearch APIレスポンス
 * @returns {Object} 処理された検索結果
 */
function processSearchResults(apiResponse) {
  // 検索結果のバリデーション
  if (!apiResponse || !apiResponse.results || !Array.isArray(apiResponse.results)) {
    logger.warn('検索結果の処理: 無効なAPIレスポンス形式');
    return {
      summary: '検索結果を取得できませんでした。',
      sources: []
    };
  }
  
  // 結果がない場合の処理
  if (apiResponse.results.length === 0) {
    return {
      summary: '検索結果はありませんでした。別のキーワードで試してみてください。',
      sources: []
    };
  }
  
  // 結果の整形
  const sources = apiResponse.results.map((result, index) => {
    return {
      index: index + 1,
      title: result.title,
      url: result.url,
      description: result.description,
      hostname: result.source?.name || new URL(result.url).hostname
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
  
  return {
    summary: summaryText,
    sources: sources,
    sourcesList: sourcesList,
    query: apiResponse.query || '',
    totalResults: apiResponse.totalResults || sources.length
  };
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
 * 検索を実行して結果を返す
 * @param {string} query - 検索クエリ
 * @param {Object} options - 検索オプション
 * @returns {Promise<Object>} 検索結果
 */
async function performSearch(query, options = {}) {
  if (!query) {
    return {
      success: false,
      error: 'Empty search query',
      query: query
    };
  }
  
  logger.debug(`検索処理を開始: "${query}"`);
  
  // 検索クライアントの取得
  let searchClient;
  try {
    searchClient = BraveSearchClient.getInstance();
  } catch (error) {
    logger.error(`検索クライアント初期化エラー: ${error.message}`);
    return {
      success: false,
      error: 'Search client initialization failed',
      query: query
    };
  }
  
  // クエリタイプの分析
  const queryType = analyzeQueryType(query);
  
  // 検索実行
  try {
    // デフォルトの検索オプション
    const searchOptions = {
      count: options.count || 5,  // デフォルトで5件
      ...options
    };
    
    // 検索実行
    const results = await searchClient.search(query, searchOptions);
    
    if (!results || !results.web || !results.web.results) {
      logger.warn(`検索 "${query}" で結果が取得できませんでした`);
      return {
        success: false,
        error: 'No search results found',
        query: query,
        queryType
      };
    }
    
    // 検索結果の処理
    const processedResults = processSearchResults(results);
    
    // 検索結果の分析
    const analysisResult = searchProcessor.analyzeSearchResults({
      sources: processedResults.sources,
      query
    });
    
    // AI用に検索結果をフォーマット
    const formattedForAI = searchProcessor.formatSearchResultForAI({
      ...processedResults,
      queryType,
      analysisMetadata: analysisResult
    });
    
    // メタデータメッセージの生成（オプション）
    const metadataMessage = searchProcessor.generateMetadataMessage(analysisResult);
    
    return {
      success: true,
      query,
      queryType,
      ...processedResults,
      formattedForAI: formattedForAI.content,
      analysisMetadata: analysisResult,
      metadataMessage
    };
    
  } catch (error) {
    logger.error(`検索実行エラー: ${error.message}`, error);
    return {
      success: false,
      error: `Search execution failed: ${error.message}`,
      query,
      queryType
    };
  }
}

/**
 * 検索を実行し、結果を処理する
 * @param {string} query - 検索クエリ
 * @returns {Promise<Object>} 処理された検索結果
 */
async function performSearchNew(query) {
  if (!braveClient) {
    return {
      success: false,
      error: '検索サービスが初期化されていません',
      message: '申し訳ありませんが、現在検索機能をご利用いただけません。'
    };
  }
  
  try {
    // クエリを分析
    const queryAnalysis = analyzeSearch(query);
    logger.debug(`検索クエリ分析: ${JSON.stringify(queryAnalysis)}`);
    
    // 検索オプションの設定
    const searchOptions = {
      count: queryAnalysis.resultCount,
      country: queryAnalysis.country,
      language: queryAnalysis.language,
      safeSearch: queryAnalysis.safeSearch
    };
    
    // 検索実行
    const searchResponse = await braveClient.search(queryAnalysis.optimizedQuery, searchOptions);
    
    if (!searchResponse || !searchResponse.results) {
      return {
        success: false,
        error: '検索結果が取得できませんでした',
        message: '検索結果の取得に失敗しました。'
      };
    }
    
    // 検索結果を処理
    const processedResults = processResults(
      searchResponse,
      queryAnalysis.queryType,
      queryAnalysis.originalQuery
    );
    
    return processedResults;
  } catch (error) {
    logger.error(`検索実行エラー: ${error.message}`);
    return {
      success: false,
      error: `検索中にエラーが発生しました: ${error.message}`,
      message: '検索処理中にエラーが発生しました。しばらく経ってからもう一度お試しください。'
    };
  }
}

/**
 * AIに適した形式で検索結果を提供する
 * @param {string} query - 検索クエリ
 * @returns {Promise<Object>} AI用に整形された検索結果
 */
async function provideSearchForAI(query) {
  const result = await performSearchNew(query);
  
  if (!result.success) {
    return {
      success: false,
      content: result.message || '検索に失敗しました。',
      metadataMessage: '[検索エラー]'
    };
  }
  
  return {
    success: true,
    content: result.formattedResults,
    metadataMessage: result.metadataMessage,
    analysis: result.analysis
  };
}

// エクスポート
module.exports = {
  performSearch,
  clearCache,
  checkHealth,
  analyzeQueryType,
  processSearchResults,
  initialize,
  performSearchNew,
  provideSearchForAI
};