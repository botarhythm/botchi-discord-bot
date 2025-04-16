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
  
  // 検索トリガーを処理（DMの場合は常に処理を継続、一般チャンネルの場合のみ検索が実行されたら終了）
  if (config.DEBUG) {
    logger.debug(`検索トリガーチェック開始: "${message.content?.substring(0, 30) || '内容なし'}..."`);
    logger.debug(`検索環境変数詳細:`);
    logger.debug(`- BRAVE_API_KEY設定状態: ${Boolean(process.env.BRAVE_API_KEY)}`);
    logger.debug(`- BRAVE_SEARCH_API_KEY設定状態: ${Boolean(process.env.BRAVE_SEARCH_API_KEY)}`);
    logger.debug(`- config.BRAVE_API_KEY設定状態: ${Boolean(config.BRAVE_API_KEY)}`);
    logger.debug(`- config.SEARCH_ENABLED設定状態: ${Boolean(config.SEARCH_ENABLED)}`);
    logger.debug(`- config.BRAVE_SEARCH_ENABLED設定状態: ${Boolean(config.BRAVE_SEARCH_ENABLED)}`);
    
    // 環境変数からBRAVEの設定を直接出力（キー値そのものはセキュリティ上出力しない）
    const envKeys = Object.keys(process.env).filter(key => key.includes('BRAVE')).join(', ');
    logger.debug(`- BRAVE関連の環境変数: ${envKeys || 'なし'}`);
    
    // キー長の検証（セキュリティに配慮して先頭3文字のみ表示）
    if (config.BRAVE_API_KEY) {
      const keyPreview = config.BRAVE_API_KEY.substring(0, 3) + '...';
      logger.debug(`- APIキー検証: ${keyPreview}, 長さ=${config.BRAVE_API_KEY.length}文字`);
    }
  }
  
  let searchExecuted = false;
  try {
    // 検索ハンドラーの実行
    if (searchHandler && typeof searchHandler.handleSearchIfTriggered === 'function') {
      // 検索トリガーチェックとハンドリングを実行
      const searchTriggered = await searchHandler.handleSearchIfTriggered(message);
      
      if (searchTriggered) {
        searchExecuted = true;
        if (config.DEBUG) {
          logger.debug(`検索処理完了: ${isDM ? 'DMチャンネル' : '通常チャンネル'}`);
        }
        
        // 検索が実行された場合はメッセージを履歴に保存して終了
        await saveMessageToHistory(message);
        if (config.DEBUG) {
          logger.debug('検索処理完了、メッセージハンドラー終了');
        }
        return;
      } else if (config.DEBUG) {
        // 検索トリガーが検出されなかった場合の詳細ログ
        const possibleTrigger = searchHandler.detectSearchTrigger(message.content);
        if (possibleTrigger) {
          logger.debug(`検索トリガー検出されたが処理されず: スコア=${possibleTrigger.score}, トリガー="${possibleTrigger.trigger}", クエリ="${possibleTrigger.query}"`);
        }
      }
    } else if (config.DEBUG) {
      logger.debug('検索ハンドラーが使用できません');
    }
  } catch (searchError) {
    logger.error(`検索処理エラー: ${searchError.message}`);
    
    // エラー詳細をデバッグログに出力（調査用）
    if (config.DEBUG) {
      logger.debug(`検索エラー詳細: ${searchError.stack || '詳細なし'}`);
      if (searchError.cause) {
        logger.debug(`検索エラー原因: ${searchError.cause}`);
      }
    }
    
    // エラーが発生しても処理は継続（堅牢性を優先）
  }
  
  // DMで検索が実行された場合、検索結果に加えてAIレスポンスも提供
  if (isDM && searchExecuted && config.DEBUG) {
    logger.debug('DMでの検索に加えて、AIレスポンスも生成します');
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
  
  // DMチャンネルの場合は履歴保存をスキップ
  if (isDM || !messageHistory?.addMessageToHistory) {
    if (config.DEBUG) logger.debug(`DMチャンネルまたは一時履歴システム未初期化のため一時履歴スキップ`);
    
    // DMメッセージのみは永続メモリシステムに保存
    if (isDM && config.MEMORY_ENABLED) {
      await saveToMemorySystem(message, isDM);
    }
    
    return;
  }
  
  // GuildTextチャンネルかもチェック（数値と文字列の両方に対応）
  // Discord.js v14では ChannelType.GuildText を使う
  const isGuildText = message.channel?.type === ChannelType.GuildText || 
                     message.channel?.type === 0 || 
                     message.channel?.type === 'GUILD_TEXT';
                     
  // GuildTextチャンネル以外は一時的な履歴システムには保存しない
  if (!isGuildText) {
    if (config.DEBUG) logger.debug(`GuildTextチャンネルでないため一時履歴スキップ`);
    return; // 永続メモリシステムには既に保存済みなのでここで終了
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
    if (config.DEBUG) logger.debug(`一時履歴システムに保存: ${message.channelId}`);
    
    // 通常のチャンネルメッセージも永続メモリシステムに保存
    if (config.MEMORY_ENABLED) {
      await saveToMemorySystem(message, false);
    }
  } catch (error) {
    logger.error(`一時履歴保存エラー: ${error.message}`, error);
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
    
    try {
      // 新プロバイダーシステムのチェック
      if (config.DM_MESSAGE_HANDLER === 'new' && aiService.getProvider) {
        const provider = aiService.getProvider();
        if (provider) {
          if (config.DEBUG) {
            logger.debug(`プロバイダー ${aiService.getProviderName?.() || 'unknown'} を使用`);
          }
          
          // プロバイダーのメソッドを確認
          if (typeof provider.getResponse === 'function') {
            response = await provider.getResponse(aiContext);
          } else if (typeof provider.getAIResponse === 'function') {
            response = await provider.getAIResponse(
              aiContext.userId,
              aiContext.message,
              aiContext.username,
              isDM // 直接isDMを渡す
            );
          } else if (typeof aiService.getResponse === 'function') {
            // フォールバック: プロバイダーマネージャー自体のgetResponseを使用
            response = await aiService.getResponse(aiContext);
          } else {
            throw new Error('使用可能なAI応答取得メソッドがありません');
          }
        } else {
          // プロバイダーが取得できない場合はaiServiceに直接問い合わせ
          if (typeof aiService.getResponse === 'function') {
            response = await aiService.getResponse(aiContext);
          } else {
            throw new Error('AIサービスに応答取得メソッドがありません');
          }
        }
      } else {
        // レガシーシステムの場合
        response = await aiService.getResponse(aiContext);
      }
    } catch (aiError) {
      logger.error('AI応答取得エラー:', aiError);
      throw new Error(`AI応答の取得に失敗しました: ${aiError.message}`);
    }

    if (!response) throw new Error('AI応答がありません（空の応答）');
    
    // 日付のハルシネーション修正 - 必要な場合のみレスポンス後処理
    try {
      // 日付表現を含む場合のみ処理（処理負荷軽減）
      if (response.includes('年') && response.includes('月') && response.includes('日')) {
        const correctDateTime = timeContext.getFormattedDateTime(true);
        // 間違った日付パターンを検出して修正する
        response = postProcessResponseDates(response, correctDateTime);
        
        if (config.DEBUG) {
          logger.debug(`日付後処理適用後のレスポンス長: ${response.length}文字`);
        }
      } else if (config.DEBUG) {
        logger.debug(`日付表現なしと判断、後処理をスキップ`);
      }
    } catch (postProcessError) {
      logger.error(`日付後処理エラー: ${postProcessError.message}`, postProcessError);
      // エラー時は元のレスポンスを使用（処理を継続）
    }

    // DMチャンネルとサーバーチャンネルで異なる応答処理
    const replies = splitMessage(response);
    
    if (isDM) {
      // DMの場合は安全送信ヘルパーを使用
      let allSucceeded = true;
      
      // 診断用に応答前にDMチャンネル状態をログ
      if (config.DEBUG) {
        logger.debug(`DM応答処理前診断情報: isDM=${isDM}, メッセージ分割=${replies.length}件`);
        logger.debug(`DM診断: message.channel.constructor=${message.channel?.constructor?.name || 'なし'}`);
        logger.debug(`DM診断: message.author=${message.author ? '存在' : 'なし'}`);
        
        // DMChannel固有のプロパティをチェック
        if (message.channel) {
          const hasRecipient = Boolean(message.channel.recipient);
          logger.debug(`DM診断: channel.recipient=${hasRecipient}, recipientId=${message.channel.recipient?.id || 'なし'}`);
          logger.debug(`DM診断: channel.type=${message.channel.type}, DMValue=${ChannelType.DM}`);
          
          // DMChannelに特有のプロパティ一覧
          const channelKeys = Object.keys(message.channel)
            .filter(k => !k.startsWith('_') && typeof message.channel[k] !== 'function')
            .join(', ');
          logger.debug(`DMチャンネルプロパティ: ${channelKeys}`);
        }
      }
      
      // レスポンスの送信を試みる
      for (const chunk of replies) {
        const success = await safeSendDM(message, chunk, true);
        if (!success) {
          allSucceeded = false;
          logger.error(`DM応答の一部送信に失敗: ${chunk.slice(0, 30)}...`);
          
          // 詳細な診断情報をログに出力
          if (config.DEBUG) {
            logger.debug(`失敗した送信チャンク: "${chunk.slice(0, 50)}..."`);
            logger.debug(`送信失敗時の作業ディレクトリ: ${process.cwd()}`);
            logger.debug(`送信失敗時の環境変数: NODE_ENV=${process.env.NODE_ENV}`);
          }
        }
      }
      
      if (allSucceeded) {
        logger.debug('すべてのDM応答を送信成功');
      } else {
        // 少なくとも一部の送信が失敗した場合、最後にもう一度通知を試みる
        try {
          // より積極的なフォールバックを試みる
          if (config.DEBUG) {
            logger.debug('DM送信失敗後のフォールバック戦略を実行');
          }
          
          // まず通常のsafeSendDMを試す
          let fallbackSuccess = await safeSendDM(message, '一部のメッセージが正しく送信できなかった可能性があります。', true);
          
          // 失敗した場合は、直接メソッドを呼び出してみる
          if (!fallbackSuccess && message.author && typeof message.author.send === 'function') {
            try {
              await message.author.send('メッセージの送信に問題が発生しました。');
              logger.debug('DM通知を直接author.sendで送信成功');
              fallbackSuccess = true;
            } catch (directError) {
              logger.warn(`直接のauthor.send通知も失敗: ${directError.message}`);
            }
          }
          
          // どちらも失敗した場合はログに記録
          if (!fallbackSuccess) {
            logger.error('すべてのDM送信方法が失敗しました。ユーザーへメッセージを届けられません。');
          }
        } catch (notifyError) {
          logger.error('DMエラー通知の送信にも失敗:', notifyError);
        }
      }
    } else {
      // 通常チャンネルでは従来通りreplyを使用
      try {
        for (const chunk of replies) {
          await message.reply(chunk);
        }
      } catch (replyError) {
        logger.error('通常チャンネルでの応答送信エラー:', replyError);
        
        // フォールバックとしてchannel.sendを試す
        try {
          for (const chunk of replies) {
            await message.channel.send(chunk);
          }
          logger.debug('チャンネル応答をchannel.sendでフォールバック送信成功');
        } catch (fallbackError) {
          logger.error('フォールバック応答も失敗:', fallbackError);
          throw new Error('チャンネル応答送信が失敗しました');
        }
      }
    }

    // AIの応答をメモリシステムに保存
    if (config.MEMORY_ENABLED) {
      try {
        // グローバル変数からメモリシステムを取得
        const memorySystem = global.botchiMemory || require('../extensions/memory');
        
        if (memorySystem && memorySystem.manager) {
          const userInfo = {
            userId: message.author.id,
            channelId: message.channelId, 
            guildId: message.guildId
          };
          
          // 既存の会話コンテキストを取得、または新規作成
          const conversationContext = await memorySystem.manager.getOrCreateConversationContext(userInfo);
          
          if (conversationContext) {
            // AIの応答をメモリシステムに追加
            await memorySystem.manager.addMessageToConversation(
              conversationContext.conversationId,
              'assistant',
              response,
              {
                timestamp: Date.now(),
                contextType: contextType,
                messageLength: response.length
              }
            );
            
            if (config.DEBUG) {
              const msgCount = conversationContext.messageCount || 0;
              logger.debug(`AI応答をメモリシステムに保存: ${conversationContext.conversationId} (メッセージ数: ${msgCount + 1})`);
            }
          }
        }
      } catch (memoryError) {
        logger.error(`メモリ保存エラー: ${memoryError.message}`);
        // エラーの詳細をデバッグ出力
        if (config.DEBUG) {
          logger.debug(`AI応答保存エラー詳細: ${memoryError.stack || 'スタック情報なし'}`);
        }
        // エラーが発生しても応答処理は続行
      }
    }

    // 全ての応答パターンでメッセージ時間を更新する（DMでなくても）
    messageHistory?.updateLastBotMessageTime?.(message.channelId, client.user?.id);
    if (config.DEBUG) {
      logger.debug(`メッセージ履歴の時間更新: ${message.channelId}`);
    }

    logger.info(`AI応答完了（${contextType}）: ${response.length}文字`);
  } catch (error) {
    logger.error('AI応答処理エラー:', error);
    // 詳細なエラー情報をデバッグ出力
    if (config.DEBUG) {
      logger.debug(`応答エラー詳細: ${error.stack || 'スタック情報なし'}`);
    }
    
    try {
      // DMチャンネル判定（エラーハンドリング用）- 簡略化バージョン
      const isDM = message.channel instanceof DMChannel || 
                  message.channel?.type === ChannelType.DM || 
                  message.channel?.type === 1 || 
                  message.channel?.type === 'DM' ||
                  Boolean(message.channel?.recipient || message.recipient);
      
      // エラーメッセージは安全送信ヘルパーを使用
      const errorMessage = '応答の生成中にエラーが発生しました。しばらく経ってからお試しください。';
      
      if (isDM) {
        await safeSendDM(message, errorMessage, true);
      } else {
        // 通常チャンネルではreplyを使用し、失敗したらchannel.sendを試す
        try {
          await message.reply(errorMessage);
        } catch (replyError) {
          try {
            await message.channel.send(errorMessage);
          } catch (sendError) {
            logger.error('エラーメッセージの送信にも失敗:', sendError);
          }
        }
      }
    } catch (e) {
      logger.error('エラーメッセージ送信失敗:', e);
    }
  }
}

