/**
 * Bocchy Discord Bot - メッセージハンドラー
 * Discord メッセージイベントを処理し、適切な応答を生成する
 */

const { ChannelType, EmbedBuilder } = require('discord.js');
const messageHistory = require('../extensions/message-history');
const contextIntervention = require('./context-intervention');
const commands = require('./commands');
const logger = require('../system/logger');

// 設定
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
 * メッセージを処理する
 * @param {Object} message - Discordメッセージオブジェクト
 * @param {Object} client - Discordクライアントオブジェクト
 */
async function handleMessage(message, client) {
  try {
    // ボットからのメッセージは無視
    if (message.author.bot) return;

    // ログ出力（DEBUGモードの場合は詳細、それ以外は簡易）
    if (config.DEBUG) {
      logger.debug(`Message received - Content: \"${message.content}\"`);
      logger.debug(`From User: ${message.author.tag} (ID: ${message.author.id})`);
      logger.debug(`Channel Type: ${message.channel.type}`);
      logger.debug(`Is Channel DM: ${message.channel.type === ChannelType.DM}`);
      logger.debug(`Channel ID: ${message.channelId}`);
    } else {
      logger.info(`Message from ${message.author.tag}: \"${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}\"`);
    }

    // DMかどうかを判定
    const isDM = message.channel.type === ChannelType.DM;
    
    if (isDM && config.DEBUG) {
      logger.debug(`DM MESSAGE DETECTED! From: ${message.author.tag}, Content: ${message.content}`);
    }

    // コマンド処理（先頭がプレフィックスの場合）
    const prefix = process.env.PREFIX || '!';
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();
      
      logger.info(`Command detected: ${command}`);
      
      // コマンド処理の実行
      const handled = await commands.executeCommand(command, args, message, client);
      if (handled) return;
    }

    // メッセージ履歴に保存（ボットのメッセージを除く）
    // サーバーチャンネル（GUILD_TEXT）の場合のみ
    if (message.channel.type === ChannelType.GuildText) {
      try {
        messageHistory.addMessageToHistory(message.channelId, {
          id: message.id,
          content: message.content,
          author: {
            id: message.author.id,
            username: message.author.username,
            bot: message.author.bot
          },
          createdTimestamp: message.createdTimestamp || Date.now()
        });
        
        if (config.DEBUG) {
          logger.debug(`Message added to history for channel: ${message.channelId}`);
        }
      } catch (error) {
        logger.error('Error adding message to history:', error);
      }
    }

    // DMとメンション、および文脈から会話に参加する処理
    if (isDM) {
      // DMは常に応答
      await handleAIResponse(message, client, 'direct_message');
    } else {
      // メンションチェック
      const isMentioned = message.mentions.has(client.user.id);
      
      // 文脈介入判断
      let shouldIntervene = false;
      
      if (!isMentioned) {
        try {
          // メンションがない場合のみ文脈介入判断を行う
          shouldIntervene = await contextIntervention.shouldIntervene(message, client);
          
          if (shouldIntervene && config.DEBUG) {
            logger.info(`Context intervention triggered in channel ${message.channel.name || message.channelId}`);
          }
        } catch (error) {
          logger.error('Error in context intervention check:', error);
          shouldIntervene = false;
        }
      }
      
      // メンションがある場合またはcontextInterventionが介入を判断した場合に応答
      if (isMentioned || shouldIntervene) {
        const contextType = isMentioned ? 'mention' : 'intervention';
        await handleAIResponse(message, client, contextType);
      }
    }
  } catch (error) {
    logger.error('Error in message handler:', error);
  }
}

/**
 * AIレスポンスを取得して送信する
 * @param {Object} message - Discordメッセージオブジェクト
 * @param {Object} client - Discordクライアントオブジェクト
 * @param {string} contextType - コンテキストタイプ (direct_message, mention, intervention)
 */
async function handleAIResponse(message, client, contextType) {
  try {
    // 入力中...のステータスを表示
    await message.channel.sendTyping();
    
    // メッセージ内容の前処理
    let cleanContent = message.content;
    
    // メンションの場合はメンション部分を取り除く
    if (contextType === 'mention') {
      cleanContent = cleanContent.replace(/<@!?[\d]+>/g, '').trim();
    }
    
    // 空の場合はデフォルトの挨拶に
    if (cleanContent === '') {
      cleanContent = 'こんにちは';
    }
    
    let response;
    
    // 文脈介入の場合は特別な処理
    if (contextType === 'intervention') {
      response = await contextIntervention.generateContextResponse(message);
    } else {
      // 通常のDMまたはメンション応答
      
      // プロバイダーシステムに応じて処理を分岐
      if (config.DM_MESSAGE_HANDLER === 'new') {
        // 新しいプロバイダーシステムを使用
        // 会話コンテキストを構築
        const conversationContext = {
          userId: message.author.id,
          username: message.author.username,
          message: cleanContent,
          contextType: contextType
        };
        
        // AIからの応答を取得
        response = await aiService.getResponse(conversationContext);
      } else {
        // 従来のシステムを使用
        response = await aiService.getAIResponse(
          message.author.id, 
          cleanContent, 
          message.author.username, 
          contextType === 'direct_message'
        );
      }
    }
    
    // 応答が得られなかった場合
    if (!response) {
      logger.error('No response from AI service');
      await message.reply('申し訳ありません、応答の生成に問題が発生しました。');
      return;
    }
    
    // 応答が長い場合は分割して送信
    if (response.length > 2000) {
      const chunks = splitMessage(response);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } else {
      await message.reply(response);
    }
    
    // 文脈介入の場合は最後の介入時間を更新
    if (contextType === 'intervention') {
      messageHistory.updateLastBotMessageTime(message.channelId, client.user.id);
    }
    
    logger.info(`Sent AI response for ${contextType} (${response.length} chars)`);
  } catch (error) {
    logger.error('Error generating AI response:', error);
    
    try {
      // エラーメッセージを送信
      await message.reply('申し訳ありません、応答の生成中にエラーが発生しました。');
    } catch (replyError) {
      logger.error('Error sending error message:', replyError);
    }
  }
}

/**
 * 長いメッセージを分割する
 * @param {string} text - 分割するテキスト
 * @param {number} maxLength - 最大長（デフォルト2000文字）
 * @returns {Array} 分割されたテキストの配列
 */
function splitMessage(text, maxLength = 2000) {
  const chunks = [];
  
  // テキストを適切な区切りで分割
  let currentChunk = '';
  const sentences = text.split(/(?<=[.!?。！？])\s+/);
  
  for (const sentence of sentences) {
    // 現在のチャンクに文を追加するとサイズオーバーになる場合
    if (currentChunk.length + sentence.length > maxLength) {
      // 現在のチャンクが空でなければ追加
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      
      // 文自体が最大長を超える場合は強制的に分割
      if (sentence.length > maxLength) {
        let remainingSentence = sentence;
        while (remainingSentence.length > 0) {
          const chunkText = remainingSentence.substring(0, maxLength);
          chunks.push(chunkText);
          remainingSentence = remainingSentence.substring(maxLength);
        }
      } else {
        currentChunk = sentence;
      }
    } else {
      // 現在のチャンクに文を追加
      currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence;
    }
  }
  
  // 最後のチャンクがあれば追加
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

module.exports = {
  handleMessage
};