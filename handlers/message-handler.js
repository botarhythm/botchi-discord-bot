/**
 * Bocchy Discord Bot - メッセージハンドラー（改良版）
 * 文脈介入機能の堅牢性と最適化を目的としたリファクタリング
 */

const { ChannelType, EmbedBuilder } = require('discord.js');
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

  // チャンネルタイプの判定を統一（数値型と文字列型の両方をチェック）
  const channelType = typeof message.channel?.type === 'number' ? message.channel.type : 
                     (message.channel?.type === 'DM' ? 1 : 0);
  const isDM = channelType === 1 || message.channel?.type === 'DM';
  
  // デバッグログの追加
  if (config.DEBUG) {
    logger.debug(`メッセージチャンネルタイプ: ${message.channel?.type} (${typeof message.channel?.type})`);
    logger.debug(`計算されたチャンネルタイプ: ${channelType}`);
    logger.debug(`DMチャンネル判定: ${isDM}`);
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
  // チャンネルタイプの判定を統一
  const channelType = typeof message.channel?.type === 'number' ? message.channel.type : 
                     (message.channel?.type === 'DM' ? 1 : 0);
  const isDM = channelType === 1 || message.channel?.type === 'DM';
  
  // DMチャンネルの場合は履歴に保存しない
  if (isDM || !messageHistory?.addMessageToHistory) return;
  
  // GuildTextチャンネルかもチェック（数値と文字列の両方に対応）
  if (channelType !== 0 && message.channel?.type !== 'GUILD_TEXT') return;

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

async function handleAIResponse(message, client, contextType) {
  try {
    // チャンネルタイプの判定を統一
    const channelType = typeof message.channel?.type === 'number' ? message.channel.type : 
                       (message.channel?.type === 'DM' ? 1 : 0);
    const isDM = channelType === 1 || message.channel?.type === 'DM';
    
    if (config.DEBUG) {
      logger.debug(`AI応答処理: チャンネルタイプ=${message.channel?.type}, channelType=${channelType}, isDM=${isDM}`);
    }
    
    try {
      await message.channel.sendTyping();
    } catch (typingError) {
      logger.debug('タイピング状態の設定に失敗しました:', typingError);
      // 続行 - タイピング表示は重要ではない
    }
    
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
      // DMの場合はchannnel.sendを使用
      try {
        for (const chunk of replies) {
          await message.channel.send(chunk);
        }
        logger.debug('DMに応答を送信しました');
      } catch (dmError) {
        logger.error('DMでの応答送信エラー:', dmError);
        // フォールバックとしてreplyを試す
        try {
          await message.channel.send('DMへの応答に問題が発生しました。通常の返信で試します...');
          for (const chunk of replies) {
            await message.reply(chunk);
          }
        } catch (fallbackError) {
          logger.error('フォールバック応答も失敗:', fallbackError);
          throw new Error('DMおよびフォールバックでの応答が失敗しました');
        }
      }
    } else {
      // 通常チャンネルでは従来通りreplyを使用
      for (const chunk of replies) {
        await message.reply(chunk);
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
      // チャンネルタイプの判定を再度行う
      const channelType = typeof message.channel?.type === 'number' ? message.channel.type : 
                         (message.channel?.type === 'DM' ? 1 : 0);
      const isDM = channelType === 1 || message.channel?.type === 'DM';
      
      if (isDM) {
        // DMではchannel.sendを使用
        await message.channel.send('応答の生成中にエラーが発生しました。しばらく経ってからお試しください。');
      } else {
        // 通常チャンネルではreplyを使用
        await message.reply('応答の生成中にエラーが発生しました。しばらく経ってからお試しください。');
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