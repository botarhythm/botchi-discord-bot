/**
 * ベクトルストア - Bocchy Bot RAGシステム用クライアント
 * 
 * Supabaseのpgvectorを活用したベクトルストア操作を管理するモジュール
 * 
 * @module extensions/rag/vector-store
 */

const logger = require('../../system/logger');
// 既存のSupabaseクライアントを再利用
const supabaseClient = require('../memory/supabase-client');

/**
 * ベクトルストア設定情報
 * @private
 */
const config = {
  tables: {
    knowledgeBase: process.env.SUPABASE_KNOWLEDGE_TABLE || 'knowledge_base',
    knowledgeChunks: process.env.SUPABASE_CHUNKS_TABLE || 'knowledge_chunks'
  },
  // ベクトル検索設定
  search: {
    maxResults: parseInt(process.env.RAG_MAX_RESULTS || '5', 10),
    similarityThreshold: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.8')
  }
};

/**
 * 埋め込みベクトルを保存する
 * @param {string} chunkContent チャンクのテキスト内容
 * @param {Array<number>} embedding 埋め込みベクトル
 * @param {string} knowledgeId 知識ベースID
 * @param {Object} metadata メタデータ
 * @returns {Promise<Object>} 保存結果
 */
async function storeEmbedding(chunkContent, embedding, knowledgeId, metadata = {}) {
  try {
    const client = supabaseClient.getClient();
    const { data, error } = await client
      .from(config.tables.knowledgeChunks)
      .insert({
        knowledge_id: knowledgeId, 
        content: chunkContent,
        embedding,
        metadata
      })
      .select('id')
      .single();

    if (error) throw error;
    
    logger.debug(`Stored embedding for chunk with ID: ${data.id}`);
    return { success: true, id: data.id };
  } catch (error) {
    logger.error(`Failed to store embedding: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 知識ベースにドキュメントを追加する
 * @param {string} title ドキュメントのタイトル
 * @param {string} content ドキュメントの内容
 * @param {Object} metadata メタデータ
 * @returns {Promise<Object>} 保存結果と知識ベースID
 */
async function addKnowledge(title, content, metadata = {}) {
  try {
    const client = supabaseClient.getClient();
    const { data, error } = await client
      .from(config.tables.knowledgeBase)
      .insert({
        title,
        content,
        metadata,
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) throw error;
    
    logger.info(`Added knowledge base entry with ID: ${data.id}`);
    return { success: true, id: data.id };
  } catch (error) {
    logger.error(`Failed to add knowledge: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * ベクトル類似度検索を実行する
 * @param {Array<number>} queryEmbedding クエリの埋め込みベクトル
 * @param {number} limit 最大結果数
 * @param {number} threshold 類似度閾値
 * @returns {Promise<Array>} 検索結果
 */
async function similaritySearch(queryEmbedding, limit = config.search.maxResults, threshold = config.search.similarityThreshold) {
  try {
    const client = supabaseClient.getClient();
    
    // pgvectorを使用した類似度検索
    const { data, error } = await client.rpc('match_chunks', { 
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit
    });

    if (error) throw error;
    
    // 結果が見つからない場合
    if (!data || data.length === 0) {
      logger.debug('No similar chunks found in vector store');
      return [];
    }

    logger.debug(`Found ${data.length} similar chunks in vector store`);
    return data;
  } catch (error) {
    logger.error(`Vector similarity search failed: ${error.message}`);
    
    // 失敗した場合はフォールバックとして空の結果を返す
    return [];
  }
}

/**
 * ベクトルストアの初期化とセットアップ
 * @returns {Promise<Object>} 初期化結果
 */
async function initialize() {
  try {
    // Supabaseクライアントが利用可能か確認
    const client = supabaseClient.getClient();
    logger.info('Vector store initialized with Supabase client');
    
    // ストアードプロシージャのセットアップチェック
    await setupStoredProcedures();
    
    return { status: 'initialized' };
  } catch (error) {
    logger.error(`Failed to initialize vector store: ${error.message}`);
    throw error;
  }
}

/**
 * 必要なストアードプロシージャをセットアップする
 * @private
 */
async function setupStoredProcedures() {
  try {
    const client = supabaseClient.getClient();
    
    // match_chunks関数の作成（存在しない場合のみ）
    const { error } = await client.rpc('create_match_chunks_function', {});
    
    if (error) {
      // 関数が既に存在する場合は無視
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
    
    logger.debug('Vector store stored procedures verified');
  } catch (error) {
    logger.warn(`Stored procedures setup incomplete: ${error.message}`);
    logger.warn('You may need to manually create the match_chunks function');
  }
}

/**
 * ベクトルストアのヘルスチェック
 * @returns {Promise<Object>} ヘルスステータス
 */
async function checkHealth() {
  try {
    const client = supabaseClient.getClient();
    
    // テーブル存在確認
    const { data, error } = await client
      .from(config.tables.knowledgeBase)
      .select('id')
      .limit(1);
    
    if (error) throw error;
    
    return {
      status: 'healthy',
      message: 'Vector store is operational'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Vector store error: ${error.message}`
    };
  }
}

module.exports = {
  initialize,
  storeEmbedding,
  addKnowledge,
  similaritySearch,
  checkHealth,
  config
};