/**
 * Bocchy Discord Bot - メッセージハンドラー（改良版）
 * 文脈介入機能の堅牢性と最適化を目的としたリファクタリング
 */

const { ChannelType, EmbedBuilder, DMChannel } = require('discord.js');
const path = require('path');
const messageHistory = require('../extensions/message-history');
const contextAnalyzer = require('../extensions/context-analyzer');
const commands = require('./commands');
const searchHandler = require('./search-handler'); // Brave Search機能を追加
const logger = require('../system/logger');
const config = require('../config/env');
const syncUtil = require('../local-sync-utility');

// ユーティリティをインポート
const userDisplay = require('../core/utils/user-display');
const timeContext = require('../core/utils/time-context');

// AIサービスの初期化
const aiService = initializeAIService();

function initializeAIService() {
  try {
    if (config.DM_MESSAGE_HANDLER === 'new') {
      // 新しいプロバイダーシステムを使用
      // パス解決を標準的な方法に変更
      const providersPath = path.resolve(__dirname, '../extensions/providers');
      
      // デバッグ出力（モジュール解決の確認用）
      if (config.DEBUG) {
        logger.debug(`プロバイダーモジュールパス: ${providersPath}`);
        logger.debug(`現在の作業ディレクトリ: ${process.cwd()}`);
      }
      
      return syncUtil.safeRequire(providersPath, {
        getProvider: () => null,
        getResponse: async () => 'AIサービスが初期化されていません',
        getProviderName: () => 'fallback'
      });
    } else {
      // レガシーシステムの使用
      try {
        let service = null;
        if (config.AI_PROVIDER === 'openai') {
          service = syncUtil.safeRequire('../openai-service');
        } else {
          service = syncUtil.safeRequire('../gemini-service');
        }
        
        // 読み込んだサービスがAPI関数を持っているか確認
        if (service && typeof service.getAIResponse === 'function') {
          // レガシーインターフェースのラッパー作成
          logger.debug(`AIサービスをロード: ${config.AI_PROVIDER} (レガシーインターフェース対応)`);
          return {
            ...service,
            getResponse: async (context) => {
              // contextオブジェクトをレガシーパラメータに変換
              const userId = context.userId || 'unknown';
              const username = context.username || 'User';
              const message = context.message || '';
              const isDM = context.isDM || context.contextType === 'direct_message';
              
              // レガシーメソッドを呼び出し
              return await service.getAIResponse(userId, message, username, isDM);
            }
          };
        }
        
        return service;
      } catch (error) {
        logger.error(`レガシーAIサービスロードエラー: ${error.message}`, error);
        // フォールバックオブジェクト
        return {
          getResponse: async () => 'AIサービスが正しく初期化されませんでした。',
          isConfigured: () => false
        };
      }
    }
  } catch (error) {
    logger.error('AIサービスの初期化失敗:', error);
    // エラー詳細出力（トラブルシューティング用）
    if (config.DEBUG) {
      logger.debug(`初期化エラー詳細: ${error.stack || '詳細なし'}`);
    }
    return {
      getResponse: async () => 'AIサービスの読み込みに失敗しました',
      isConfigured: () => false
    };
  }
}