function sanitizeMessage(content, contextType) {
  if (!content) return 'こんにちは';
  if (contextType === 'mention') return content.replace(/<@!?[\d]+>/g, '').trim() || 'こんにちは';
  return content;
}

/**
 * コンテキストプロンプトを構築する
 * @param {Object} message - Discordメッセージオブジェクト
 * @param {string} content - メッセージ内容
 * @param {string} contextType - コンテキストタイプ ('direct_message', 'mention', 'intervention')
 * @param {string} personalizedPrefix - パーソナライズされた挨拶プレフィックス（オプション）
 * @returns {Promise<string>} 構築されたプロンプト
 */
async function buildContextPrompt(message, content, contextType, personalizedPrefix = '') {
  try {
    // パーソナライズされたプレフィックスがあれば、DMや直接メンションの時に使用
    if (personalizedPrefix && (contextType === 'direct_message' || contextType === 'mention')) {
      // ユーザーの表示名を取得 (コンテキスト用)
      const displayName = userDisplay.getMessageAuthorDisplayName(message);
      
      // プロンプトの先頭にパーソナライズされたプレフィックスを追加
      let prompt = `${personalizedPrefix}\n\n`;
      
      // メモリシステムからの会話履歴取得（メモリシステムが有効な場合）
      let memoryMessages = [];
      const memoryEnabled = config.MEMORY_ENABLED;
      
      if (memoryEnabled && (contextType === 'direct_message' || contextType === 'mention')) {
        try {
          // グローバル変数からメモリシステムを取得
          const memorySystem = global.botchiMemory || require('../extensions/memory');
          
          if (memorySystem && memorySystem.manager) {
            const userInfo = {
              userId: message.author?.id,
              channelId: message.channelId,
              guildId: message.guildId
            };
            
            // 会話コンテキストを取得
            const conversationContext = await memorySystem.manager.getOrCreateConversationContext(userInfo);
            
            // 会話履歴を取得（取得数を増やして文脈の理解を深める）
            if (conversationContext && conversationContext.conversationId) {
              memoryMessages = await memorySystem.manager.getContextMessages(
                conversationContext.conversationId, 
                10 // 直近10件のメッセージを取得（会話の文脈をより深く理解）
              );
              
              if (config.DEBUG) {
                logger.debug(`会話履歴を ${memoryMessages.length} 件取得: ${conversationContext.conversationId}`);
                if (memoryMessages.length > 0) {
                  logger.debug(`最新メッセージ: "${memoryMessages[memoryMessages.length-1]?.content?.slice(0, 30)}..."`);
                }
              }
            }
          }
        } catch (error) {
          logger.error(`会話履歴取得エラー: ${error.message}`, error);
          // エラーの詳細をデバッグ出力
          if (config.DEBUG) {
            logger.debug(`履歴取得エラー詳細: ${error.stack || 'スタック情報なし'}`);
          }
          // エラー時は履歴なしで続行
        }
      }
      
      // 会話履歴がある場合はプロンプトに追加（更に改良：自然な会話を促進）
      if (memoryMessages.length > 0) {
        // 最新のメッセージを取得（直近3件と少し前の重要なもの）
        const recentMessages = memoryMessages.slice(-3); // 直近3件
        const olderRelevantMessages = memoryMessages.slice(0, -3); // それ以前
        
        // 過去の会話から重要なものだけ選択（例：質問と回答のペア）
        let relevantOlderMessages = [];
        if (olderRelevantMessages.length > 0) {
          // 質問と回答のペアを特定する簡易ロジック
          for (let i = 0; i < olderRelevantMessages.length - 1; i++) {
            const msg = olderRelevantMessages[i];
            const nextMsg = olderRelevantMessages[i + 1];
            
            // ユーザーの質問とボットの回答のペアを見つける
            if (msg.role === 'user' && nextMsg.role === 'assistant') {
              // 質問文の特徴（疑問符や質問っぽい言葉を含む）をチェック
              const isQuestion = msg.content.includes('？') || 
                               msg.content.includes('?') || 
                               msg.content.includes('教えて') ||
                               msg.content.includes('わからない') ||
                               msg.content.includes('どう') ||
                               msg.content.includes('何');
              
              if (isQuestion) {
                relevantOlderMessages.push(msg);
                relevantOlderMessages.push(nextMsg);
                i++; // ペアをスキップ
              }
            }
          }
          
          // 重要な会話が見つからない場合は、最初の会話と最後の会話を含める
          if (relevantOlderMessages.length === 0 && olderRelevantMessages.length >= 2) {
            // 会話の開始点
            relevantOlderMessages.push(olderRelevantMessages[0]);
            // 少し前の会話のコンテキスト
            relevantOlderMessages.push(olderRelevantMessages[olderRelevantMessages.length - 1]);
          }
        }
        
        // 自然な形で会話履歴を提示（区切りを最小限に）
        prompt += '過去の会話内容：\n';
        
        // 関連性の高い過去の会話を表示（量を絞る）
        if (relevantOlderMessages.length > 0) {
          for (const msg of relevantOlderMessages) {
            const roleName = msg.role === 'user' ? displayName : 'Bocchy';
            prompt += `${roleName}: ${msg.content}\n`;
          }
          prompt += '\n--- 最近の会話 ---\n';
        }
        
        // 直近の会話を表示
        for (const msg of recentMessages) {
          const roleName = msg.role === 'user' ? displayName : 'Bocchy';
          prompt += `${roleName}: ${msg.content}\n`;
        }
        prompt += '\n';
        
        // 自然な連続性を促す指示（より短く自然に）
        prompt += '上記の会話の流れと文脈を自然に引き継いで会話を続けてください。\n\n';
      }
      
      // RAGシステムが有効かつ初期化されている場合、関連コンテキストをプロンプトに追加
      let ragContext = '';
      const ragEnabled = process.env.RAG_ENABLED === 'true';
      
      if (ragEnabled) {
        try {
          // グローバル変数からRAGシステムを取得
          const ragSystem = global.botchiRAG;
          
          if (ragSystem) {
            // RAGシステムが初期化されているか確認
            const isInitialized = typeof ragSystem.isInitialized === 'function' 
              ? ragSystem.isInitialized() 
              : (ragSystem.state && ragSystem.state.initialized);
            
            if (isInitialized) {
              if (config.DEBUG) {
                logger.debug(`RAGシステムを使用して関連コンテキストを検索: "${content.substring(0, 30)}..."`);
              }
              
              // ユーザーの質問に関連する情報をRAGシステムから検索
              if (typeof ragSystem.processMessage === 'function') {
                // 新しいRAGモジュールインターフェースを使用
                const searchResult = await ragSystem.processMessage(content, {
                  similarityThreshold: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.75'),
                  maxResults: parseInt(process.env.RAG_MAX_RESULTS || '3', 10)
                });
                
                if (searchResult && searchResult.context) {
                  ragContext = searchResult.context;
                  
                  if (config.DEBUG) {
                    logger.debug(`RAGコンテキスト取得成功: ${ragContext.length}文字, ${searchResult.results.length}件の結果`);
                    if (searchResult.results.length > 0) {
                      logger.debug(`最も関連性の高い結果: "${searchResult.results[0].content.substring(0, 50)}..." (類似度: ${searchResult.results[0].similarity.toFixed(2)})`);
                    }
                  }
                }
              } else if (typeof ragSystem.generateContextForPrompt === 'function') {
                // 互換性のためのレガシーインターフェース
                ragContext = await ragSystem.generateContextForPrompt(content, {
                  similarityThreshold: 0.75,
                  limit: 3 // 最大3つの関連情報
                });
                
                if (config.DEBUG && ragContext) {
                  logger.debug(`レガシーRAGインターフェースからコンテキスト取得: ${ragContext.length}文字`);
                }
              } else if (typeof ragSystem.search === 'function') {
                // 直接検索インターフェースのフォールバック
                try {
                  const searchResults = await ragSystem.search(content);
                  if (searchResults && searchResults.length > 0) {
                    ragContext = '参考資料：\n\n';
                    searchResults.forEach((result, index) => {
                      const title = result.metadata && result.metadata.title 
                        ? result.metadata.title 
                        : `情報 ${index + 1}`;
                      
                      ragContext += `[${title}]\n${result.content}\n\n`;
                    });
                    
                    if (config.DEBUG) {
                      logger.debug(`直接検索インターフェースからコンテキスト生成: ${ragContext.length}文字, ${searchResults.length}件の結果`);
                    }
                  }
                } catch (searchError) {
                  logger.error(`RAG直接検索エラー: ${searchError.message}`);
                }
              }
              
              // 取得したRAGコンテキストをプロンプトに追加
              if (ragContext && ragContext.trim().length > 0) {
                prompt += `${ragContext}\n\n`;
              }
            } else if (config.DEBUG) {
              logger.debug('RAGシステムは有効ですが初期化されていません');
            }
          }
        } catch (ragError) {
          logger.error(`RAGコンテキスト取得エラー: ${ragError.message}`, ragError);
          // エラーの詳細をデバッグ出力
          if (config.DEBUG) {
            logger.debug(`RAGエラー詳細: ${ragError.stack || 'スタック情報なし'}`);
          }
          // RAGエラー時も処理を続行
        }
      }
      
      // ユーザーメッセージを追加（名前は付けない - より自然な会話に）
      prompt += `${content}\n\n`;
      
      // システム指示を追加（AIモデル向け）- 日付のハルシネーション防止指示を追加
      prompt += `${displayName}さんとの会話です。文脈に応じて自然な形で対応し、必要に応じて適切なタイミングでのみ名前を使用してください。\n`;
      
      // 日付のハルシネーション防止のための指示（シンプル化）
      const dateTimeStr = timeContext.getFormattedDateTime(true);
      prompt += `今日の日付は ${dateTimeStr} です。\n`;
      
      return prompt;
    }
    
    // 文脈介入の場合は従来通りの処理
    if (contextType === 'intervention') {
      const recentMessages = messageHistory.getRecentMessages(message.channelId, 5) || [];
      
      // 表示名を使用して文脈メッセージを構築
      const lines = recentMessages.map(msg => {
        // メッセージのauthorがオブジェクトの場合（履歴からの取得）
        if (typeof msg.author === 'object') {
          const authorName = msg.author?.username || 'ユーザー';
          return `${authorName}: ${msg.content}`;
        } else {
          // 文字列の場合
          return `${msg.author || 'ユーザー'}: ${msg.content}`;
        }
      });
      
      // 現在のメッセージを追加
      const authorDisplayName = userDisplay.getMessageAuthorDisplayName(message);
      lines.push(`${authorDisplayName}: ${content}`);
      
      return `（以下は会話の文脈です。必要であれば自然に参加してください）\n\n${lines.join('\n')}\n\n自然な会話の流れに沿って返答してください。`;
    }
    
    // それ以外の場合は単純にコンテンツを返す
    return content;
  } catch (error) {
    logger.error('文脈プロンプト生成エラー:', error);
    // エラーの場合、パーソナライズされたプレフィックスがあればそれを追加
    if (personalizedPrefix) {
      return `${personalizedPrefix}\n\n${content}`;
    }
    return content;
  }
}

