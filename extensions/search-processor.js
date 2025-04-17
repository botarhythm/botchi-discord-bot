/**
 * 検索結果処理モジュール
 * Brave検索結果をAI向けに処理・最適化する
 */
const logger = require('../system/logger');
const { QUERY_TYPES } = require('./search-analyzer');

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
    const results = filterAndFormatResults(searchResults.web.results, queryType);
    
    // 結果のソース情報を抽出
    const sources = extractSources(results);
    
    // クエリタイプと検索結果に基づいて要約を生成
    const summary = generateSummary(results, queryType, searchParams.originalQuery);
    
    // メタ情報の抽出
    const meta = extractMetaInfo(searchResults);
    
    return {
      success: true,
      results,
      summary,
      sources,
      meta,
      totalCount
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
 * 検索結果をフィルタリングして整形する
 * @param {Array} results - 検索結果の配列
 * @param {string} queryType - クエリタイプ
 * @returns {Array} フィルタリング・整形された結果
 */
function filterAndFormatResults(results, queryType) {
  if (!Array.isArray(results)) {
    return [];
  }
  
  // 結果のスコア付け
  const scoredResults = results.map(result => {
    let score = 100; // 基本スコア
    
    // タイトルと説明の長さで加点（適切な長さが良い）
    if (result.title && result.title.length > 20 && result.title.length < 100) {
      score += 10;
    }
    
    if (result.description && result.description.length > 50) {
      score += 15;
    }
    
    // URLの信頼性で加点（ドメインの評価）
    if (result.url) {
      const domain = extractDomain(result.url);
      const trustScore = getDomainTrustScore(domain);
      score += trustScore;
      
      // 日本語クエリの場合は.jpドメインを優先
      if (queryType !== QUERY_TYPES.GENERAL && domain.endsWith('.jp')) {
        score += 5;
      }
    }
    
    // 日付情報がある場合は加点（鮮度が良い）
    if (result.date) {
      const age = getContentAge(result.date);
      if (age < 30) { // 30日以内
        score += 20;
      } else if (age < 180) { // 6ヶ月以内
        score += 10;
      }
      
      // 最新情報検索の場合は日付の新しさを重視
      if (queryType === QUERY_TYPES.RECENT) {
        if (age < 7) { // 1週間以内
          score += 40;
        } else if (age < 30) { // 1ヶ月以内
          score += 20;
        }
      }
    } else if (queryType === QUERY_TYPES.RECENT) {
      // 最新情報なのに日付がない場合は減点
      score -= 30;
    }
    
    // クエリタイプに応じた特別なスコア調整
    switch (queryType) {
      case QUERY_TYPES.FACT:
        // 信頼性の高いドメインを優先
        if (isEducationalDomain(result.url) || isGovernmentDomain(result.url)) {
          score += 25;
        }
        break;
        
      case QUERY_TYPES.HOWTO:
        // ハウツー系はより具体的な説明を優先
        if (result.description && result.description.length > 100) {
          score += 20;
        }
        break;
        
      case QUERY_TYPES.DEFINITION:
        // 定義系は教育機関や辞書サイトを優先
        if (isEducationalDomain(result.url) || isDictionaryDomain(result.url)) {
          score += 30;
        }
        break;
    }
    
    return { ...result, score };
  });
  
  // スコアでソート
  const sortedResults = scoredResults.sort((a, b) => b.score - a.score);
  
  // 結果の整形
  return sortedResults.map(result => ({
    title: result.title || '',
    url: result.url || '',
    description: cleanDescription(result.description || ''),
    score: result.score,
    date: result.date || null,
    domain: extractDomain(result.url || '')
  }));
}

/**
 * 説明文をクリーンアップする
 * @param {string} description - 元の説明文
 * @returns {string} クリーンアップされた説明文
 */
function cleanDescription(description) {
  if (!description) return '';
  
  // HTMLタグ除去
  let cleaned = description.replace(/<[^>]*>/g, '');
  
  // 余分な空白の削除
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // 長すぎる説明の切り詰め
  if (cleaned.length > 300) {
    cleaned = cleaned.substring(0, 297) + '...';
  }
  
  return cleaned;
}

/**
 * URLからドメイン名を抽出する
 * @param {string} url - URL
 * @returns {string} ドメイン名
 */
function extractDomain(url) {
  try {
    if (!url) return '';
    const domain = new URL(url).hostname;
    return domain;
  } catch (e) {
    return '';
  }
}

/**
 * ドメインの信頼性スコアを取得する
 * @param {string} domain - ドメイン名
 * @returns {number} 信頼性スコア（0〜50）
 */
function getDomainTrustScore(domain) {
  if (!domain) return 0;
  
  // 信頼性の高いドメイン（例示）
  const trustDomains = {
    'wikipedia.org': 50,
    'github.com': 45,
    'stackoverflow.com': 45,
    'developer.mozilla.org': 50,
    'docs.microsoft.com': 45,
    'go.dev': 45,
    'python.org': 45,
    'w3.org': 45,
    'arxiv.org': 45,
    'ietf.org': 45,
    'nature.com': 50,
    'science.org': 50,
    'nih.gov': 50,
    'nasa.gov': 50,
    'ed.gov': 45,
    'cdc.gov': 50,
    'who.int': 50,
    'un.org': 45,
    'europa.eu': 45,
    'goo.ne.jp': 40,
    'yahoo.co.jp': 40,
    'nikkei.com': 40,
    'asahi.com': 40,
    'yomiuri.co.jp': 40,
    'mainichi.jp': 40,
    'sankei.com': 40,
    'nhk.or.jp': 45,
    'kyoto-u.ac.jp': 45,
    'u-tokyo.ac.jp': 45,
    'waseda.jp': 45,
    'keio.ac.jp': 45,
    'go.jp': 45
  };
  
  // 完全一致で検索
  if (trustDomains[domain]) {
    return trustDomains[domain];
  }
  
  // 部分一致で検索
  for (const [trustDomain, score] of Object.entries(trustDomains)) {
    if (domain.endsWith('.' + trustDomain) || domain === trustDomain) {
      return score;
    }
  }
  
  // トップレベルドメインによる評価
  if (domain.endsWith('.edu')) return 40;
  if (domain.endsWith('.gov')) return 40;
  if (domain.endsWith('.org')) return 30;
  if (domain.endsWith('.co.jp')) return 30;
  if (domain.endsWith('.ac.jp')) return 35;
  if (domain.endsWith('.go.jp')) return 40;
  if (domain.endsWith('.or.jp')) return 30;
  
  // デフォルトスコア
  return 20;
}

/**
 * 教育機関のドメインかどうか判定
 * @param {string} url - URL
 * @returns {boolean} 教育機関のドメインの場合true
 */
function isEducationalDomain(url) {
  if (!url) return false;
  const domain = extractDomain(url);
  return domain.endsWith('.edu') || 
         domain.endsWith('.ac.jp') || 
         domain.includes('university') || 
         domain.includes('college');
}

/**
 * 政府機関のドメインかどうか判定
 * @param {string} url - URL
 * @returns {boolean} 政府機関のドメインの場合true
 */
function isGovernmentDomain(url) {
  if (!url) return false;
  const domain = extractDomain(url);
  return domain.endsWith('.gov') || 
         domain.endsWith('.go.jp') || 
         domain.endsWith('.gc.ca') || 
         domain.endsWith('.gouv.fr');
}

/**
 * 辞書サイトのドメインかどうか判定
 * @param {string} url - URL
 * @returns {boolean} 辞書サイトのドメインの場合true
 */
function isDictionaryDomain(url) {
  if (!url) return false;
  const domain = extractDomain(url);
  const dictionaryDomains = [
    'dictionary.com', 'merriam-webster.com', 'oxford.com', 
    'cambridge.org', 'weblio.jp', 'goo.ne.jp', 'kotobank.jp', 
    'britannica.com', 'wikipedia.org'
  ];
  
  return dictionaryDomains.some(dictDomain => domain.includes(dictDomain));
}

/**
 * コンテンツの経過日数を計算
 * @param {string} dateString - 日付文字列
 * @returns {number} 経過日数（不明な場合は365）
 */
function getContentAge(dateString) {
  if (!dateString) return 365; // デフォルトは1年前
  
  try {
    const contentDate = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - contentDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch (e) {
    return 365; // 解析エラー時は1年前と仮定
  }
}

/**
 * 検索結果から情報源を抽出する
 * @param {Array} results - 検索結果配列
 * @returns {Array} 情報源配列
 */
function extractSources(results) {
  if (!Array.isArray(results)) {
    return [];
  }
  
  return results.map(result => ({
    title: result.title || 'タイトルなし',
    url: result.url || '',
    domain: result.domain || extractDomain(result.url || '')
  }));
}

/**
 * 検索結果のメタ情報を抽出する
 * @param {Object} searchResults - 検索結果
 * @returns {Object} メタ情報
 */
function extractMetaInfo(searchResults) {
  const meta = {
    totalResults: searchResults.web?.totalCount || 0,
    searchTime: new Date().toISOString(),
    hasMoreResults: false
  };
  
  if (searchResults.web && searchResults.web.results) {
    meta.hasMoreResults = searchResults.web.results.length < meta.totalResults;
  }
  
  return meta;
}

/**
 * クエリタイプに応じた検索結果要約を生成する
 * @param {Array} results - 検索結果配列
 * @param {string} queryType - クエリタイプ
 * @param {string} originalQuery - 元の検索クエリ
 * @returns {string} 要約文
 */
function generateSummary(results, queryType, originalQuery) {
  if (!Array.isArray(results) || results.length === 0) {
    return '検索結果は見つかりませんでした。';
  }
  
  const resultCount = results.length;
  
  // 基本要約情報
  let summary = `「${originalQuery}」に関する検索結果が${resultCount}件見つかりました。`;
  
  // クエリタイプによる要約調整
  switch (queryType) {
    case QUERY_TYPES.FACT:
      summary += '事実に関する情報が見つかりました。';
      break;
      
    case QUERY_TYPES.COMPARISON:
      summary += '比較に関する情報が見つかりました。';
      break;
      
    case QUERY_TYPES.HOWTO:
      summary += '手順や方法に関する情報が見つかりました。';
      break;
      
    case QUERY_TYPES.DEFINITION:
      summary += '定義や説明に関する情報が見つかりました。';
      break;
      
    case QUERY_TYPES.RECENT:
      // 日付情報の抽出
      const latestDate = findLatestDate(results);
      if (latestDate) {
        summary += `最新の情報は${formatDate(latestDate)}のものです。`;
      } else {
        summary += '最新の情報が見つかりました。';
      }
      break;
  }
  
  // 信頼性の高い情報源がある場合
  const trustworthySources = results.filter(r => 
    r.score >= 140 || isEducationalDomain(r.url) || isGovernmentDomain(r.url));
  
  if (trustworthySources.length > 0) {
    summary += '信頼性の高い情報源が含まれています。';
  }
  
  return summary;
}

/**
 * 検索結果から最新の日付を見つける
 * @param {Array} results - 検索結果配列
 * @returns {Date|null} 最新の日付（なければnull）
 */
function findLatestDate(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }
  
  const dates = results
    .filter(r => r.date)
    .map(r => new Date(r.date))
    .filter(d => !isNaN(d.getTime()));
  
  if (dates.length === 0) {
    return null;
  }
  
  return new Date(Math.max(...dates.map(d => d.getTime())));
}

/**
 * 日付のフォーマット（日本語）
 * @param {Date} date - 日付オブジェクト
 * @returns {string} フォーマットされた日付
 */
function formatDate(date) {
  if (!date || !(date instanceof Date)) {
    return '';
  }
  
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  return `${year}年${month}月${day}日`;
}

/**
 * 検索結果をAI応答に適した形式に整形する
 * @param {Object} processedResults - 処理済み検索結果
 * @returns {Object} AI用に整形された結果
 */
function formatResultsForAI(processedResults) {
  if (!processedResults || !processedResults.success) {
    return {
      summary: '検索結果は見つかりませんでした。',
      sources: [],
      hasResults: false
    };
  }
  
  const { summary, results, sources } = processedResults;
  
  // AI用の簡潔な結果情報
  const aiResults = {
    summary,
    sources: sources.slice(0, 5), // 上位5件のソースのみ
    hasResults: results.length > 0,
    topResultsText: results.slice(0, 3).map(r => r.description).join('\n\n')
  };
  
  return aiResults;
}

module.exports = {
  processResults,
  formatResultsForAI
}; 