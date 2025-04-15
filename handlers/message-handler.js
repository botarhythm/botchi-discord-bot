/**
 * Bocchy Discord Bot - メッセージハンドラー（改良版）
 * 文脈介入機能の堅牢性と最適化を目的としたリファクタリング
 */

const { ChannelType, EmbedBuilder } = require('discord.js');
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
      return syncUtil.safeRequire('../extensions/providers', {
        getProvider: () => null,
        getResponse: async () => 'AIサービスが初期化されていません',
        getProviderName: () => 'fallback'
      });
    } else {
      return config.AI_PROVIDER === 'openai'
        ? syncUtil.safeRequire('../openai-service')
        : syncUtil.safeRequire('../gemini-service');
    }
  } catch (error) {
    logger.error('AIサービスの初期化失敗:', error);
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

  const isDM = message.channel?.type === ChannelType.DM;
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
  if (message.channel?.type !== ChannelType.GuildText || !messageHistory?.addMessageToHistory) return;

  try {
    const entry = {
      id: message.id,
      content: message.content || '',
      author: {
        id: message.author?.id,
        username: message.author?.username,
        bot: message.author?.bot
      },
      createdTimestamp: message.createdTimestamp || Date.now()
    };
    messageHistory.addMessageToHistory(message.channelId, entry);
    if (config.DEBUG) logger.debug(`Message saved to history: ${message.channelId}`);
  } catch (error) {
    logger.error(`履歴保存エラー: ${error.message}`, error);
  }
}

async function evaluateIntervention(message, client, isDM, isMentioned) {
  if (isDM || isMentioned) return true;

  try {
    const recentMessages = messageHistory?.getRecentMessages?.(message.channelId, 10) || [];
    const analysisParams = {
      message: {
        content: message.content || '',
        channel: {
          id: message.channelId,
          name: message.channel?.name
        },
        author: {
          id: message.author?.id,
          username: message.author?.username
        },
        createdTimestamp: message.createdTimestamp
      },
      history: recentMessages,
      mode: process.env.INTERVENTION_MODE || config.INTERVENTION_MODE || 'balanced',
      keywords: config.INTERVENTION_KEYWORDS,
      lastInterventionTime: messageHistory?.getLastBotMessageTime?.(message.channelId, client.user?.id) || 0,
      cooldownSeconds: config.INTERVENTION_COOLDOWN || 60
    };
    return contextAnalyzer?.shouldIntervene?.(analysisParams) || false;
  } catch (error) {
    logger.error('介入判断エラー:', error);
    return false;
  }
}

async function handleAIResponse(message, client, contextType) {
  try {
    await message.channel.sendTyping();
    const cleanContent = sanitizeMessage(message.content, contextType);
    const contextPrompt = await buildContextPrompt(message, cleanContent, contextType);

    const aiContext = {
      userId: message.author.id,
      username: message.author.username,
      message: contextPrompt,
      contextType
    };

    const provider = aiService.getProvider?.();
    const response = provider?.getResponse
      ? await provider.getResponse(aiContext)
      : await aiService.getResponse(aiContext);

    if (!response) throw new Error('AI応答がありません');

    const replies = splitMessage(response);
    for (const chunk of replies) await message.reply(chunk);

    if (contextType === 'intervention') {
      messageHistory?.updateLastBotMessageTime?.(message.channelId, client.user?.id);
    }

    logger.info(`AI応答完了（${contextType}）: ${response.length}文字`);
  } catch (error) {
    logger.error('AI応答処理エラー:', error);
    try {
      await message.reply('応答の生成中にエラーが発生しました。');
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