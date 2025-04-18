/**
 * 検索結果処理モジュール
 * Brave検索結果をAI向けに処理・最適化する
 */
const logger = require('../system/logger');
const { QUERY_TYPES } = require('./search-analyzer');
const dateHandler = require('./date-handler');

/**
 * 検索結果を処理する
 * @param {Object} searchResults - Brave検索API結果
 * @param {Object} searchParams - 検索パラメータ
 * @returns {Object} 処理済み検索結果
 */
function processResults(searchResults, searchParams) {
  if (!searchResults || !searchResults.web || !searchResults.web.results) {
    logger.error('検索結果が無効または空です');
    return {
      success: false,
      error: '検索結果が見つかりませんでした',
      results: [],
      summary: '検索結果はありません',
      sources: []
    };
  }

  logger.debug(`検索結果の処理を開始: ${searchResults.web.results.length}件の結果`);
  
  try {
    // 結果の基本情報
    const totalCount = searchResults.web.totalCount || 0;
    const queryType = searchParams.queryType || QUERY_TYPES.GENERAL;
    
    // 日付関連のクエリかどうかを判定
    const isDateRelated = dateHandler.isDateRelatedQuery(searchParams.originalQuery);
    const dateInfo = isDateRelated ? dateHandler.formatDateForAI(dateHandler.getCurrentJapanTime()) : null;
    
    // 結果のフィルタリングとフォーマット
    const results = filterAndFormatResults(searchResults.web.results, queryType, dateInfo);
    
    // 結果のソース情報を抽出
    const sources = extractSources(results);
    
    // クエリタイプと検索結果に基づいて要約を生成
    const summary = generateSummary(results, queryType, searchParams.originalQuery, dateInfo);
    
    // メタ情報の抽出
    const meta = extractMetaInfo(searchResults);
    
    return {
      success: true,
      results,
      summary,
      sources,
      meta,
      totalCount,
      dateInfo
    };
  } catch (error) {
    logger.error(`検索結果の処理中にエラーが発生: ${error.message}`);
    return {
      success: false,
      error: `検索結果の処理中にエラーが発生: ${error.message}`,
      results: [],
      summary: '検索結果の処理中にエラーが発生しました',
      sources: []
    };
  }
}

/**
 * 検索結果をAI用に整形する
 * @param {Array} results - 検索結果の配列
 * @param {string} queryType - 検索クエリのタイプ
 * @param {Object} dateInfo - 日付情報（オプション）
 * @returns {string} AI用に整形された検索結果
 */
function formatSearchResultForAI(results, queryType, dateInfo = null) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return '検索結果が見つかりませんでした。';
  }
  
  // 日付関連のクエリの場合、現在の日付情報を追加
  let context = '';
  if (dateInfo) {
    context = `[現在の日本時間: ${dateInfo.year}年${dateInfo.month}月${dateInfo.day}日(${dateInfo.weekday}) ${dateInfo.hour}時${dateInfo.minute}分]\n\n`;
  }
  
  // クエリタイプに応じた結果の整形
  let formattedContent = context;
  const limitedResults = results.slice(0, 5); // 結果数を制限
  
  limitedResults.forEach((result, index) => {
    // 各結果の情報を構造化
    const sourceInfo = {
      title: result.title,
      url: result.url,
      description: result.description,
      hostname: new URL(result.url).hostname
    };
    
    // 自然な形式で結果を追加
    formattedContent += `【情報源${index + 1}】\n`;
    formattedContent += `タイトル: ${sourceInfo.title}\n`;
    formattedContent += `内容: ${sourceInfo.description}\n`;
    formattedContent += `出典: ${sourceInfo.hostname}\n`;
    formattedContent += `URL: ${sourceInfo.url}\n\n`; // URLを明示的に表示
  });
  
  return formattedContent;
}

/**
 * 検索結果をフィルタリングしてフォーマットする
 * @param {Array} results - 検索結果の配列
 * @param {string} queryType - クエリタイプ
 * @param {Object} dateInfo - 日付情報（オプション）
 * @returns {Array} フィルタリング・フォーマットされた結果
 */
function filterAndFormatResults(results, queryType, dateInfo = null) {
  return results.map(result => {
    // 説明文が長すぎる場合は切り詰める
    if (result.description && result.description.length > 500) {
      result.description = result.description.substring(0, 497) + '...';
    }
    
    // 日付情報がある場合は、結果に追加
    if (dateInfo) {
      result.dateInfo = dateInfo;
    }
    
    return result;
  });
}

/**
 * 検索結果からソース情報を抽出する
 * @param {Array} results - 検索結果の配列
 * @returns {Array} ソース情報の配列
 */
function extractSources(results) {
  return results.map((result, index) => ({
    index: index + 1,
    title: result.title,
    url: result.url,
    description: result.description,
    hostname: result.source?.name || new URL(result.url).hostname
  }));
}

/**
 * 検索結果の要約を生成する
 * @param {Array} results - 検索結果の配列
 * @param {string} queryType - クエリタイプ
 * @param {string} originalQuery - 元の検索クエリ
 * @param {Object} dateInfo - 日付情報（オプション）
 * @returns {string} 生成された要約
 */
function generateSummary(results, queryType, originalQuery, dateInfo = null) {
  let summary = '';
  
  // 日付情報がある場合は要約に追加
  if (dateInfo) {
    summary += `現在の日本時間: ${dateInfo.year}年${dateInfo.month}月${dateInfo.day}日(${dateInfo.weekday}) ${dateInfo.hour}時${dateInfo.minute}分\n\n`;
  }
  
  // クエリタイプに応じた要約を生成
  switch (queryType) {
    case QUERY_TYPES.FACT:
      summary += `「${originalQuery}」に関する事実情報:\n`;
      break;
    case QUERY_TYPES.COMPARISON:
      summary += `「${originalQuery}」の比較情報:\n`;
      break;
    case QUERY_TYPES.HOWTO:
      summary += `「${originalQuery}」の手順や方法:\n`;
      break;
    case QUERY_TYPES.DEFINITION:
      summary += `「${originalQuery}」の定義や説明:\n`;
      break;
    case QUERY_TYPES.RECENT:
      summary += `「${originalQuery}」の最新情報:\n`;
      break;
    default:
      summary += `「${originalQuery}」の検索結果:\n`;
  }
  
  // 上位3件の結果を要約に追加
  results.slice(0, 3).forEach((result, index) => {
    summary += `${index + 1}. ${result.title}\n`;
    summary += `   ${result.description}\n`;
    summary += `   出典: ${new URL(result.url).hostname}\n`;
    summary += `   URL: ${result.url}\n\n`; // URLを明示的に表示
  });
  
  return summary;
}

/**
 * 検索結果からメタ情報を抽出する
 * @param {Object} searchResults - 検索結果オブジェクト
 * @returns {Object} 抽出されたメタ情報
 */
function extractMetaInfo(searchResults) {
  return {
    totalResults: searchResults.web?.totalCount || 0,
    query: searchResults.query || '',
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  processResults,
  formatSearchResultForAI,
  filterAndFormatResults,
  extractSources,
  generateSummary,
  extractMetaInfo
}; 