/**
 * チャンク管理モジュール - Bocchy Bot RAGシステム用
 * 
 * テキストを適切なサイズのチャンクに分割し、埋め込み生成に適した形式に変換するモジュール
 * 
 * @module extensions/rag/chunk-manager
 */

const logger = require('../../system/logger');

/**
 * チャンク管理の設定
 * @private
 */
const chunkConfig = {
  // チャンクサイズの設定（トークン数ではなく文字数で近似）
  maxChunkSize: parseInt(process.env.CHUNK_SIZE || '1000', 10),
  minChunkSize: parseInt(process.env.MIN_CHUNK_SIZE || '100', 10),
  // チャンク重複の設定
  overlapSize: parseInt(process.env.CHUNK_OVERLAP || '200', 10),
  // 長すぎるチャンクの処理方法
  splitLongChunks: process.env.SPLIT_LONG_CHUNKS !== 'false'
};

/**
 * テキストを適切なサイズのチャンクに分割する
 * @param {string} text 分割するテキスト
 * @param {Object} options カスタムオプション（デフォルト設定を上書き）
 * @returns {Array<string>} チャンクの配列
 */
function splitIntoChunks(text, options = {}) {
  try {
    // デフォルト設定とカスタムオプションをマージ
    const config = {
      ...chunkConfig,
      ...options
    };
    
    // 入力テキストのバリデーション
    if (!text || text.trim() === '') {
      logger.warn('Empty text provided for chunking');
      return [];
    }
    
    // テキストの前処理（正規化、不要な空白の削除など）
    text = normalizeText(text);

    // テキストが短すぎる場合はそのままチャンクとして返す
    if (text.length <= config.maxChunkSize) {
      logger.debug(`Text is short enough (${text.length} chars) to be a single chunk`);
      return [text];
    }

    // テキストを意味のある単位で分割（段落、文など）
    const segments = segmentText(text);
    
    // セグメントをチャンクにマージ
    const chunks = mergeSegmentsIntoChunks(segments, config);
    
    logger.debug(`Split text (${text.length} chars) into ${chunks.length} chunks`);
    return chunks;
  } catch (error) {
    logger.error(`Failed to split text into chunks: ${error.message}`);
    // エラー発生時でも最低限のチャンキングを試みる
    return [text.trim()];
  }
}

/**
 * テキストを正規化する（前処理）
 * @private
 * @param {string} text 処理するテキスト
 * @returns {string} 正規化されたテキスト
 */
function normalizeText(text) {
  // 改行の正規化
  let normalized = text.replace(/\r\n/g, '\n');
  // 複数の連続する改行を1つにまとめる
  normalized = normalized.replace(/\n{3,}/g, '\n\n');
  // 先頭と末尾の空白を削除
  normalized = normalized.trim();
  return normalized;
}

/**
 * テキストを意味のある単位で分割する
 * @private
 * @param {string} text 分割するテキスト
 * @returns {Array<string>} セグメントの配列
 */
function segmentText(text) {
  // 段落ごとに分割
  const paragraphs = text.split(/\n\s*\n/);
  
  // 段落をさらに文に分割（必要に応じて）
  let segments = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length > chunkConfig.maxChunkSize * 1.5) {
      // 長い段落は文単位で分割
      const sentences = paragraph.split(/(?<=[.!?。！？])\s+/);
      segments.push(...sentences);
    } else {
      segments.push(paragraph);
    }
  }
  
  return segments.filter(segment => segment.trim() !== '');
}

/**
 * セグメントをチャンクにマージする
 * @private
 * @param {Array<string>} segments マージするセグメントの配列
 * @param {Object} config チャンク設定
 * @returns {Array<string>} チャンクの配列
 */