function splitMessage(text, maxLength = 2000) {
  if (!text) return [];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    chunks.push(remaining.slice(0, maxLength));
    remaining = remaining.slice(maxLength);
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/**
 * シンプル化された日付ハルシネーション修正
 * 明らかに誤った年の日付のみを修正
 * @param {string} response - AIからの応答テキスト
 * @param {string} correctDateTime - 正しい日付時刻文字列（「2025年4月15日（火曜日）、15時30分」形式）
 * @returns {string} 修正後のテキスト
 */
function postProcessResponseDates(response, correctDateTime) {
  if (!response) return response;
  
  try {
    // 現在の正しい日付情報を取得
    const currentYearMatch = correctDateTime.match(/(\d{4})年/);
    const currentMonthMatch = correctDateTime.match(/(\d{1,2})月/);
    const currentDayMatch = correctDateTime.match(/(\d{1,2})日/);
    
    if (!currentYearMatch || !currentMonthMatch || !currentDayMatch) {
      return response; // 解析に失敗した場合は修正せず
    }
    
    const currentYear = currentYearMatch[1];
    const correctDateShort = `${currentYear}年${currentMonthMatch[1]}月${currentDayMatch[1]}日`;
    
    // 明らかに誤った年の日付（2024年以前）のみを置換
    const wrongYearPattern = /20(?:1\d|2[0-4])年\d{1,2}月\d{1,2}日/g;
    return response.replace(wrongYearPattern, correctDateShort);
  } catch (error) {
    logger.error('日付後処理エラー:', error);
    return response; // エラー時は元のレスポンスを返す
  }
}

module.exports = { handleMessage };
