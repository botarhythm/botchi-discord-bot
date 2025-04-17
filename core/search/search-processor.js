/**
 * 検索結果処理モジュール
 * Brave検索結果をAIが利用しやすい形式に変換する
 */
const logger = require('../../system/logger');
const { QUERY_TYPES } = require('../../extensions/search-analyzer');

/**
 * 検索結果をAI用に整形する
 * @param {Array} results - 検索結果の配列
 * @param {string} queryType - 検索クエリのタイプ
 * @returns {string} AI用に整形された検索結果
 */
function formatSearchResultForAI(results, queryType) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return '検索結果が見つかりませんでした。';
  }
  
  // 結果数を制限（最大10件）
  const limitedResults = results.slice(0, 10);
  
  // クエリタイプに応じた結果の整形
  let formattedContent = '';
  
  switch (queryType) {
    case QUERY_TYPES.FACT:
      // 事実確認用の整形 - より簡潔で信頼性が高そうな情報源を優先
      formattedContent = limitedResults.map((result, index) => {
        return `[情報源 ${index + 1}] ${result.title}\n${result.description}\n出典: ${result.url}\n`;
      }).join('\n');
      break;
      
    case QUERY_TYPES.COMPARISON:
      // 比較用の整形 - 複数の情報源からの比較ポイントを強調
      formattedContent = `# 比較情報\n\n`;
      formattedContent += limitedResults.map((result, index) => {
        return `## 情報源 ${index + 1}: ${result.title}\n${result.description}\n出典: ${result.url}\n`;
      }).join('\n');
      break;
      
    case QUERY_TYPES.HOWTO:
      // 手順・方法用の整形 - ステップバイステップの情報を優先
      formattedContent = `# 手順・方法\n\n`;
      formattedContent += limitedResults.map((result, index) => {
        return `## 方法 ${index + 1}: ${result.title}\n${result.description}\n出典: ${result.url}\n`;
      }).join('\n');
      break;
      
    case QUERY_TYPES.DEFINITION:
      // 定義・説明用の整形 - 簡潔な定義から詳細な説明へ
      formattedContent = `# 定義・説明\n\n`;
      formattedContent += limitedResults.map((result, index) => {
        return `## 定義 ${index + 1}: ${result.title}\n${result.description}\n出典: ${result.url}\n`;
      }).join('\n');
      break;
      
    case QUERY_TYPES.RECENT:
      // 最新情報用の整形 - 日付情報を強調
      formattedContent = `# 最新情報\n\n`;
      formattedContent += limitedResults.map((result, index) => {
        // 日付がある場合は強調
        const hasDate = /\b\d{4}[-/年]\d{1,2}[-/月]\d{1,2}\b|\b\d{1,2}[-/月]\d{1,2}\b/.test(result.description);
        const dateInfo = hasDate ? '（日付情報あり）' : '';
        
        return `## 情報 ${index + 1}${dateInfo}: ${result.title}\n${result.description}\n出典: ${result.url}\n`;
      }).join('\n');
      break;
      
    default:
      // 一般的な検索結果の整形
      formattedContent = limitedResults.map((result, index) => {
        return `[結果 ${index + 1}] ${result.title}\n${result.description}\n出典: ${result.url}\n`;
      }).join('\n');
  }
  
  return formattedContent;
}

/**
 * 検索結果の信頼性と多様性を分析する
 * @param {Array} results - 検索結果の配列
 * @returns {Object} 分析結果
 */
