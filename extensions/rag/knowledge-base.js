/**
 * ナレッジベース管理モジュール - Bocchy Bot RAGシステム用
 * 
 * 知識ベースの保存、取得、検索、更新を行うモジュール
 * チャンク化と埋め込み生成を組み合わせて知識を管理する
 * 
 * @module extensions/rag/knowledge-base
 */

const logger = require('../../system/logger');
const vectorStore = require('./vector-store');
const embeddings = require('./embeddings');
const chunkManager = require('./chunk-manager');

/**
 * ナレッジベースにドキュメントを追加する
 * @param {string} title ドキュメントのタイトル
 * @param {string} content ドキュメントの内容
 * @param {Object} metadata メタデータ
 * @param {Object} options チャンク設定オプション
 * @returns {Promise<Object>} 追加結果
 */
async function addDocument(title, content, metadata = {}, options = {}) {
  try {
    logger.info(`Adding document to knowledge base: "${title}" (${content.length} chars)`);

    // 1. ドキュメントをナレッジベースに保存
    const knowledgeResult = await vectorStore.addKnowledge(title, content, metadata);
    if (!knowledgeResult.success) {
      throw new Error(`Failed to add document to knowledge base: ${knowledgeResult.error}`);
    }
    
    const knowledgeId = knowledgeResult.id;
    
    // 2. コンテンツをチャンクに分割
    const chunks = chunkManager.createChunksWithMetadata(
      content,
      { 
        title,
        knowledgeId,
        ...metadata
      },
      options
    );
    
    logger.debug(`Document split into ${chunks.length} chunks for processing`);
    
    // 3. 各チャンクの埋め込みを生成し保存
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        // 埋め込みを生成
        const embedding = await embeddings.generateEmbedding(chunk.content);
        
        // ベクトルストアに保存
        const result = await vectorStore.storeEmbedding(
          chunk.content,
          embedding,
          knowledgeId,
          chunk.metadata
        );
        
        return {
          chunkId: result.id,
          success: result.success,
          error: result.error
        };
      })
    );
    
    // 成功と失敗のカウント
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    
    logger.info(`Document "${title}" processed: ${successCount} chunks added, ${failureCount} failed`);
    
    return {
      success: successCount > 0,
      knowledgeId,
      totalChunks: chunks.length,
      successfulChunks: successCount,
      failedChunks: failureCount
    };
  } catch (error) {
    logger.error(`Error adding document to knowledge base: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * テキストクエリに基づいて関連知識を検索する
 * @param {string} query 検索クエリテキスト
 * @param {number} maxResults 最大結果数
 * @param {number} similarityThreshold 類似度閾値
 * @returns {Promise<Array<Object>>} 検索結果
 */
async function searchKnowledge(query, maxResults = 5, similarityThreshold = 0.75) {
  try {
    // 入力クエリの前処理
    const processedQuery = query.trim();
    
    if (!processedQuery) {
      logger.warn('Empty query provided for knowledge search');
      return [];
    }
    
    // クエリの埋め込みを生成
    const queryEmbedding = await embeddings.generateEmbedding(processedQuery);
    
    // ベクトル検索を実行
    const searchResults = await vectorStore.similaritySearch(
      queryEmbedding,
      maxResults,
      similarityThreshold
    );
    
    logger.debug(`Knowledge search for "${query.substring(0, 30)}..." returned ${searchResults.length} results`);
    
    // 検索結果を整形
    return searchResults.map(result => ({
      content: result.content,
      knowledgeId: result.knowledge_id,
      metadata: result.metadata,
      similarity: result.similarity
    }));
  } catch (error) {
    logger.error(`Knowledge search failed: ${error.message}`);
    return [];
  }
}

/**
 * テキストから重要なキーワードを抽出する（検索クエリ生成用）
 * @param {string} text 対象テキスト
 * @returns {Promise<Array<string>>} 抽出されたキーワード
 */
async function extractKeywords(text) {
  // シンプルな実装: スペースで区切ってストップワードを除外
  const stopWords = [
    'は', 'を', 'に', 'で', 'と', 'が', 'の', 'や', 'へ', 'から', 'より',
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from'
  ];
  
  const words = text.toLowerCase()
    .replace(/[.,!?;:()\[\]{}]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 1 && !stopWords.includes(word));
  
  // 重複を削除
  return [...new Set(words)];
}

/**
 * ナレッジベースモジュールの初期化
 * @returns {Promise<Object>} 初期化結果
 */
async function initialize() {
  try {
    // 依存モジュールの初期化
    await vectorStore.initialize();
    await embeddings.initialize();
    
    logger.info('Knowledge base system initialized successfully');
    return { status: 'initialized' };
  } catch (error) {
    logger.error(`Failed to initialize knowledge base: ${error.message}`);
    throw error;
  }
}

/**
 * ナレッジベースのヘルスチェック
 * @returns {Promise<Object>} ヘルスステータス
 */
async function checkHealth() {
  try {
    // 各コンポーネントのヘルスチェック
    const vectorStoreHealth = await vectorStore.checkHealth();
    const embeddingsHealth = await embeddings.checkHealth();
    
    // 全てのコンポーネントが正常であればシステム全体も正常
    if (vectorStoreHealth.status === 'healthy' && embeddingsHealth.status === 'healthy') {
      return {
        status: 'healthy',
        message: 'Knowledge base system is operational',
        components: {
          vectorStore: vectorStoreHealth,
          embeddings: embeddingsHealth
        }
      };
    } else {
      // 一部のコンポーネントが異常
      return {
        status: 'degraded',
        message: 'Knowledge base system is partially operational',
        components: {
          vectorStore: vectorStoreHealth,
          embeddings: embeddingsHealth
        }
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Knowledge base error: ${error.message}`
    };
  }
}

module.exports = {
  initialize,
  addDocument,
  searchKnowledge,
  extractKeywords,
  checkHealth
};