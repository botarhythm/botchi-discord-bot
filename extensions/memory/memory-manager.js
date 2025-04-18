/**
 * Memory Manager - Bocchy Bot用メモリ管理システム
 * 
 * Supabaseベースの会話履歴管理と記憶システムの統合インターフェース
 * コンテキスト管理、会話履歴、ユーザー設定などを一元管理
 * 
 * @module extensions/memory/memory-manager
 */

const conversationStore = require('./conversation-store');
const supabaseClient = require('./supabase-client');
const logger = require('../../system/logger');

/**
 * メモリマネージャークラス
 * メモリ管理機能の統合インターフェースを提供
 */
class MemoryManager {
  /**
   * メモリマネージャーを初期化
   */
  constructor() {
    this.activeConversations = new Map();
    this.initialized = false;
    this.fallbackMode = false; // フォールバックモードのフラグ
  }

  /**
   * 初期化処理を行う
   * @returns {Promise<boolean>} 初期化成功の場合はtrue
   */
  async initialize() {
    try {
      // サービスの健全性を確認
      const health = await supabaseClient.checkHealth();
      
      if (health.status !== 'healthy') {
        logger.error(`Memory system health check failed: ${health.message}`);
        return false;
      }
      
      this.initialized = true;
      logger.info('Memory system initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize memory system: ${error.message}`);
      return false;
    }
  }

  /**
   * 初期化状態を取得
   * @returns {boolean} 初期化済みの場合はtrue
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * 会話コンテキストを取得または新規作成
   * @param {Object} userInfo ユーザー情報
   * @param {string} userInfo.userId ユーザーID
   * @param {string} userInfo.channelId チャンネルID (任意)
   * @param {string} userInfo.guildId サーバーID (任意)
   * @returns {Promise<Object>} 会話コンテキスト情報
   */
  async getOrCreateConversationContext(userInfo) {
    try {
      // トライカウンターとリトライ制限を設定
      let tryCount = 0;
      const MAX_RETRIES = 3;
      
      if (!this.initialized) {
        try {
          await this.initialize();
        } catch (initError) {
          logger.warn(`メモリシステムの初期化に失敗しましたが、フォールバックモードで続行します: ${initError.message}`);
          // 初期化失敗時のフォールバックモード（インメモリのみ）
          this.initialized = true;
          this.fallbackMode = true;
        }
      }
      
      // キャッシュをチェック
      const cacheKey = this._createCacheKey(userInfo);
      let conversationContext = this.activeConversations.get(cacheKey);
      
      if (conversationContext) {
        if (conversationContext.temporary) {
          logger.debug(`一時的な会話コンテキストが使用されています: ${cacheKey}`);
        }
        return conversationContext;
      }
      
      // フォールバックモードの場合はインメモリ会話を作成
      if (this.fallbackMode) {
        logger.info(`フォールバックモード: インメモリ会話コンテキストを作成: ${cacheKey}`);
        const temporaryContext = this._createTemporaryContext(userInfo);
        this.activeConversations.set(cacheKey, temporaryContext);
        return temporaryContext;
      }
      
      // アクティブな会話をデータベースから取得 - リトライロジック
      let conversation = null;
      let lastError = null;
      
      while (tryCount < MAX_RETRIES) {
        try {
          // アクティブな会話がデータベースにあるか確認
          conversation = await conversationStore.getActiveConversation({
            userId: userInfo.userId,
            channelId: userInfo.channelId,
            guildId: userInfo.guildId
          });
          
          if (conversation) {
            logger.debug(`既存の会話をデータベースから取得: ${conversation.id}`);
            break; // 会話が見つかったらループを終了
          }
          
          // なければ新しい会話を作成
          conversation = await conversationStore.createConversation({
            userId: userInfo.userId,
            channelId: userInfo.channelId,
            guildId: userInfo.guildId,
            metadata: {
              systemInfo: {
                platform: 'discord',
                version: process.env.BOT_VERSION || '1.0.0'
              }
            }
          });
          
          // 初期の会話には、システムメッセージがあれば追加
          if (userInfo.systemMessage) {
            await conversationStore.addMessage({
              conversationId: conversation.id,
              role: 'system',
              content: userInfo.systemMessage
            });
          }
          
          logger.info(`新しい会話を作成: ${conversation.id}`);
          break; // 会話作成成功
          
        } catch (error) {
          lastError = error;
          tryCount++;
          const retryDelay = Math.min(100 * Math.pow(2, tryCount), 2000); // 指数バックオフ
          
          logger.warn(`会話取得/作成エラー (試行 ${tryCount}/${MAX_RETRIES}): ${error.message}. ${retryDelay}ms後に再試行...`);
          
          // 少し待機してから再試行
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      
      // すべてのリトライが失敗した場合はインメモリフォールバック
      if (!conversation) {
        logger.error(`データベースからの会話取得に失敗、インメモリフォールバックに切り替え: ${lastError?.message || 'Unknown error'}`);
        const temporaryContext = this._createTemporaryContext(userInfo);
        this.activeConversations.set(cacheKey, temporaryContext);
        return temporaryContext;
      }
      
      // 会話コンテキストを構築
      conversationContext = {
        conversationId: conversation.id,
        userId: userInfo.userId,
        channelId: userInfo.channelId,
        guildId: userInfo.guildId,
        messageCount: conversation.message_count,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at
      };
      
      // キャッシュに保存
      this.activeConversations.set(cacheKey, conversationContext);
      
      return conversationContext;
    } catch (error) {
      logger.error(`会話コンテキスト取得/作成中の予期しないエラー: ${error.message}`);
      
      // 最終フォールバック: メモリ内の一時会話コンテキスト
      const temporaryContext = this._createTemporaryContext(userInfo);
      
      // キャッシュに保存
      const cacheKey = this._createCacheKey(userInfo);
      this.activeConversations.set(cacheKey, temporaryContext);
      
      return temporaryContext;
    }
  }

  /**
   * 指定した会話にメッセージを追加
   * @param {string} conversationId 会話ID
   * @param {string} role メッセージの役割 ('user', 'assistant', 'system')
   * @param {string} content メッセージの内容
   * @param {Object} metadata 追加のメタデータ (任意)
   * @returns {Promise<Object>} 追加されたメッセージ情報
   */
  async addMessageToConversation(conversationId, role, content, metadata = {}) {
    try {
      // トライカウンターとリトライ制限を設定
      let tryCount = 0;
      const MAX_RETRIES = 3;
      
      if (!this.initialized) {
        try {
          await this.initialize();
        } catch (initError) {
          logger.warn(`メモリシステムの初期化に失敗しましたが、フォールバックモードで続行します: ${initError.message}`);
          this.initialized = true;
          this.fallbackMode = true;
        }
      }
      
      // フォールバックモードの場合はメッセージを記録しない
      if (this.fallbackMode) {
        logger.info(`フォールバックモード: メッセージは一時的にのみ記録されます: ${conversationId}`);
        // 一時オブジェクトとして返す
        return {
          id: `temp-msg-${Date.now()}`,
          conversation_id: conversationId,
          role,
          content,
          metadata,
          timestamp: new Date().toISOString(),
          temporary: true
        };
      }
      
      // 一時的な会話IDの場合はメッセージを記録しない
      if (conversationId.startsWith('temp-')) {
        logger.debug(`一時的な会話IDのためメッセージはデータベースに記録されません: ${conversationId}`);
        return {
          id: `temp-msg-${Date.now()}`,
          conversation_id: conversationId,
          role,
          content,
          metadata,
          timestamp: new Date().toISOString(),
          temporary: true
        };
      }
      
      // リトライロジックを使用してメッセージ追加
      let lastError = null;
      
      while (tryCount < MAX_RETRIES) {
        try {
          const message = await conversationStore.addMessage({
            conversationId,
            role,
            content,
            metadata
          });
          
          logger.debug(`メッセージを会話に追加: ${conversationId}, ロール: ${role}`);
          return message;
        } catch (error) {
          lastError = error;
          tryCount++;
          const retryDelay = Math.min(100 * Math.pow(2, tryCount), 2000); // 指数バックオフ
          
          logger.warn(`メッセージ追加エラー (試行 ${tryCount}/${MAX_RETRIES}): ${error.message}. ${retryDelay}ms後に再試行...`);
          
          // 少し待機してから再試行
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      
      // すべてのリトライが失敗した場合
      logger.error(`メッセージ追加の最大リトライ回数に達しました: ${lastError?.message || 'Unknown error'}`);
      
      // 一時オブジェクトとして返す
      return {
        id: `temp-msg-${Date.now()}`,
        conversation_id: conversationId,
        role,
        content,
        metadata,
        timestamp: new Date().toISOString(),
        temporary: true
      };
    } catch (error) {
      logger.error(`メッセージ追加中の予期しないエラー: ${error.message}`);
      
      // 一時オブジェクトとして返す
      return {
        id: `temp-msg-${Date.now()}`,
        conversation_id: conversationId,
        role,
        content,
        metadata,
        timestamp: new Date().toISOString(),
        temporary: true
      };
    }
  }

  /**
   * 指定した会話のコンテキストメッセージを取得
   * @param {string} conversationId 会話ID
   * @param {number} limit 取得するメッセージ数 (デフォルト: 10)
   * @returns {Promise<Array>} AI用のコンテキストメッセージ配列
   */
  async getContextMessages(conversationId, limit = 10) {
    try {
      if (!this.initialized) {
        try {
          await this.initialize();
        } catch (initError) {
          logger.warn(`メモリシステムの初期化に失敗しましたが、フォールバックモードで続行します: ${initError.message}`);
          this.initialized = true;
          this.fallbackMode = true;
        }
      }
      
      // フォールバックモードや一時的IDの場合は空配列を返す
      if (this.fallbackMode || conversationId.startsWith('temp-')) {
        logger.debug(`メモリ取得スキップ: ${this.fallbackMode ? 'フォールバックモード' : '一時的ID'} - ${conversationId}`);
        return [];
      }
      
      // トライカウンターとリトライ制限
      let tryCount = 0;
      const MAX_RETRIES = 3;
      let lastError = null;
      
      while (tryCount < MAX_RETRIES) {
        try {
          const messages = await conversationStore.getConversationContext(conversationId, limit);
          logger.debug(`会話コンテキストメッセージを取得: ${conversationId}, ${messages.length}件`);
          return messages;
        } catch (error) {
          lastError = error;
          tryCount++;
          
          if (tryCount >= MAX_RETRIES) {
            // 最大リトライ回数に達した場合はエラーをログ記録
            logger.error(`メッセージ取得リトライ回数上限到達: ${error.message}`);
            break;
          }
          
          const retryDelay = Math.min(100 * Math.pow(2, tryCount), 2000); // 指数バックオフ
          logger.warn(`メッセージ取得エラー (試行 ${tryCount}/${MAX_RETRIES}): ${error.message}. ${retryDelay}ms後に再試行...`);
          
          // 少し待機してから再試行
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      
      // 最後にエラーをログ記録して空配列を返す
      logger.error(`会話コンテキストの取得失敗: ${lastError?.message || 'Unknown error'}`);
      return [];
    } catch (error) {
      logger.error(`会話コンテキスト取得中の予期しないエラー: ${error.message}`);
      // エラー時は空の配列を返す
      return [];
    }
  }

  /**
   * 会話を終了（アーカイブ）する
   * @param {string} conversationId 会話ID
   * @returns {Promise<boolean>} 成功した場合はtrue
   */
  async endConversation(conversationId) {
    try {
      if (!this.initialized) {
        try {
          await this.initialize();
        } catch (initError) {
          logger.warn(`メモリシステムの初期化に失敗しましたが、フォールバックモードで続行します: ${initError.message}`);
          this.initialized = true;
          this.fallbackMode = true;
        }
      }
      
      // フォールバックモードや一時的IDの場合は単にキャッシュから削除
      if (this.fallbackMode || conversationId.startsWith('temp-')) {
        logger.debug(`会話アーカイブをスキップ: ${this.fallbackMode ? 'フォールバックモード' : '一時的ID'} - ${conversationId}`);
        
        // キャッシュから削除
        for (const [key, context] of this.activeConversations.entries()) {
          if (context.conversationId === conversationId) {
            this.activeConversations.delete(key);
            logger.debug(`会話をキャッシュから削除: ${key}`);
            break;
          }
        }
        
        return true;
      }
      
      // トライカウンターとリトライ制限
      let tryCount = 0;
      const MAX_RETRIES = 3;
      let lastError = null;
      
      while (tryCount < MAX_RETRIES) {
        try {
          // 会話を不活性化
          await conversationStore.deactivateConversation(conversationId);
          
          // キャッシュから削除
          for (const [key, context] of this.activeConversations.entries()) {
            if (context.conversationId === conversationId) {
              this.activeConversations.delete(key);
              break;
            }
          }
          
          logger.debug(`会話をアーカイブしました: ${conversationId}`);
          return true;
        } catch (error) {
          lastError = error;
          tryCount++;
          
          if (tryCount >= MAX_RETRIES) {
            // 最大リトライ回数に達した場合はエラーをログ記録
            logger.error(`会話アーカイブリトライ回数上限到達: ${error.message}`);
            break;
          }
          
          const retryDelay = Math.min(100 * Math.pow(2, tryCount), 2000); // 指数バックオフ
          logger.warn(`会話アーカイブエラー (試行 ${tryCount}/${MAX_RETRIES}): ${error.message}. ${retryDelay}ms後に再試行...`);
          
          // 少し待機してから再試行
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      
      // すべてのリトライが失敗した場合でもキャッシュからは削除
      logger.warn(`会話のアーカイブに失敗しましたが、キャッシュからは削除: ${conversationId}`);
      
      // キャッシュから削除
      for (const [key, context] of this.activeConversations.entries()) {
        if (context.conversationId === conversationId) {
          this.activeConversations.delete(key);
          break;
        }
      }
      
      return false;
    } catch (error) {
      logger.error(`会話アーカイブ中の予期しないエラー: ${error.message}`);
      return false;
    }
  }

  /**
   * ヘルスチェックを実行
   * @returns {Promise<Object>} ヘルスステータス情報
   */
  async checkHealth() {
    try {
      return await supabaseClient.checkHealth();
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Memory system error: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * キャッシュキーを生成
   * @private
   * @param {Object} userInfo ユーザー情報
   * @returns {string} キャッシュキー
   */
  _createCacheKey(userInfo) {
    return `${userInfo.userId}:${userInfo.channelId || 'dm'}:${userInfo.guildId || 'none'}`;
  }

  /**
   * 一時的なインメモリ会話コンテキストを作成
   * @private
   * @param {Object} userInfo ユーザー情報
   * @returns {Object} 一時的な会話コンテキスト
   */
  _createTemporaryContext(userInfo) {
    const tempId = `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    return {
      conversationId: tempId,
      userId: userInfo.userId,
      channelId: userInfo.channelId || 'unknown',
      guildId: userInfo.guildId || 'unknown',
      messageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      temporary: true // 一時的なコンテキストであることを示すフラグ
    };
  }

  /**
   * キャッシュをクリア
   * @returns {void}
   */
  clearCache() {
    this.activeConversations.clear();
    logger.debug('Memory cache cleared');
  }

  /**
   * 指定したチャンネルの会話履歴を取得
   * @param {string} channelId チャンネルID
   * @param {number} limit 取得する会話の上限数 (デフォルト: 10)
   * @returns {Promise<Array>} 会話履歴の配列
   */
  async getConversationHistory(channelId, limit = 10) {
    try {
      if (!this.initialized || this.fallbackMode) {
        logger.debug(`フォールバックモード: 会話履歴は空の配列を返します: ${channelId}`);
        return [];
      }

      // チャンネルIDに対応する会話コンテキストを取得
      const cacheKey = this._createCacheKey({ channelId });
      let conversationContext = this.activeConversations.get(cacheKey);
      
      if (!conversationContext || !conversationContext.conversationId) {
        logger.debug(`チャンネル ${channelId} の会話コンテキストが見つかりません`);
        return [];
      }

      // conversationStoreから会話を取得
      return await conversationStore.getMessagesForConversation(
        conversationContext.conversationId,
        limit
      );
    } catch (error) {
      logger.error(`会話履歴取得中のエラー: ${error.message}`);
      return [];
    }
  }

  /**
   * 会話を保存する
   * @param {string} channelId チャンネルID
   * @param {string} userId ユーザーID
   * @param {string} userMessage ユーザーメッセージ
   * @param {string} botResponse ボットの応答
   * @returns {Promise<boolean>} 保存に成功した場合はtrue
   */
  async storeConversation(channelId, userId, userMessage, botResponse) {
    try {
      if (!this.initialized || this.fallbackMode) {
        logger.debug(`フォールバックモード: 会話は保存されません: ${channelId}`);
        return false;
      }

      // チャンネルに対応する会話コンテキストを取得または作成
      const userInfo = {
        userId,
        channelId
      };
      
      const conversationContext = await this.getOrCreateConversationContext(userInfo);
      
      if (!conversationContext || !conversationContext.conversationId) {
        logger.error(`会話コンテキストの取得に失敗しました: ${channelId}`);
        return false;
      }

      // 一時的な会話IDの場合は保存しない
      if (conversationContext.conversationId.startsWith('temp-')) {
        logger.debug(`一時的な会話IDのため会話は保存されません: ${conversationContext.conversationId}`);
        return false;
      }

      // ユーザーメッセージを追加
      await conversationStore.addMessage({
        conversationId: conversationContext.conversationId,
        role: 'user',
        content: userMessage
      });

      // ボットの応答を追加
      await conversationStore.addMessage({
        conversationId: conversationContext.conversationId,
        role: 'assistant',
        content: botResponse
      });

      logger.debug(`会話が保存されました: ${conversationContext.conversationId}`);
      return true;
    } catch (error) {
      logger.error(`会話保存中のエラー: ${error.message}`);
      return false;
    }
  }
}

// シングルトンインスタンスを作成
const memoryManager = new MemoryManager();

module.exports = memoryManager;