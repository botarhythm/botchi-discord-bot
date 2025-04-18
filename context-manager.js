// context-manager.js - ボッチーの会話文脈管理モジュール
const axios = require('axios');

// 環境変数から設定を読み込む（Supabaseの接続情報）
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CONVERSATION_TABLE = process.env.SUPABASE_CONVERSATION_TABLE || 'conversations';
const MESSAGE_TABLE = process.env.SUPABASE_MESSAGE_TABLE || 'messages';

// メモリ内キャッシュ（Supabase非対応時や高速アクセス用）
const memoryCache = new Map();

// 設定
const CACHE_EXPIRY = 30 * 60 * 1000;  // 30分
const MAX_CONVERSATION_LENGTH = 20;    // 20ターン
const MAX_CONTEXT_TOKENS = 4000;       // 4000トークン

// 文脈管理の設定
const IMMEDIATE_CONTEXT_SIZE = 2;      // 直前の会話ペア（質問と回答）
const RECENT_CONTEXT_SIZE = 4;         // 直近の会話（2往復分）
const CONTEXT_DECAY_RATE = 0.9;        // 文脈の減衰率（より緩やかに）
const RELEVANCE_THRESHOLD = 0.3;       // 関連性の閾値（より緩く）

// 初期化フラグ
let isInitialized = false;
let useSupabase = false;

/**
 * 文脈の重要度スコアリング
 * @param {Object} message - 評価対象のメッセージ
 * @param {Object} currentContext - 現在の文脈情報
 * @returns {number} 重要度スコア（0-1）
 */
function calculateContextScore(message, currentContext) {
  const messages = currentContext.messages;
  if (messages.length === 0) return 0.5;
  
  // 直前の会話ペア（最新の質問-回答）との関連性
  const immediateMessages = messages.slice(-IMMEDIATE_CONTEXT_SIZE);
  const immediateScore = calculateImmediateRelevance(message, immediateMessages);
  
  // 直近の会話（2往復分）との関連性
  const recentMessages = messages.slice(-RECENT_CONTEXT_SIZE);
  const recentScore = calculateRecentRelevance(message, recentMessages);
  
  // 最終スコア（バランスを調整）
  return immediateScore * 0.6 + recentScore * 0.4;
}

/**
 * 直前の会話ペアとの関連性を計算
 * @param {Object} message - 評価対象のメッセージ
 * @param {Array} immediateMessages - 直前の会話ペア
 * @returns {number} 関連性スコア（0-1）
 */
function calculateImmediateRelevance(message, immediateMessages) {
  if (immediateMessages.length === 0) return 0.5;
  
  // 質問-回答のペアを考慮
  const isQuestionAnswerPair = immediateMessages.length === 2 &&
    immediateMessages[0].role === 'user' &&
    immediateMessages[1].role === 'assistant';
  
  // 直前メッセージとの類似性を計算
  const lastMessage = immediateMessages[immediateMessages.length - 1];
  const similarity = calculateMessageSimilarity(message, lastMessage);
  
  // 質問-回答のペアの場合のボーナスを控えめに
  return isQuestionAnswerPair ? 
    Math.min(1, similarity * 1.1) : similarity;
}

/**
 * 直近の会話との関連性を計算
 * @param {Object} message - 評価対象のメッセージ
 * @param {Array} recentMessages - 直近の会話履歴
 * @returns {number} 関連性スコア（0-1）
 */
function calculateRecentRelevance(message, recentMessages) {
  if (recentMessages.length === 0) return 0.5;
  
  let totalScore = 0;
  let weightSum = 0;
  
  // 新しい順に重み付けしてスコアを計算
  recentMessages.reverse().forEach((msg, index) => {
    const weight = Math.pow(CONTEXT_DECAY_RATE, index);
    const similarity = calculateMessageSimilarity(message, msg);
    totalScore += similarity * weight;
    weightSum += weight;
  });
  
  return totalScore / weightSum;
}

/**
 * メッセージ間の類似性を計算
 * @param {Object} msg1 - 比較対象メッセージ1
 * @param {Object} msg2 - 比較対象メッセージ2
 * @returns {number} 類似性スコア（0-1）
 */
