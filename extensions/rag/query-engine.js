/**
 * クエリエンジン - Bocchy Bot RAGシステム用
 * 
 * ユーザークエリを分析し、最適な検索を行うためのモジュール
 * 
 * @module extensions/rag/query-engine
 */

const logger = require('../../system/logger');
const knowledgeBase = require('./knowledge-base');

/**
 * クエリエンジン設定
 * @private
 */
const queryConfig = {
  maxResults: parseInt(process.env.RAG_MAX_RESULTS || '5', 10),
  similarityThreshold: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.75'),
  // コンテキスト設定
  maxContextLength: parseInt(process.env.RAG_MAX_CONTEXT_LENGTH || '2000', 10),
  contextStrategy: process.env.RAG_CONTEXT_STRATEGY || 'top_k', // top_k, threshold, hybrid
  // クエリ拡張設定
  enableQueryExpansion: process.env.RAG_QUERY_EXPANSION !== 'false',
  maxQueryExpansions: parseInt(process.env.RAG_MAX_QUERY_EXPANSIONS || '2', 10)
};

/**
 * ユーザークエリからRAG検索を実行する
 * @param {string} userQuery ユーザーの質問文
 * @returns {Promise<Object>} 検索結果とコンテキスト
 */
async function search(userQuery) {
  try {
    logger.debug(`Processing RAG query: "${userQuery.substring(0, 50)}..."`);
    
    // 質問を前処理
    const processedQuery = preprocessQuery(userQuery);
    
    // クエリ拡張（オプション）
    let queries = [processedQuery];
    if (queryConfig.enableQueryExpansion) {
      const expandedQueries = await expandQuery(processedQuery);
      if (expandedQueries.length > 0) {
        queries = queries.concat(expandedQueries);
      }
    }
    
    // 複数のクエリで検索を実行
    const allResults = [];
    for (const query of queries) {
      const results = await knowledgeBase.searchKnowledge(
        query,
        queryConfig.maxResults,
        queryConfig.similarityThreshold
      );
      
      if (results.length > 0) {
        allResults.push(...results);
      }
    }
    
    // 重複の削除とランキング
    const uniqueResults = deduplicateAndRankResults(allResults);
    
    // 利用可能なコンテキスト長に合わせて結果を選択
    const selectedResults = selectResultsWithinLength(uniqueResults, queryConfig.maxContextLength);
    
    // コンテキストの構築
    const context = buildContextFromResults(selectedResults);
    
    // メタデータの収集
    const metadata = {
      totalResults: allResults.length,
      uniqueResults: uniqueResults.length,
      selectedResults: selectedResults.length,
      contextLength: context.length,
      topSimilarity: selectedResults.length > 0 ? selectedResults[0].similarity : 0
    };
    
    logger.debug(`RAG search complete: ${metadata.selectedResults} results selected for context`);
    
    return {
      context,
      results: selectedResults,
      metadata
    };
  } catch (error) {
    logger.error(`RAG search failed: ${error.message}`);
    return {
      context: '',
      results: [],
      metadata: { error: error.message }
    };
  }
}

/**
 * ユーザークエリを前処理する
 * @private
 * @param {string} query 元のクエリ
 * @returns {string} 前処理済みクエリ
 */
function preprocessQuery(query) {
  // 基本的な前処理
  let processed = query.trim();
  
  // 不要な記号や冗長な表現を削除
  processed = processed
    .replace(/^((教えて|質問|答えて)[、。:：]?)/i, '')
    .replace(/[?？]$/, '');
  
  return processed;
}

/**
 * クエリを拡張する（類似検索向けの別表現を生成）
 * @private
 * @param {string} query 元のクエリ
 * @returns {Promise<Array<string>>} 拡張クエリの配列
 */
