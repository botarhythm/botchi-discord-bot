/**
 * Bocchy Discord Bot - メッセージハンドラー（改良版）
 * 文脈介入機能の堅牢性と最適化を目的としたリファクタリング
 */

const { ChannelType, EmbedBuilder, DMChannel } = require('discord.js');
const path = require('path');
const messageHistory = require('../extensions/message-history');
const contextAnalyzer = require('../extensions/context-analyzer');
const commands = require('./commands');
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

  if (await handleCommandIfPresent(message, client)) return;

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

/**
 * メッセージを永続メモリシステムに保存する
 * @param {Object} message - Discord.jsのメッセージオブジェクト
 * @param {boolean} isDM - DMチャンネルかどうか
 * @returns {Promise<Object|null>} 保存された会話コンテキスト、または失敗した場合はnull
 */
async function saveToMemorySystem(message, isDM) {
  // メモリシステムが有効かつロードされている場合、メッセージを永続化
  const memoryEnabled = config.MEMORY_ENABLED;
  if (!memoryEnabled) return null;
  
  try {
    // グローバル変数からメモリシステムを取得
    const memorySystem = global.botchiMemory || require('../extensions/memory');
    
    if (!memorySystem || !memorySystem.manager) {
      if (config.DEBUG) logger.debug('メモリシステムが初期化されていません');
      return null;
    }
    
    const userInfo = {
      userId: message.author?.id,
      channelId: message.channelId,
      guildId: message.guildId
    };
    
    // システムメッセージが指定されている場合は追加
    if (message.systemMessage) {
      userInfo.systemMessage = message.systemMessage;
    }
    
    // 会話コンテキストを取得または作成
    const conversationContext = await memorySystem.manager.getOrCreateConversationContext(userInfo);
    
    // メッセージをメモリシステムに追加
    await memorySystem.manager.addMessageToConversation(
      conversationContext.conversationId,
      'user',
      message.content || '',
      {
        messageId: message.id,
        timestamp: message.createdTimestamp || Date.now(),
        isDM: isDM
      }
    );
    
    if (config.DEBUG) {
      logger.debug(`Message saved to memory system: user ${message.author?.id}, conversation ${conversationContext.conversationId}`);
    }
    
    // 成功した場合は会話コンテキストを返す
    return conversationContext;
  } catch (error) {
    logger.error(`メモリシステム保存エラー: ${error.message}`, error);
    // エラーの詳細をデバッグ出力
    if (config.DEBUG) {
      logger.debug(`保存エラー詳細: ${error.stack || 'スタック情報なし'}`);
    }
    // エラー時も既存の処理は継続（フォールバックとして）
    return null;
  }
}

async function evaluateIntervention(message, client, isDM, isMentioned) {
  // DMや直接メンションの場合は常に応答する
  if (isDM || isMentioned) {
    if (config.DEBUG) logger.debug('Direct message or mention detected, will respond');
    return true;
  }

  try {
    // 文脈介入機能が有効かどうかをチェック
    const contextInterventionHandler = require('./context-intervention');
    
    if (!contextInterventionHandler || typeof contextInterventionHandler.shouldIntervene !== 'function') {
      logger.error('文脈介入ハンドラーが正しく読み込めませんでした');
      return false;
    }
    
    if (config.DEBUG) {
      logger.debug(`文脈介入判断開始: ${message.content.substring(0, 30)}...`);
      logger.debug(`現在の介入モード: ${process.env.INTERVENTION_MODE || config.INTERVENTION_MODE || 'balanced'}`);
    }
    
    // 文脈介入ハンドラーを使用して判断
    const shouldIntervene = await contextInterventionHandler.shouldIntervene(message, client);
    
    if (config.DEBUG) {
      logger.debug(`文脈介入判断結果: ${shouldIntervene ? '介入する' : '介入しない'}`);
    }
    
    return shouldIntervene;
  } catch (error) {
    logger.error('介入判断エラー:', error);
    return false;
  }
}

/**
 * DMチャンネルにメッセージを安全に送信するヘルパー関数
 * @param {Object} message - Discordメッセージオブジェクト
 * @param {string} content - 送信するメッセージ内容
 * @param {boolean} useFallback - フォールバックを試みるかどうか
 * @returns {Promise<boolean>} 送信成功したかどうか
 */
