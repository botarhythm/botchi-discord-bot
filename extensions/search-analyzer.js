/**
 * 検索クエリ分析モジュール
 * ユーザーからの検索クエリをAI向けに最適化する
 */
const logger = require('../system/logger');

// クエリタイプの定数
const QUERY_TYPES = {
  FACT: 'FACT',           // 事実確認
  COMPARISON: 'COMPARISON', // 比較
  HOWTO: 'HOWTO',         // 方法・手順
  DEFINITION: 'DEFINITION', // 定義・説明
  RECENT: 'RECENT',       // 最新情報
  GENERAL: 'GENERAL'      // 一般的な検索
};

/**
 * 検索クエリを分析してタイプを判定する
 * @param {string} query - ユーザーの検索クエリ
 * @returns {Object} クエリ分析結果
 */
function analyzeSearch(query) {
  if (!query || typeof query !== 'string') {
    return {
      originalQuery: '',
      optimizedQuery: '',
      queryType: QUERY_TYPES.GENERAL,
      resultCount: 5,
      language: 'ja_JP',
      country: 'JP',
      safeSearch: 'moderate'
    };
  }

  logger.debug(`検索クエリの分析を開始: "${query}"`);
  
  let queryType = QUERY_TYPES.GENERAL;
  let resultCount = 5; // デフォルトの結果数
  let optimizedQuery = query.trim();
  
  // クエリタイプの判定
  if (containsFactPattern(query)) {
    queryType = QUERY_TYPES.FACT;
    resultCount = 3;
  } else if (containsComparisonPattern(query)) {
    queryType = QUERY_TYPES.COMPARISON;
    resultCount = 4;
  } else if (containsHowToPattern(query)) {
    queryType = QUERY_TYPES.HOWTO;
    resultCount = 5;
  } else if (containsDefinitionPattern(query)) {
    queryType = QUERY_TYPES.DEFINITION;
    resultCount = 3;
  } else if (containsRecentPattern(query)) {
    queryType = QUERY_TYPES.RECENT;
    resultCount = 6;
    optimizedQuery = addRecentIndicator(optimizedQuery);
  }
  
  // 日本語クエリの場合は結果を少し増やす（日本語は情報量が少ないため）
  if (isJapaneseQuery(query) && resultCount < 6) {
    resultCount++;
  }
  
  // クエリの最適化
  optimizedQuery = optimizeQuery(optimizedQuery, queryType);
  
  const result = {
    originalQuery: query,
    optimizedQuery: optimizedQuery,
    queryType: queryType,
    resultCount: resultCount,
    language: 'ja_JP',
    country: 'JP',
    safeSearch: 'moderate'
  };
  
  logger.debug(`検索クエリ分析結果: ${JSON.stringify(result)}`);
  return result;
}

/**
 * 事実確認のパターンを含むかチェック
 * @param {string} query - 検索クエリ
 * @returns {boolean} 事実確認っぽい質問かどうか
 */
function containsFactPattern(query) {
  const patterns = [
    /いつ/,
    /どこ/,
    /誰が/,
    /何人/,
    /いくら/,
    /どのくらい/,
    /は本当/,
    /事実/,
    /確認/,
    /は存在/,
    /あるの/,
    /ですか$/,
    /でしょうか$/,
    /何年/,
    /何月/,
    /正しい/
  ];
  
  return patterns.some(pattern => pattern.test(query));
}

/**
 * 比較パターンを含むかチェック
 * @param {string} query - 検索クエリ
 * @returns {boolean} 比較っぽい質問かどうか
 */
function containsComparisonPattern(query) {
  const patterns = [
    /と.*の違い/,
    /の違い/,
    /比較/,
    /比べて/,
    /どっちが/,
    /vs/i,
    /versus/i,
    /良い悪い/,
    /メリット.*デメリット/,
    /長所.*短所/,
    /どちらが/,
    /と.*どちらが/
  ];
  
  return patterns.some(pattern => pattern.test(query));
}

/**
 * 手順・方法のパターンを含むかチェック
 * @param {string} query - 検索クエリ
 * @returns {boolean} 手順に関する質問かどうか
 */