async function expandQuery(query) {
  // シンプルな実装: キーワード抽出によるクエリ拡張
  if (!query || query.length < 3) return [];
  
  try {
    // キーワードの抽出
    const keywords = await knowledgeBase.extractKeywords(query);
    
    if (keywords.length < 2) return [];
    
    // キーワードの組み合わせでクエリを拡張
    const expandedQueries = [];
    
    // 主要なキーワードを組み合わせた短いクエリ
    if (keywords.length >= 3) {
      // 先頭3つのキーワード
      expandedQueries.push(keywords.slice(0, 3).join(' '));
      
      // 最初と最後のキーワード
      expandedQueries.push(`${keywords[0]} ${keywords[keywords.length - 1]}`);
    } else if (keywords.length === 2) {
      expandedQueries.push(keywords.join(' '));
    }
    
    // 最大数に制限
    return expandedQueries.slice(0, queryConfig.maxQueryExpansions);
  } catch (error) {
    logger.warn(`Query expansion failed: ${error.message}`);
    return [];
  }
}

/**
 * 検索結果から重複を除去し、類似度でランキングする
 * @private
 * @param {Array<Object>} results 検索結果の配列
 * @returns {Array<Object>} 重複除去・ランキング済みの結果
 */
function deduplicateAndRankResults(results) {
  // コンテンツハッシュによる重複除去
  const uniqueMap = new Map();
  
  for (const result of results) {
    // シンプルな重複検出用にコンテンツの先頭部分をキーとして使用
    const key = result.content.substring(0, 100);
    
    // より高い類似度の結果を優先
    if (!uniqueMap.has(key) || uniqueMap.get(key).similarity < result.similarity) {
      uniqueMap.set(key, result);
    }
  }
  
  // Map から配列に変換
  const uniqueResults = Array.from(uniqueMap.values());
  
  // 類似度でソート（降順）
  return uniqueResults.sort((a, b) => b.similarity - a.similarity);
}

/**
 * 指定された長さ内に収まる結果を選択する
 * @private
 * @param {Array<Object>} results ランキング済みの結果
 * @param {number} maxLength 最大コンテキスト長
 * @returns {Array<Object>} 選択された結果
 */
function selectResultsWithinLength(results, maxLength) {
  const selected = [];
  let totalLength = 0;
  
  for (const result of results) {
    const contentLength = result.content.length;
    
    // まだ容量があれば追加
    if (totalLength + contentLength <= maxLength) {
      selected.push(result);
      totalLength += contentLength;
    } else if (selected.length === 0 && results.length > 0) {
      // 1つも選択できない場合は、最初の結果だけを切り詰めて使用
      const truncatedResult = {
        ...result,
        content: result.content.substring(0, maxLength),
        truncated: true
      };
      selected.push(truncatedResult);
      break;
    } else {
      // 容量不足で追加できない
      break;
    }
  }
  
  return selected;
}

/**
 * 選択された結果からコンテキストを構築する
 * @private
 * @param {Array<Object>} selectedResults 選択された結果
 * @returns {string} AIモデルへのコンテキスト
 */
function buildContextFromResults(selectedResults) {
  if (selectedResults.length === 0) {
    return '';
  }
  
  // 結果からコンテキストを構築
  let context = '参考資料：\n\n';
  
  selectedResults.forEach((result, index) => {
    // コンテンツの前に見出しやメタデータを追加
    const title = result.metadata && result.metadata.title 
      ? result.metadata.title 
      : `情報 ${index + 1}`;
    
    context += `[${title}]\n${result.content}\n\n`;
  });
  
  return context;
}

/**
 * クエリエンジンのヘルスチェック
 * @returns {Promise<Object>} ヘルスステータス
 */
async function checkHealth() {
  try {
    // 依存するナレッジベースのヘルスチェック
    const kbHealth = await knowledgeBase.checkHealth();
    
    if (kbHealth.status === 'healthy' || kbHealth.status === 'degraded') {
      return {
        status: kbHealth.status,
        message: `Query engine is ${kbHealth.status}`,
        details: {
          knowledgeBase: kbHealth
        }
      };
    } else {
      return {
        status: 'unhealthy',
        message: 'Query engine is unhealthy due to knowledge base issues',
        details: {
          knowledgeBase: kbHealth
        }
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Query engine error: ${error.message}`
    };
  }
}

module.exports = {
  search,
  checkHealth,
  config: queryConfig
};