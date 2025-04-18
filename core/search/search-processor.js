/**
 * 検索結果プロセッサー
 * Google Search APIの検索結果を処理して整形するモジュール
 */

const logger = require('../../system/logger');

/**
 * 検索結果を処理する
 * @param {Object} searchResult - Google Search APIからの検索結果
 * @param {Object} queryType - 検索クエリのタイプ情報
 * @param {string} originalQuery - 元の検索クエリ
 * @returns {Object} 処理された検索結果
 */
function processResults(searchResult, queryType = {}, originalQuery = '') {
  try {
    // 検索結果が無効な場合
    if (!searchResult || !searchResult.success) {
      return {
        success: false,
        error: searchResult?.error || '検索結果がありません',
        formattedResults: '検索結果を取得できませんでした。',
        originalQuery: originalQuery || searchResult?.query || ''
      };
    }
    
    // 検索結果が空の場合
    const items = searchResult.items || [];
    if (items.length === 0) {
      return {
        success: true,
        formattedResults: `「${originalQuery || searchResult.query}」の検索結果はありませんでした。`,
        originalQuery: originalQuery || searchResult.query,
        queryType: queryType
      };
    }
    
    // 検索結果の件数を制限（最大5件）
    const limitedItems = items.slice(0, 5);
    
    // 検索結果テキストの作成
    let resultText = `「${originalQuery || searchResult.query}」の検索結果:\n\n`;
    
    // クエリタイプに応じた書式設定
    if (queryType.isDefinitionQuery) {
      resultText = formatDefinitionResults(limitedItems, originalQuery || searchResult.query);
    } else if (queryType.isHowToQuery) {
      resultText = formatHowToResults(limitedItems, originalQuery || searchResult.query);
    } else if (queryType.isCurrentInfoQuery) {
      resultText = formatCurrentInfoResults(limitedItems, originalQuery || searchResult.query);
    } else if (queryType.isLocalQuery) {
      resultText = formatLocalResults(limitedItems, originalQuery || searchResult.query);
    } else if (queryType.isFactCheckQuery) {
      resultText = formatFactCheckResults(limitedItems, originalQuery || searchResult.query);
    } else {
      // 一般的な検索結果
      limitedItems.forEach((item, index) => {
        resultText += `**${index + 1}. ${item.title}**\n`;
        resultText += `${item.snippet}\n`;
        resultText += `🔗 ${item.link}\n\n`;
      });
    }
    
    // 出典リストを作成
    const sourcesList = limitedItems.map((item, index) => 
      `[${index + 1}] ${item.title} (${new URL(item.link).hostname})`
    ).join('\n');
    
    // 検索結果の処理結果を返す
    return {
      success: true,
      formattedResults: resultText,
      sourcesList: sourcesList,
      sources: limitedItems,
      totalResults: searchResult.totalResults || limitedItems.length,
      originalQuery: originalQuery || searchResult.query,
      queryType: queryType
    };
    
  } catch (error) {
    logger.error(`検索結果の処理中にエラーが発生しました: ${error.message}`);
    return {
      success: false,
      error: `検索結果の処理中にエラーが発生: ${error.message}`,
      formattedResults: 'エラーにより検索結果を表示できません。',
      originalQuery: originalQuery || searchResult?.query || ''
    };
  }
}

/**
 * 定義系検索のフォーマット
 */
function formatDefinitionResults(items, query) {
  let text = `「${query}」の定義:\n\n`;
  
  items.forEach((item, index) => {
    text += `**${index + 1}. ${item.title}**\n`;
    text += `${item.snippet}\n`;
    text += `🔗 ${item.link}\n\n`;
  });
  
  return text;
}

/**
 * ハウツー系検索のフォーマット
 */
function formatHowToResults(items, query) {
  let text = `「${query}」の方法:\n\n`;
  
  items.forEach((item, index) => {
    text += `**${index + 1}. ${item.title}**\n`;
    text += `${item.snippet}\n`;
    text += `🔗 ${item.link}\n\n`;
  });
  
  return text;
}

/**
 * 時事情報系検索のフォーマット
 */
function formatCurrentInfoResults(items, query) {
  let text = `「${query}」に関する最新情報:\n\n`;
  
  items.forEach((item, index) => {
    text += `**${index + 1}. ${item.title}**\n`;
    text += `${item.snippet}\n`;
    text += `🔗 ${item.link}\n\n`;
  });
  
  return text;
}

/**
 * 位置情報系検索のフォーマット
 */
function formatLocalResults(items, query) {
  let text = `「${query}」の場所情報:\n\n`;
  
  items.forEach((item, index) => {
    text += `**${index + 1}. ${item.title}**\n`;
    text += `${item.snippet}\n`;
    text += `🔗 ${item.link}\n\n`;
  });
  
  return text;
}

/**
 * 事実確認系検索のフォーマット
 */
function formatFactCheckResults(items, query) {
  let text = `「${query}」についての事実確認:\n\n`;
  
  items.forEach((item, index) => {
    text += `**${index + 1}. ${item.title}**\n`;
    text += `${item.snippet}\n`;
    text += `🔗 ${item.link}\n\n`;
  });
  
  return text;
}

/**
 * 検索結果をAI用に整形する
 * @param {Object} result - 処理された検索結果
 * @returns {Object} AI用に整形された結果
 */
function formatSearchResultForAI(result) {
  if (!result || !result.success) {
    return {
      content: '検索結果を取得できませんでした。',
      metadata: {}
    };
  }
  
  // ベースとなるフォーマット文字列
  let formattedContent = `### 「${result.originalQuery}」の検索結果\n\n`;
  
  // ソースリストがある場合はそれを追加
  if (result.sources && result.sources.length > 0) {
    result.sources.forEach((source, index) => {
      formattedContent += `**【${index + 1}】 ${source.title}**\n`;
      formattedContent += `${source.snippet}\n`;
      formattedContent += `出典: ${source.link}\n\n`;
    });
  } else {
    formattedContent += "関連する情報は見つかりませんでした。";
  }
  
  return {
    content: formattedContent,
    metadata: {
      queryType: result.queryType,
      totalResults: result.totalResults,
      analysisMetadata: result.analysisMetadata
    }
  };
}

/**
 * 分析メタデータのメッセージを生成する
 * @param {Object} analysisMetadata - 分析メタデータ
 * @returns {string} メタデータメッセージ
 */
function generateMetadataMessage(analysisMetadata) {
  if (!analysisMetadata) return '';
  
  let message = '';
  
  if (analysisMetadata.isTimeSensitive) {
    message += '[時事性の高い情報]';
  }
  
  if (analysisMetadata.isFactual) {
    if (message) message += ' ';
    message += '[事実情報]';
  }
  
  if (analysisMetadata.isOpinion) {
    if (message) message += ' ';
    message += '[意見情報あり]';
  }
  
  if (analysisMetadata.hasContradictions) {
    if (message) message += ' ';
    message += '[情報に矛盾あり]';
  }
  
  return message;
}

module.exports = {
  processResults,
  formatSearchResultForAI,
  generateMetadataMessage
}; 