/**
 * Bocchy Discord Bot - 文脈介入ハンドラー
 * チャンネルでの会話の文脈を解析し、適切なタイミングで会話に参加する機能
 */

const messageHistory = require('../extensions/message-history');
const contextAnalyzer = require('../extensions/context-analyzer');
const logger = require('../system/logger');
const config = require('../config/env');

// AIサービスを取得
let aiService;
if (config.DM_MESSAGE_HANDLER === 'new') {
  // 新プロバイダーシステム
  aiService = require('../extensions/providers');
} else {
  // レガシーシステム
  aiService = config.AI_PROVIDER === 'openai' 
    ? require('../openai-service') 
    : require('../gemini-service');
}

/**
 * 文脈介入が必要かどうかを判断する
 * @param {Object} message - Discordメッセージオブジェクト
 * @param {Object} client - Discordクライアントオブジェクト
 * @returns {boolean} 介入すべきかどうか
 */
async function shouldIntervene(message, client) {
  try {
    // メンションがある場合は介入しない（メインハンドラーでメンション処理するため）
    if (message.mentions.has(client.user.id)) {
      return false;
    }
    
    // メッセージ履歴を取得
    const recentMessages = messageHistory.getRecentMessages(message.channelId, 10);
    
    // 文脈分析を実行
    const shouldIntervene = contextAnalyzer.shouldIntervene({
      message: {
        content: message.content,
        channel: { id: message.channelId, name: message.channel.name },
        author: {
          id: message.author.id,
          username: message.author.username
        },
        createdTimestamp: message.createdTimestamp
      },
      history: recentMessages,
      mode: process.env.INTERVENTION_MODE || config.INTERVENTION_MODE,
      keywords: config.INTERVENTION_KEYWORDS,
      lastInterventionTime: messageHistory.getLastBotMessageTime ? 
                           messageHistory.getLastBotMessageTime(message.channelId, client.user.id) : 0,
      cooldownSeconds: config.INTERVENTION_COOLDOWN,
      botId: client.user.id
    });
    
    if (shouldIntervene && config.DEBUG) {
      logger.debug(`Context intervention triggered in channel ${message.channel.name || message.channelId}`);
      logger.debug(`Trigger message: "${message.content.substring(0, 50)}..."`);
    }
    
    return shouldIntervene;
  } catch (error) {
    logger.error('Error in context intervention analysis:', error);
    return false;
  }
}

/**
 * 文脈に基づいたAI応答を生成する
 * @param {Object} message - Discordメッセージオブジェクト
 * @param {Array} history - 会話履歴
 * @returns {string} AI応答
 */
async function generateContextResponse(message, history = []) {
  try {
    // 最近のメッセージ履歴を取得
    const recentMessages = history.length > 0 ? history : 
                          messageHistory.getRecentMessages(message.channelId, 5);
    
    // 文脈情報を作成
    let contextPrompt = `(以下は会話の流れの中で自然に参加するためのものです。ユーザーは直接あなたに話しかけていません。文脈を読んで、必要であれば控えめに参加してください。)\n\n最近の会話:\n`;
    
    // 最近のメッセージを追加
    recentMessages.forEach(msg => {
      contextPrompt += `${msg.author.username}: ${msg.content}\n`;
    });
    
    // 最後のメッセージを追加
    contextPrompt += `${message.author.username}: ${message.content}\n\n自然な会話の流れに沿って参加してください。`;
    
    // プロバイダーシステムに応じて処理を分岐
    let response;
    if (config.DM_MESSAGE_HANDLER === 'new') {
      // 新しいプロバイダーシステムを使用
      const provider = aiService.getProvider();
      
      if (!provider) {
        logger.error('No AI provider available for context intervention');
        return null;
      }
      
      // 会話コンテキストを構築
      const conversationContext = {
        userId: message.author.id,
        username: message.author.username,
        message: contextPrompt,
        contextType: 'intervention'
      };
      
      // AIからの応答を取得
      response = await aiService.getResponse(conversationContext);
    } else {
      // 従来のシステムを使用
      response = await aiService.getResponse(contextPrompt, message.author.id);
    }
    
    return response;
  } catch (error) {
    logger.error('Error generating context intervention response:', error);
    return null;
  }
}

/**
 * 文脈介入のトリガーキーワードを更新する
 * @param {Array} keywords - 新しいキーワード配列
 * @returns {boolean} 更新が成功したかどうか
 */
function updateInterventionKeywords(keywords) {
  if (!Array.isArray(keywords)) {
    return false;
  }
  
  try {
    // 環境変数を更新（実行時のみ有効）
    process.env.INTERVENTION_KEYWORDS = keywords.join(',');
    return true;
  } catch (error) {
    logger.error('Error updating intervention keywords:', error);
    return false;
  }
}

/**
 * 文脈介入モードを更新する
 * @param {string} mode - 新しい介入モード
 * @returns {boolean} 更新が成功したかどうか
 */
function updateInterventionMode(mode) {
  const validModes = ['none', 'passive', 'balanced', 'active', 'aggressive'];
  
  if (!validModes.includes(mode)) {
    return false;
  }
  
  try {
    // 環境変数を更新（実行時のみ有効）
    process.env.INTERVENTION_MODE = mode;
    return true;
  } catch (error) {
    logger.error('Error updating intervention mode:', error);
    return false;
  }
}

/**
 * 介入クールダウン時間を更新する
 * @param {number} seconds - 新しいクールダウン時間（秒）
 * @returns {boolean} 更新が成功したかどうか
 */
function updateInterventionCooldown(seconds) {
  if (isNaN(seconds) || seconds < 0) {
    return false;
  }
  
  try {
    // 環境変数を更新（実行時のみ有効）
    process.env.INTERVENTION_COOLDOWN = seconds.toString();
    return true;
  } catch (error) {
    logger.error('Error updating intervention cooldown:', error);
    return false;
  }
}

module.exports = {
  shouldIntervene,
  generateContextResponse,
  updateInterventionKeywords,
  updateInterventionMode,
  updateInterventionCooldown
};