function mergeSegmentsIntoChunks(segments, config) {
  const chunks = [];
  let currentChunk = '';
  
  for (const segment of segments) {
    // セグメントが単体で長すぎる場合の処理
    if (segment.length > config.maxChunkSize) {
      if (config.splitLongChunks) {
        // 長いセグメントを強制的に分割
        const subChunks = forceChunkLongText(segment, config);
        
        // 現在のチャンクがある場合はまず保存
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
        
        // 分割されたサブチャンクを追加
        chunks.push(...subChunks);
        continue;
      } else {
        // 長いセグメントでも分割しない設定の場合
        logger.warn(`Segment exceeds max chunk size (${segment.length} > ${config.maxChunkSize}) but splitting is disabled`);
      }
    }
    
    // 現在のチャンクにセグメントを追加した場合のサイズをチェック
    if (currentChunk && (currentChunk.length + segment.length + 1) > config.maxChunkSize) {
      // 最大サイズを超える場合は現在のチャンクを保存し、新しいチャンクを開始
      chunks.push(currentChunk);
      currentChunk = segment;
    } else {
      // 現在のチャンクにセグメントを追加
      currentChunk = currentChunk 
        ? `${currentChunk}\n${segment}`
        : segment;
    }
  }
  
  // 最後のチャンクを追加
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  // 重複部分を作成（オプション）
  if (config.overlapSize > 0 && chunks.length > 1) {
    return createOverlappingChunks(chunks, config);
  }
  
  return chunks;
}

/**
 * 長いテキストを強制的にチャンクに分割する
 * @private
 * @param {string} text 分割するテキスト
 * @param {Object} config チャンク設定
 * @returns {Array<string>} チャンクの配列
 */
function forceChunkLongText(text, config) {
  const chunks = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    // できるだけ意味的な単位で分割を試みる
    let splitIndex = config.maxChunkSize;
    
    // 最大サイズ内で文末を探す
    const sentenceEndMatch = remaining.slice(config.minChunkSize, config.maxChunkSize).match(/[.!?。！？][^\w\d]/);
    if (sentenceEndMatch) {
      splitIndex = config.minChunkSize + sentenceEndMatch.index + 1;
    } else {
      // 文末が見つからない場合は単語境界で分割
      const wordBoundaryMatch = remaining.slice(config.minChunkSize, config.maxChunkSize).match(/\s+/g);
      if (wordBoundaryMatch && wordBoundaryMatch.length > 0) {
        const lastSpace = remaining.lastIndexOf(' ', config.maxChunkSize);
        if (lastSpace > config.minChunkSize) {
          splitIndex = lastSpace;
        }
      }
    }
    
    // 現在のチャンクと残りのテキストを更新
    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }
  
  return chunks;
}

/**
 * 重複部分を持つチャンクを作成する
 * @private
 * @param {Array<string>} chunks 元のチャンク配列
 * @param {Object} config チャンク設定
 * @returns {Array<string>} 重複部分を持つチャンク配列
 */
function createOverlappingChunks(chunks, config) {
  const overlappingChunks = [];
  
  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) {
      // 最初のチャンクはそのまま
      overlappingChunks.push(chunks[i]);
    } else {
      // 前のチャンクの末尾を取得
      const prevChunk = chunks[i - 1];
      const overlap = prevChunk.length > config.overlapSize 
        ? prevChunk.slice(-config.overlapSize) 
        : prevChunk;
      
      // 重複部分を先頭に追加
      overlappingChunks.push(`${overlap}\n${chunks[i]}`);
    }
  }
  
  return overlappingChunks;
}

/**
 * テキストをチャンク化し、メタデータを付与する
 * @param {string} text チャンク化するテキスト
 * @param {Object} metadata チャンクに付与するメタデータ
 * @param {Object} options カスタムオプション
 * @returns {Array<Object>} チャンクとメタデータの配列
 */
function createChunksWithMetadata(text, metadata = {}, options = {}) {
  // テキストをチャンクに分割
  const textChunks = splitIntoChunks(text, options);
  
  // チャンクにメタデータを付与
  return textChunks.map((chunk, index) => ({
    content: chunk,
    metadata: {
      ...metadata,
      chunkIndex: index,
      totalChunks: textChunks.length,
      charCount: chunk.length,
      createdAt: new Date().toISOString()
    }
  }));
}

module.exports = {
  splitIntoChunks,
  createChunksWithMetadata,
  config: chunkConfig
};