function calculateMessageSimilarity(msg1, msg2) {
  const keywords1 = extractKeywords(msg1.content);
  const keywords2 = extractKeywords(msg2.content);
  
  // 共通キーワードの割合を計算
  const commonKeywords = keywords1.filter(k => keywords2.includes(k));
  const similarity = commonKeywords.length / Math.max(keywords1.length, keywords2.length);
  
  // 会話の役割の関係性を控えめに
  const roleRelationship = 
    (msg1.role === 'user' && msg2.role === 'assistant') ||
    (msg1.role === 'assistant' && msg2.role === 'user') ? 0.1 :
    (msg1.role === msg2.role) ? 0.05 : 0;
  
  return Math.min(1, similarity + roleRelationship);
}

/**
 * キーワード抽出
 * @param {string} text - 対象テキスト
 * @returns {Array} 抽出されたキーワード配列
 */
function extractKeywords(text) {
  // 日本語と英語の両方に対応
  const words = text.toLowerCase()
    .replace(/[。、！？]/g, ' ')  // 日本語の句読点を空白に
    .replace(/[^\w\s\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, ' ')  // 特殊文字を空白に
    .split(/\s+/)
    .filter(word => word.length > 1);  // 1文字の単語は除外
  
  // 重複を除去して返す
  return [...new Set(words)];
}

/**
 * コンテキストマネージャーの初期化
 */
async function initialize() {
  if (isInitialized) return;
  
  // Supabase設定が有効かチェック
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      // 接続テスト
      await axios.get(`${SUPABASE_URL}/rest/v1/${CONVERSATION_TABLE}?limit=1`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      
      console.log('[ContextManager] Supabaseに接続しました');
      useSupabase = true;
    } catch (error) {
      console.error('[ContextManager] Supabase接続エラー:', error.message);
      console.log('[ContextManager] メモリ内キャッシュのみを使用します');
      useSupabase = false;
    }
  } else {
    console.log('[ContextManager] Supabase設定がありません。メモリ内キャッシュのみを使用します');
    useSupabase = false;
  }
  
  isInitialized = true;
  return { initialized: true, useSupabase };
}

/**
 * 会話履歴の取得（関連性に基づくフィルタリング付き）
 * @param {string} userId - ユーザーID
 * @param {boolean} detailed - 詳細情報を含めるか
 * @param {boolean} filterByRelevance - 関連性でフィルタリングするか
 */
async function getConversationHistory(userId, detailed = false, filterByRelevance = true) {
  await ensureInitialized();
  
  // メモリキャッシュを確認
  if (memoryCache.has(userId)) {
    const cachedData = memoryCache.get(userId);
    if (Date.now() - cachedData.lastUpdated <= CACHE_EXPIRY) {
      return detailed ? cachedData : cachedData.messages;
    }
  }
  
  // Supabaseが無効の場合は新しいキャッシュエントリを作成して返す
  if (!useSupabase) {
    const newEntry = {
      userId,
      messages: [],
      lastUpdated: Date.now(),
      messageCount: 0,
      summarized: false,
      contextTokens: 0
    };
    memoryCache.set(userId, newEntry);
    return detailed ? newEntry : newEntry.messages;
  }
  
  try {
    // Supabaseから会話履歴を取得
    const conversationResponse = await axios.get(
      `${SUPABASE_URL}/rest/v1/${CONVERSATION_TABLE}?userId=eq.${encodeURIComponent(userId)}`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    
    let conversation = conversationResponse.data[0];
    
    // 会話が存在しない場合は新規作成
    if (!conversation) {
      const newConversation = {
        userId,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        messageCount: 0,
        metadata: { summarized: false }
      };
      
      await axios.post(
        `${SUPABASE_URL}/rest/v1/${CONVERSATION_TABLE}`,
        newConversation,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          }
        }
      );
      
      conversation = newConversation;
      conversation.messages = [];
    } else {
      // メッセージを取得
      const messagesResponse = await axios.get(
        `${SUPABASE_URL}/rest/v1/${MESSAGE_TABLE}?conversationId=eq.${conversation.id}&order=createdAt.asc`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          }
        }
      );
      
      conversation.messages = messagesResponse.data.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    }
    
    if (filterByRelevance && conversation.messages.length > 0) {
      const currentContext = {
        messages: conversation.messages.slice(-RECENT_CONTEXT_SIZE)
      };
      
      // 関連性の低いメッセージをフィルタリング
      conversation.messages = conversation.messages.filter(message => 
        calculateContextScore(message, currentContext) >= RELEVANCE_THRESHOLD
      );
    }
    
    // メモリキャッシュを更新
    const cacheEntry = {
      userId,
      conversationId: conversation.id,
      messages: conversation.messages,
      lastUpdated: Date.now(),
      messageCount: conversation.messageCount,
      summarized: conversation.metadata?.summarized || false,
      contextTokens: estimateTokens(conversation.messages)
    };
    
    memoryCache.set(userId, cacheEntry);
    return detailed ? cacheEntry : cacheEntry.messages;
    
  } catch (error) {
    console.error('[ContextManager] 会話履歴取得エラー:', error.message);
    
    // エラー時はメモリキャッシュを使用
    if (memoryCache.has(userId)) {
      const cachedData = memoryCache.get(userId);
      return detailed ? cachedData : cachedData.messages;
    }
    
    // キャッシュもない場合は新規作成
    const newEntry = {
      userId,
      messages: [],
      lastUpdated: Date.now(),
      messageCount: 0,
      summarized: false,
      contextTokens: 0
    };
    
    memoryCache.set(userId, newEntry);
    return detailed ? newEntry : newEntry.messages;
  }
}