function containsHowToPattern(query) {
  const patterns = [
    /方法/,
    /やり方/,
    /手順/,
    /するには/,
    /するためには/,
    /する方法/,
    /作り方/,
    /使い方/,
    /どうやって/,
    /手続き/,
    /設定方法/,
    /インストール方法/,
    /導入方法/
  ];
  
  return patterns.some(pattern => pattern.test(query));
}

/**
 * 定義・説明のパターンを含むかチェック
 * @param {string} query - 検索クエリ
 * @returns {boolean} 定義に関する質問かどうか
 */
function containsDefinitionPattern(query) {
  const patterns = [
    /とは/,
    /って何/,
    /とは何/,
    /の意味/,
    /の定義/,
    /について/,
    /の説明/,
    /の概要/,
    /基本/,
    /原理/,
    /仕組み/,
    /どういうもの/
  ];
  
  return patterns.some(pattern => pattern.test(query));
}

/**
 * 最新情報パターンを含むかチェック
 * @param {string} query - 検索クエリ
 * @returns {boolean} 最新情報に関する質問かどうか
 */
function containsRecentPattern(query) {
  const patterns = [
    /最近/,
    /最新/,
    /ニュース/,
    /新しい/,
    /アップデート/,
    /速報/,
    /今日/,
    /今週/,
    /今月/,
    /今年/,
    /昨日/,
    /先週/,
    /先月/,
    /リリース/,
    /発表/,
    /〜について.*最新/
  ];
  
  return patterns.some(pattern => pattern.test(query));
}

/**
 * 日本語クエリかどうかを判定
 * @param {string} query - 検索クエリ
 * @returns {boolean} 日本語クエリかどうか
 */
function isJapaneseQuery(query) {
  // 日本語の文字（ひらがな、カタカナ、漢字）が含まれているか
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(query);
}

/**
 * 最新情報の検索語句を最適化
 * @param {string} query - 検索クエリ
 * @returns {string} 最適化されたクエリ
 */
function addRecentIndicator(query) {
  // すでに最新キーワードが含まれている場合は追加しない
  if (/最新|最近|今日|今週|今月|今年|ニュース|速報/.test(query)) {
    return query;
  }
  
  // 末尾に「最新情報」を追加（スペースを含めて）
  return `${query} 最新情報`;
}

/**
 * クエリタイプに基づいてクエリを最適化する
 * @param {string} query - 元のクエリ
 * @param {string} queryType - クエリタイプ
 * @returns {string} 最適化されたクエリ
 */
function optimizeQuery(query, queryType) {
  let optimized = query;
  
  switch (queryType) {
    case QUERY_TYPES.FACT:
      // 疑問形や余分な言葉を取り除く
      optimized = optimized.replace(/ですか\??$|でしょうか\??$/g, '');
      optimized = optimized.replace(/教えて(ください)?$/, '');
      break;
      
    case QUERY_TYPES.COMPARISON:
      // 「AとBの違い」のようなパターンを「A B 違い 比較」に最適化
      if (optimized.includes('と') && optimized.includes('違い')) {
        const parts = optimized.split('と');
        if (parts.length === 2) {
          const secondPart = parts[1].replace(/の違い.*$/, '');
          optimized = `${parts[0]} ${secondPart} 違い 比較`;
        }
      }
      break;
      
    case QUERY_TYPES.HOWTO:
      // 「〜する方法」を「〜 方法 手順」に最適化
      optimized = optimized.replace(/するには.*$/, ' 方法 手順');
      optimized = optimized.replace(/する方法.*$/, ' 方法 手順');
      break;
      
    case QUERY_TYPES.DEFINITION:
      // 「〜とは」を「〜 意味 定義」に最適化
      optimized = optimized.replace(/とは.*$/, ' 意味 定義');
      optimized = optimized.replace(/って何.*$/, ' 意味 定義');
      break;
      
    default:
      // 一般的なクエリはそのまま
      break;
  }
  
  return optimized;
}

module.exports = {
  analyzeSearch,
  QUERY_TYPES
}; 