async function safeSendDM(message, content, useFallback = true) {
  // 送信方法のプライオリティ順
  // 1. message.author.send() - ユーザーに直接送信（最も確実）
  // 2. message.channel.send() - チャンネル経由で送信（標準的）
  // 3. message.reply() - リプライとして送信（フォールバック）
  
  if (config.DEBUG) {
    logger.debug(`DM送信試行: ${content.slice(0, 30)}...`);
    // 診断用情報を追加
    logger.debug(`DM診断: message.author=${!!message.author}, message.channel=${!!message.channel}`);
    if (message.author) {
      logger.debug(`DM診断: author.id=${message.author.id}, author.send=${typeof message.author.send}`);
    }
    if (message.channel) {
      logger.debug(`DM診断: channel.id=${message.channel.id}, channel.send=${typeof message.channel.send}`);
    }
  }
  
  try {
    // 方法1: author.send() による直接送信
    if (message.author && typeof message.author.send === 'function') {
      try {
        await message.author.send(content);
        logger.debug('DMをauthor.send()で送信成功');
        return true;
      } catch (authorError) {
        logger.warn(`author.send()失敗: ${authorError.message}`);
        // 詳細なエラー情報をデバッグモードで記録
        if (config.DEBUG) {
          logger.debug(`author.send()エラー詳細: ${authorError.code || 'コードなし'}, ${authorError.name}`);
          logger.debug(`author.send()スタック: ${authorError.stack?.slice(0, 200) || 'なし'}`);
        }
        // 次の方法にフォールバック
      }
    }
    
    // 方法2: channel.send() によるチャンネル経由送信
    if (message.channel && typeof message.channel.send === 'function') {
      try {
        await message.channel.send(content);
        logger.debug('DMをchannel.send()で送信成功');
        return true;
      } catch (channelError) {
        logger.warn(`channel.send()失敗: ${channelError.message}`);
        // 詳細なエラー情報をデバッグモードで記録
        if (config.DEBUG) {
          logger.debug(`channel.send()エラー詳細: ${channelError.code || 'コードなし'}, ${channelError.name}`);
          logger.debug(`channel.send()スタック: ${channelError.stack?.slice(0, 200) || 'なし'}`);
        }
        // 次の方法にフォールバック
      }
    }
    
    // 方法3: reply() によるフォールバック送信（最終手段）
    if (useFallback && typeof message.reply === 'function') {
      try {
        await message.reply(content);
        logger.debug('DMをreply()でフォールバック送信成功');
        return true;
      } catch (replyError) {
        logger.error(`reply()によるフォールバック送信も失敗: ${replyError.message}`);
        if (config.DEBUG) {
          logger.debug(`reply()エラー詳細: ${replyError.code || 'コードなし'}, ${replyError.name}`);
          logger.debug(`reply()スタック: ${replyError.stack?.slice(0, 200) || 'なし'}`);
        }
        return false;
      }
    }
    
    // すべての方法が失敗した場合
    logger.error('DMの送信方法がすべて利用できません');
    return false;
  } catch (error) {
    logger.error(`DM送信失敗 (${error.name}): ${error.message}`);
    
    // エラー詳細をデバッグログに出力
    if (config.DEBUG) {
      logger.debug(`DM送信エラー詳細: ${error.code || 'コードなし'}, ${error.name}`);
      logger.debug(`DM送信スタック: ${error.stack?.slice(0, 200) || 'なし'}`);
    }
    
    // フォールバックが有効な場合は別の方法を試す
    if (useFallback && typeof message.reply === 'function') {
      try {
        await message.reply(content);
        logger.debug('DMをreply()でフォールバック送信成功');
        return true;
      } catch (fallbackError) {
        logger.error(`フォールバックDM送信も失敗: ${fallbackError.message}`);
        if (config.DEBUG) {
          logger.debug(`フォールバックエラー詳細: ${fallbackError.code || 'コードなし'}, ${fallbackError.name}`);
        }
        return false;
      }
    }
    
    return false;
  }
}