async function handleMessage(message, client) {
  if (!validateParameters(message, client)) return;
  if (message.author?.bot) return;

  logIncomingMessage(message);

  // DMチャンネル判定の方法を多重化（より堅牢なアプローチ）
  // 1. instanceofによる判定（最も信頼性高）
  // 2. ChannelTypeによる判定（Discord.js v14用）
  // 3. チャンネルタイプ値による判定（レガシー互換性）
  // 4. channel.typeが'DM'文字列かどうか（文字列互換性）
  const isDMByInstance = message.channel instanceof DMChannel;
  const isDMByEnum = message.channel?.type === ChannelType.DM;
  const isDMByValue = typeof message.channel?.type === 'number' && message.channel.type === 1;
  const isDMByString = message.channel?.type === 'DM';
  
  // いずれかの方法でDMと判定された場合はDMとして扱う
  const isDM = isDMByInstance || isDMByEnum || isDMByValue || isDMByString;
  
  // デバッグログの追加（詳細な診断情報）
  if (config.DEBUG) {
    logger.debug(`メッセージチャンネルタイプ: ${message.channel?.type} (${typeof message.channel?.type})`);
    logger.debug(`DMチャンネル判定結果: instanceOf=${isDMByInstance}, enum=${isDMByEnum}, value=${isDMByValue}, string=${isDMByString}`);
    logger.debug(`最終DMチャンネル判定: ${isDM}`);
    
    // チャンネルオブジェクトの詳細情報（診断用）
    if (message.channel) {
      logger.debug(`チャンネル情報: id=${message.channel.id}, constructor=${message.channel.constructor?.name || '不明'}`);
    }
  }
  
  const isMentioned = message.mentions?.has?.(client.user?.id);

  // コマンドを処理（コマンドが実行された場合は終了）
  if (await handleCommandIfPresent(message, client)) return;
  
  // 検索トリガーを処理（検索が実行された場合は終了）
  if (config.DEBUG) {
    logger.debug(`検索トリガーチェック開始: "${message.content?.substring(0, 30) || '内容なし'}..."`);
    logger.debug(`検索環境変数詳細:`);
    logger.debug(`- BRAVE_API_KEY設定状態: ${Boolean(process.env.BRAVE_API_KEY)}`);
    logger.debug(`- BRAVE_SEARCH_API_KEY設定状態: ${Boolean(process.env.BRAVE_SEARCH_API_KEY)}`);
    logger.debug(`- config.BRAVE_API_KEY設定状態: ${Boolean(config.BRAVE_API_KEY)}`);
    logger.debug(`- config.SEARCH_ENABLED設定状態: ${Boolean(config.SEARCH_ENABLED)}`);
    
    // 環境変数からBRAVEの設定を直接出力（キー値そのものはセキュリティ上出力しない）
    const envKeys = Object.keys(process.env).filter(key => key.includes('BRAVE')).join(', ');
    logger.debug(`- BRAVE関連の環境変数: ${envKeys || 'なし'}`);
  }
  
  try {
    // 検索ハンドラーの実行
    if (searchHandler && typeof searchHandler.handleSearchIfTriggered === 'function') {
      // 検索トリガーチェックとハンドリングを実行
      const searchTriggered = await searchHandler.handleSearchIfTriggered(message);
      
      if (searchTriggered) {
        // 検索が実行された場合はメッセージを履歴に保存して終了
        await saveMessageToHistory(message);
        if (config.DEBUG) {
          logger.debug('検索処理完了、メッセージハンドラー終了');
        }
        return;
      }
    } else if (config.DEBUG) {
      logger.debug('検索ハンドラーが使用できません');
    }
  } catch (searchError) {
    logger.error(`検索処理エラー: ${searchError.message}`);
    // エラーが発生しても処理は継続（堅牢性を優先）
  }

  await saveMessageToHistory(message);

  // ユーザーコンテキストの保存 - メッセージの内容をトピックとして保存
  // 実際のプロダクションでは、意味解析などで要約したキーワードを使用すると良い
  if (message.author?.id && message.content) {
    // 簡易的なメッセージ要約 - 長さ制限と非ASCII文字の除去
    const simplifiedContent = message.content
      .replace(/[^\x00-\x7F]/g, '') // 非ASCII文字除去
      .trim().slice(0, 50);  // 50文字に制限
      
    timeContext.saveUserContext(message.author.id, simplifiedContent);
    
    if (config.DEBUG) {
      logger.debug(`ユーザーコンテキスト保存: ${message.author.id}, トピック: ${simplifiedContent}`);
    }
  }

  const shouldRespond = await evaluateIntervention(message, client, isDM, isMentioned);

  if (shouldRespond) {
    const contextType = isDM ? 'direct_message' : (isMentioned ? 'mention' : 'intervention');
    await handleAIResponse(message, client, contextType);
  }
}

function validateParameters(message, client) {
  if (!message || !client) {
    logger.error('handleMessage: messageまたはclientが無効');
    return false;
  }
  if (!message.author) {
    logger.error('handleMessage: author情報が欠如');
    return false;
  }
  return true;
}

function logIncomingMessage(message) {
  const content = message.content || '[empty]';
  if (config.DEBUG) {
    logger.debug(`Received: ${content}`);
    logger.debug(`User: ${message.author.tag} (${message.author.id})`);
    logger.debug(`Channel: ${message.channel?.id}`);
  } else {
    logger.info(`Message from ${message.author.tag}: "${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"`);
  }
}

async function handleCommandIfPresent(message, client) {
  const prefix = process.env.PREFIX || '!';
  if (typeof message.content !== 'string' || !message.content.startsWith(prefix)) return false;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  try {
    logger.info(`Command: ${command}`);
    return await commands.executeCommand(command, args, message, client);
  } catch (error) {
    logger.error(`コマンド処理中のエラー: ${error.message}`, error);
    return false;
  }
}

async function saveMessageToHistory(message) {
  // DMチャンネル判定の改良メソッド
  const isDMByInstance = message.channel instanceof DMChannel;
  const isDMByEnum = message.channel?.type === ChannelType.DM;
  const isDMByValue = typeof message.channel?.type === 'number' && message.channel.type === 1;
  const isDMByString = message.channel?.type === 'DM';
  const isDM = isDMByInstance || isDMByEnum || isDMByValue || isDMByString;
  
  // DMチャンネルの場合は履歴に保存しない（一時的な履歴システムのみ）
  if (isDM || !messageHistory?.addMessageToHistory) {
    // DMの場合でも永続メモリシステムには保存する
    await saveToMemorySystem(message, isDM);
    return;
  }
  
  // GuildTextチャンネルかもチェック（数値と文字列の両方に対応）
  // Discord.js v14では ChannelType.GuildText を使う
  const isGuildText = message.channel?.type === ChannelType.GuildText || 
                     message.channel?.type === 0 || 
                     message.channel?.type === 'GUILD_TEXT';
                     
  // GuildTextチャンネル以外は処理しない（一時的な履歴システムのみ）
  if (!isGuildText) {
    // 永続メモリシステムには保存する
    await saveToMemorySystem(message, isDM);
    return;
  }

  try {
    // 一時的な履歴システムに保存
    const entry = {
      id: message.id,
      content: message.content || '',
      author: {
        id: message.author?.id,
        username: message.author?.username,
        bot: message.author?.bot
      },
      timestamp: message.createdTimestamp || Date.now() // 'timestamp'に統一
    };
    messageHistory.addMessageToHistory(message.channelId, entry);
    if (config.DEBUG) logger.debug(`Message saved to history: ${message.channelId}`);
    
    // 永続メモリシステムにも保存
    await saveToMemorySystem(message, isDM);
  } catch (error) {
    logger.error(`履歴保存エラー: ${error.message}`, error);
  }
}