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
      if (config.AI_PROVIDER === 'openai') {
        return syncUtil.safeRequire('../openai-service');
      } else {
        return syncUtil.safeRequire('../gemini-service');
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
  
  // DMチャンネルの場合は履歴に保存しない
  if (isDM || !messageHistory?.addMessageToHistory) return;
  
  // GuildTextチャンネルかもチェック（数値と文字列の両方に対応）
  // Discord.js v14では ChannelType.GuildText を使う
  const isGuildText = message.channel?.type === ChannelType.GuildText || 
                     message.channel?.type === 0 || 
                     message.channel?.type === 'GUILD_TEXT';
                     
  // GuildTextチャンネル以外は処理しない
  if (!isGuildText) return;

  try {
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
  } catch (error) {
    logger.error(`履歴保存エラー: ${error.message}`, error);
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
  }
  
  try {
    // 方法1: author.send() による直接送信
    if (message.author && typeof message.author.send === 'function') {
      await message.author.send(content);
      logger.debug('DMをauthor.send()で送信成功');
      return true;
    }
    
    // 方法2: channel.send() によるチャンネル経由送信
    if (message.channel && typeof message.channel.send === 'function') {
      await message.channel.send(content);
      logger.debug('DMをchannel.send()で送信成功');
      return true;
    }
    
    // 方法3: reply() によるフォールバック送信（最終手段）
    if (useFallback && typeof message.reply === 'function') {
      await message.reply(content);
      logger.debug('DMをreply()でフォールバック送信成功');
      return true;
    }
    
    // すべての方法が失敗した場合
    logger.error('DMの送信方法がすべて利用できません');
    return false;
  } catch (error) {
    logger.error(`DM送信失敗 (${error.name}): ${error.message}`);
    
    // エラー詳細をデバッグログに出力
    if (config.DEBUG) {
      logger.debug(`DM送信エラー詳細: ${error.stack || '詳細なし'}`);
    }
    
    // フォールバックが有効な場合は別の方法を試す
    if (useFallback && typeof message.reply === 'function') {
      try {
        await message.reply(content);
        logger.debug('DMをreply()でフォールバック送信成功');
        return true;
      } catch (fallbackError) {
        logger.error(`フォールバックDM送信も失敗: ${fallbackError.message}`);
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
    
    // AI応答用のコンテキスト準備
    const cleanContent = sanitizeMessage(message.content, contextType);
    const contextPrompt = await buildContextPrompt(message, cleanContent, contextType);

    const aiContext = {
      userId: message.author.id,
      username: message.author.username,
      message: contextPrompt,
      contextType,
      isDM // DMかどうかの情報を追加
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

    // DMチャンネルとサーバーチャンネルで異なる応答処理
    const replies = splitMessage(response);
    
    if (isDM) {
      // DMの場合は安全送信ヘルパーを使用
      let allSucceeded = true;
      for (const chunk of replies) {
        const success = await safeSendDM(message, chunk, true);
        if (!success) {
          allSucceeded = false;
          logger.error(`DM応答の一部送信に失敗: ${chunk.slice(0, 30)}...`);
        }
      }
      
      if (allSucceeded) {
        logger.debug('すべてのDM応答を送信成功');
      } else {
        // 少なくとも一部の送信が失敗した場合、最後にもう一度通知を試みる
        try {
          await safeSendDM(message, '一部のメッセージが正しく送信できなかった可能性があります。', true);
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

async function buildContextPrompt(message, content, contextType) {
  if (contextType !== 'intervention') return content;

  try {
    const recentMessages = messageHistory.getRecentMessages(message.channelId, 5) || [];
    const lines = recentMessages.map(msg => `${msg.author?.username || 'ユーザー'}: ${msg.content}`);
    lines.push(`${message.author?.username || 'ユーザー'}: ${content}`);

    return `（以下は会話の文脈です。必要であれば自然に参加してください）\n\n${lines.join('\n')}\n\n自然な会話の流れに沿って返答してください。`;
  } catch (error) {
    logger.error('文脈プロンプト生成エラー:', error);
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

module.exports = { handleMessage };