/**
 * 会話に新しいメッセージを追加
 * @param {string} userId - ユーザーID
 * @param {string} role - メッセージの役割 ('user' または 'assistant')
 * @param {string} content - メッセージの内容
 */
async function addMessage(userId, role, content) {
  await ensureInitialized();
  
  // システムメッセージの場合の特別処理
  const isSystemMessage = role === 'system';
  
  // 会話履歴を取得（詳細情報付き）
  const conversation = await getConversationHistory(userId, true);
  
  // メッセージを追加
  if (isSystemMessage) {
    // システムメッセージは先頭に配置
    if (conversation.messages.length > 0 && conversation.messages[0].role === 'system') {
      conversation.messages[0].content = content;
    } else {
      conversation.messages.unshift({ role, content });
    }
  } else {
    // 通常のメッセージは末尾に追加
    conversation.messages.push({ role, content });
  }
  
  // トークン数を更新
  conversation.contextTokens = estimateTokens(conversation.messages);
  
  // 会話が長すぎる場合は要約または削減を検討
  if (conversation.messages.length > MAX_CONVERSATION_LENGTH || 
      conversation.contextTokens > MAX_CONTEXT_TOKENS) {
    await compressConversation(userId, conversation);
  }
  
  // メッセージカウントとタイムスタンプを更新
  conversation.messageCount++;
  conversation.lastUpdated = Date.now();
  
  // メモリキャッシュを更新
  memoryCache.set(userId, conversation);
  
  // Supabaseが有効な場合はデータベースも更新
  if (useSupabase && conversation.conversationId) {
    try {
      // 会話テーブルを更新
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/${CONVERSATION_TABLE}?id=eq.${conversation.conversationId}`,
        {
          lastUpdated: new Date().toISOString(),
          messageCount: conversation.messageCount,
          metadata: { 
            summarized: conversation.summarized,
            contextTokens: conversation.contextTokens
          }
        },
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // メッセージテーブルに新しいメッセージを追加
      if (!isSystemMessage || (isSystemMessage && conversation.messages.length === 1)) {
        // システムメッセージの場合は最初のメッセージの場合のみ追加
        await axios.post(
          `${SUPABASE_URL}/rest/v1/${MESSAGE_TABLE}`,
          {
            conversationId: conversation.conversationId,
            role,
            content,
            createdAt: new Date().toISOString()
          },
          {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
      } else if (isSystemMessage) {
        // システムメッセージの更新（既存のシステムメッセージを検索して更新）
        const messagesResponse = await axios.get(
          `${SUPABASE_URL}/rest/v1/${MESSAGE_TABLE}?conversationId=eq.${conversation.conversationId}&role=eq.system&order=createdAt.asc.nullslast&limit=1`,
          {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          }
        );
        
        if (messagesResponse.data.length > 0) {
          const systemMessageId = messagesResponse.data[0].id;
          await axios.patch(
            `${SUPABASE_URL}/rest/v1/${MESSAGE_TABLE}?id=eq.${systemMessageId}`,
            {
              content,
              updatedAt: new Date().toISOString()
            },
            {
              headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
              }
            }
          );
        }
      }
    } catch (error) {
      console.error('[ContextManager] メッセージ追加エラー (Supabase):', error.message);
      // エラーは無視して処理を継続（メモリキャッシュには反映済み）
    }
  }
  
  return conversation.messages;
}

/**
 * 会話履歴をクリア
 * @param {string} userId - ユーザーID
 */
async function clearConversation(userId) {
  await ensureInitialized();
  
  // メモリキャッシュをクリア
  memoryCache.delete(userId);
  
  // Supabaseが有効な場合はデータベースのエントリも削除
  if (useSupabase) {
    try {
      // 会話IDを取得
      const conversationResponse = await axios.get(
        `${SUPABASE_URL}/rest/v1/${CONVERSATION_TABLE}?userId=eq.${encodeURIComponent(userId)}`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          }
        }
      );
      
      if (conversationResponse.data.length > 0) {
        const conversationId = conversationResponse.data[0].id;
        
        // 関連するメッセージを削除
        await axios.delete(
          `${SUPABASE_URL}/rest/v1/${MESSAGE_TABLE}?conversationId=eq.${conversationId}`,
          {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          }
        );
        
        // 会話自体は削除せず、メッセージカウントをリセット
        await axios.patch(
          `${SUPABASE_URL}/rest/v1/${CONVERSATION_TABLE}?id=eq.${conversationId}`,
          {
            lastUpdated: new Date().toISOString(),
            messageCount: 0,
            metadata: { summarized: false, contextTokens: 0 }
          },
          {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
      }
      
      return true;
    } catch (error) {
      console.error('[ContextManager] 会話クリアエラー (Supabase):', error.message);
      return false;
    }
  }
  
  return true;
}

/**
 * 会話の圧縮（要約または削減）
 * @param {string} userId - ユーザーID
 * @param {Object} conversation - 会話オブジェクト
 * @private
 */
async function compressConversation(userId, conversation) {
  // システムメッセージを保持
  const systemMessages = conversation.messages.filter(msg => msg.role === 'system');
  
  // 残りのメッセージを取得
  const regularMessages = conversation.messages.filter(msg => msg.role !== 'system');
  
  // 単純に古いメッセージを削除（将来的にはAIによる要約に置き換える）
  const keepCount = Math.min(regularMessages.length, MAX_CONVERSATION_LENGTH - systemMessages.length);
  const keptMessages = regularMessages.slice(-keepCount);
  
  // メッセージを再構成
  conversation.messages = [...systemMessages, ...keptMessages];
  conversation.contextTokens = estimateTokens(conversation.messages);
  conversation.summarized = true;
  
  // メモリキャッシュを更新
  memoryCache.set(userId, conversation);
  
  // Supabaseが有効な場合はデータベースも更新（この実装では簡略化のため省略）
  
  return conversation.messages;
}

/**
 * メッセージのトークン数を概算で見積もる
 * @param {Array} messages - メッセージ配列
 * @private
 */
function estimateTokens(messages) {
  let total = 0;
  
  for (const msg of messages) {
    // 簡易推定：英語で1単語≒1.3トークン、日本語で1文字≒1トークン
    const content = msg.content || '';
    const hasJapanese = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/g.test(content);
    
    if (hasJapanese) {
      // 日本語文字が含まれる場合、文字数をほぼそのままトークン数とみなす
      total += content.length;
    } else {
      // 英語の場合、単語数に1.3を掛けて概算
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      total += Math.ceil(wordCount * 1.3);
    }
    
    // ロールと構造のオーバーヘッド
    total += 4;
  }
  
  // 会話構造のオーバーヘッド
  total += 2;
  
  return total;
}

/**
 * 初期化が完了しているか確認
 * @private
 */
async function ensureInitialized() {
  if (!isInitialized) {
    await initialize();
  }
}

module.exports = {
  initialize,
  getConversationHistory,
  addMessage,
  clearConversation,
  getConfig: () => ({
    useSupabase,
    cacheExpiry: CACHE_EXPIRY,
    maxConversationLength: MAX_CONVERSATION_LENGTH,
    maxContextTokens: MAX_CONTEXT_TOKENS,
    userCount: memoryCache.size
  })
};