function analyzeSearchResults(results) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return {
      reliability: 'low',
      diversity: 'none',
      freshness: 'unknown',
      domains: []
    };
  }
  
  // ドメインの多様性をチェック
  const domains = new Set();
  const domainList = [];
  
  results.forEach(result => {
    try {
      const url = new URL(result.url);
      const domain = url.hostname;
      domains.add(domain);
      domainList.push(domain);
    } catch (e) {
      logger.error(`URL解析エラー: ${e.message}`);
    }
  });
  
  // 信頼性の評価（結果数とドメインの多様性に基づく）
  let reliability = 'medium';
  if (results.length >= 5 && domains.size >= 3) {
    reliability = 'high';
  } else if (results.length <= 2 || domains.size === 1) {
    reliability = 'low';
  }
  
  // 多様性の評価
  let diversity = 'medium';
  if (domains.size >= 4) {
    diversity = 'high';
  } else if (domains.size <= 2) {
    diversity = 'low';
  }
  
  // 日付情報があるかチェック
  const hasDateInfo = results.some(result => {
    return /\b\d{4}[-/年]\d{1,2}[-/月]\d{1,2}\b|\b\d{1,2}[-/月]\d{1,2}\b/.test(result.title + result.description);
  });
  
  // 最新情報かどうかを評価
  const freshness = hasDateInfo ? 'available' : 'unknown';
  
  return {
    reliability,
    diversity,
    freshness,
    domains: Array.from(domains)
  };
}

/**
 * 分析結果からメタデータメッセージを生成する
 * @param {Object} analysis - 分析結果
 * @param {number} resultCount - 検索結果数
 * @returns {string} メタデータメッセージ
 */
function generateMetadataMessage(analysis, resultCount) {
  const reliabilityMap = {
    high: '高い信頼性',
    medium: '中程度の信頼性',
    low: '限定的な信頼性'
  };
  
  const diversityMap = {
    high: '多様な情報源',
    medium: 'いくつかの情報源',
    low: '限られた情報源',
    none: '情報源なし'
  };
  
  const freshnessMap = {
    available: '日付情報あり',
    unknown: '日付情報なし'
  };
  
  let message = `[検索メタデータ: ${resultCount}件の結果、${reliabilityMap[analysis.reliability]}、${diversityMap[analysis.diversity]}、${freshnessMap[analysis.freshness]}]`;
  
  return message;
}

/**
 * 検索結果を総合的に処理する
 * @param {Object} searchResponse - 検索API応答
 * @param {string} queryType - 検索クエリのタイプ
 * @param {string} originalQuery - 元の検索クエリ
 * @returns {Object} 処理結果
 */
function processResults(searchResponse, queryType, originalQuery) {
  try {
    if (!searchResponse || !searchResponse.results || !Array.isArray(searchResponse.results)) {
      return {
        success: false,
        error: '有効な検索結果が提供されていません',
        message: '検索結果を取得できませんでした。'
      };
    }
    
    const results = searchResponse.results;
    const resultCount = results.length;
    
    // 結果がない場合
    if (resultCount === 0) {
      return {
        success: true,
        formattedResults: '検索結果が見つかりませんでした。',
        metadataMessage: '[検索結果: 0件]',
        analysis: {
          reliability: 'none',
          diversity: 'none',
          freshness: 'unknown',
          domains: []
        }
      };
    }
    
    // 結果の分析
    const analysis = analyzeSearchResults(results);
    
    // メタデータメッセージの生成
    const metadataMessage = generateMetadataMessage(analysis, resultCount);
    
    // 結果の整形
    const formattedResults = formatSearchResultForAI(results, queryType);
    
    logger.debug(`検索結果処理完了: ${resultCount}件、信頼性=${analysis.reliability}、多様性=${analysis.diversity}`);
    
    return {
      success: true,
      formattedResults,
      metadataMessage,
      analysis,
      resultCount,
      originalQuery
    };
  } catch (error) {
    logger.error(`検索結果処理エラー: ${error.message}`);
    return {
      success: false,
      error: `検索結果の処理中にエラーが発生しました: ${error.message}`,
      message: '検索結果の処理中にエラーが発生しました。'
    };
  }
}

module.exports = {
  formatSearchResultForAI,
  analyzeSearchResults,
  generateMetadataMessage,
  processResults
}; 