async function handleAIResponse(message, client, contextType) {
  try {
    // DMチャンネル判定の改良メソッド - 成功する判定方法をログに記録
    const isDMByInstance = message.channel instanceof DMChannel;
    const isDMByEnum = message.channel?.type === ChannelType.DM;
    const isDMByValue = typeof message.channel?.type === 'number' && message.channel.type === 1;
    const isDMByString = message.channel?.type === 'DM';
    const isDMByRecipient = Boolean(message.channel?.recipient || message.recipient); // 受信者情報がある場合
    
    // 成功した判定方法を記録
    const successfulMethods = [];
    if (isDMByInstance) successfulMethods.push('instanceof');
    if (isDMByEnum) successfulMethods.push('enum');
    if (isDMByValue) successfulMethods.push('numeric');
    if (isDMByString) successfulMethods.push('string');
    if (isDMByRecipient) successfulMethods.push('recipient');
    
    // 最終的なDM判定 - 受信者情報も考慮
    const isDM = isDMByInstance || isDMByEnum || isDMByValue || isDMByString || isDMByRecipient;
    
    // DMのチャンネル情報詳細ログ
    if (config.DEBUG) {
      logger.debug(`AI応答処理: チャンネルタイプ=${message.channel?.type}, isDM判定=${isDM}`);
      logger.debug(`DMチャンネル判定成功: [${successfulMethods.join(', ')}]`);
      logger.debug(`DMチャンネル判定詳細: instanceOf=${isDMByInstance}, enum=${isDMByEnum}, value=${isDMByValue}, string=${isDMByString}, recipient=${isDMByRecipient}`);
      
      // チャンネル詳細情報 - DMデバッグ用
      if (message.channel) {
        const channelKeys = Object.keys(message.channel).filter(k => !k.startsWith('_')).join(', ');
        logger.debug(`チャンネルプロパティ: ${channelKeys}`);
        logger.debug(`チャンネル情報: id=${message.channel.id}, type=${message.channel.type}, name=${message.channel.name || 'なし'}`);
        
        // 受信者情報があればログ
        if (message.channel.recipient) {
          logger.debug(`受信者情報: id=${message.channel.recipient.id}, username=${message.channel.recipient.username}`);
        }
      }
    }
    
    // タイピング表示の送信 - エラーでも続行
    try {
      if (message.channel?.sendTyping) {
        await message.channel.sendTyping();
      }
    } catch (typingError) {
      logger.debug(`タイピング状態の設定に失敗: ${typingError.message}`);
      // 続行 - タイピング表示は重要ではない
    }
    
    // 表示名の取得
    const displayName = userDisplay.getMessageAuthorDisplayName(message);
    
    // 時間帯に基づく挨拶の生成
    const timeGreeting = timeContext.getTimeBasedGreeting();
    
    // 日付と時刻の生成
    const dateTimeStr = timeContext.getFormattedDateTime(true);
    
    // ユーザーコンテキストからの継続性メッセージの生成
    const continuityMsg = timeContext.generateContinuityMessage(message.author.id);
    
    // AI応答用のコンテキスト準備
    const cleanContent = sanitizeMessage(message.content, contextType);
    
    // パーソナライズされたプロンプトを作成（自然な会話をAIモデルに促す）
    let personalizedPrefix = '';
    
    // タイムベースの挨拶を追加（名前は控えめに）
    personalizedPrefix += `${timeGreeting}。`;
    
    // 会話の継続性があれば追加
    if (continuityMsg) {
      personalizedPrefix += ` ${continuityMsg}`;
    }
    
    // 時間情報を追加（オプション）
    if (config.SHOW_DATETIME) {
      personalizedPrefix += ` 今日は${dateTimeStr}です。`;
    }
    
    // ユーザー名は表示しないがコンテキストには含める
    // AIモデルがユーザー名を必要に応じて自然に使えるように
    
    // AI応答のためのコンテキストプロンプトを構築
    const contextPrompt = await buildContextPrompt(message, cleanContent, contextType, personalizedPrefix);

    // AI応答用コンテキスト構築
    const aiContext = {
      userId: message.author.id,
      username: displayName,  // 表示名を使用
      message: contextPrompt,
      contextType,
      isDM, // DMかどうかの情報を追加
      displayName, // 表示名を追加
      timeGreeting, // 時間帯の挨拶
      dateTime: dateTimeStr, // 日付と時刻
      continuityContext: continuityMsg // 会話継続コンテキスト
    };

    // レスポンス取得処理の堅牢化
    let response;