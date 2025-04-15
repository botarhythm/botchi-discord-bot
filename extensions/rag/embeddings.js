/**
 * 埋め込み生成モジュール - Bocchy Bot RAGシステム用
 * 
 * OpenAI Embeddings APIを使用してテキストの埋め込みベクトルを生成するモジュール
 * 
 * @module extensions/rag/embeddings
 */

const logger = require('../../system/logger');
const config = require('../../config/env');
// OpenAI SDKは既存のものを再利用
const { OpenAI } = require('openai');

/**
 * OpenAI APIクライアント
 * @private
 */
let openaiClient = null;

/**
 * 埋め込み生成の設定
 * @private
 */
const embeddingConfig = {
  model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10),
  // 再試行設定
  maxRetries: 3,
  retryDelay: 1000,
  // レート制限設定
  maxTokensPerMinute: 100000, // 安全マージン込み
  tokensUsed: 0,
  resetTime: null
};

/**
 * OpenAI APIクライアントを初期化する
 * @private
 * @returns {Object} 初期化されたOpenAIクライアント
 * @throws {Error} APIキーが設定されていない場合
 */
function initializeClient() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key must be set in environment variables');
    }

    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    logger.info('OpenAI embeddings client initialized successfully');
    return openaiClient;
  } catch (error) {
    logger.error(`Failed to initialize OpenAI embeddings client: ${error.message}`);
    throw error;
  }
}

/**
 * OpenAI APIクライアントを取得する
 * @private
 * @returns {Object} OpenAIクライアント
 */
function getClient() {
  if (!openaiClient) {
    return initializeClient();
  }
  return openaiClient;
}

/**
 * テキストの埋め込みベクトルを生成する
 * @param {string} text 埋め込みを生成するテキスト
 * @param {number} retryCount 内部的な再試行カウント
 * @returns {Promise<Array<number>>} 埋め込みベクトル
 */
async function generateEmbedding(text, retryCount = 0) {
  try {
    const client = getClient();
    
    // 入力テキストのバリデーションと前処理
    if (!text || text.trim() === '') {
      logger.warn('Empty text provided for embedding generation');
      return new Array(embeddingConfig.dimensions).fill(0);
    }

    // レート制限の管理
    await manageRateLimit(text);
    
    // OpenAIのEmbeddings APIを呼び出し
    const response = await client.embeddings.create({
      model: embeddingConfig.model,
      input: text.trim(),
      dimensions: embeddingConfig.dimensions
    });

    // トークン使用量を追跡
    if (response.usage) {
      embeddingConfig.tokensUsed += response.usage.total_tokens;
    }

    logger.debug(`Generated embedding for text (${text.length} chars)`);
    return response.data[0].embedding;
  } catch (error) {
    // API呼び出しエラーの処理
    if (retryCount < embeddingConfig.maxRetries) {
      logger.warn(`Embedding generation failed, retrying (${retryCount + 1}/${embeddingConfig.maxRetries}): ${error.message}`);
      
      // 一時的なエラーの場合、再試行
      await new Promise(resolve => setTimeout(resolve, embeddingConfig.retryDelay * (retryCount + 1)));
      return generateEmbedding(text, retryCount + 1);
    }

    logger.error(`Failed to generate embedding after ${embeddingConfig.maxRetries} retries: ${error.message}`);
    throw error;
  }
}

/**
 * テキストの埋め込みベクトルをバッチで生成する
 * @param {Array<string>} texts 埋め込みを生成するテキストの配列
 * @returns {Promise<Array<Array<number>>>} 埋め込みベクトルの配列
 */
async function generateEmbeddingBatch(texts) {
  try {
    // 空の配列の場合はそのまま返す
    if (!texts || texts.length === 0) {
      return [];
    }

    // バッチ処理の最適化（個別に処理して並行実行）
    const embeddings = await Promise.all(
      texts.map(text => generateEmbedding(text).catch(error => {
        logger.error(`Failed to generate embedding for batch item: ${error.message}`);
        // エラー時は0埋めのベクトルを返す
        return new Array(embeddingConfig.dimensions).fill(0);
      }))
    );

    logger.debug(`Generated ${embeddings.length} embeddings in batch`);
    return embeddings;
  } catch (error) {
    logger.error(`Batch embedding generation failed: ${error.message}`);
    throw error;
  }
}

/**
 * レート制限を管理する
 * @private
 * @param {string} text 入力テキスト
 */
async function manageRateLimit(text) {
  // トークン使用量のリセット
  const now = Date.now();
  if (!embeddingConfig.resetTime || now > embeddingConfig.resetTime) {
    embeddingConfig.tokensUsed = 0;
    embeddingConfig.resetTime = now + 60000; // 1分後
  }
  
  // おおよそのトークン数を推定（簡易的に文字数の1/4と仮定）
  const estimatedTokens = Math.ceil(text.length / 4);
  
  // レート制限に近づいたら待機
  if (embeddingConfig.tokensUsed + estimatedTokens > embeddingConfig.maxTokensPerMinute) {
    const waitTime = embeddingConfig.resetTime - now;
    if (waitTime > 0) {
      logger.warn(`Rate limit approaching, waiting ${waitTime}ms before next embedding request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      // 待機後はレート制限をリセット
      embeddingConfig.tokensUsed = 0;
      embeddingConfig.resetTime = Date.now() + 60000;
    }
  }
}

/**
 * 埋め込みシステムの初期化
 * @returns {Promise<Object>} 初期化結果
 */
async function initialize() {
  try {
    getClient();
    return { status: 'initialized' };
  } catch (error) {
    logger.error(`Failed to initialize embeddings system: ${error.message}`);
    throw error;
  }
}

/**
 * 埋め込みシステムのヘルスチェック
 * @returns {Promise<Object>} ヘルスステータス
 */
async function checkHealth() {
  try {
    const client = getClient();
    
    // テスト用の短いテキストで埋め込み生成を試行
    const testEmbedding = await generateEmbedding('test', 0);
    
    // 正常な埋め込みベクトルかチェック
    if (testEmbedding && Array.isArray(testEmbedding) && testEmbedding.length === embeddingConfig.dimensions) {
      return {
        status: 'healthy',
        message: 'Embeddings system is operational'
      };
    } else {
      return {
        status: 'unhealthy',
        message: 'Embeddings response format is incorrect'
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Embeddings error: ${error.message}`
    };
  }
}

module.exports = {
  initialize,
  generateEmbedding,
  generateEmbeddingBatch,
  checkHealth,
  config: embeddingConfig
};