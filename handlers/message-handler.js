// Botchi - Discord AI Chatbot
// Message Handler Module

const logger = require('../system/logger');
const { setupClient } = require('../core/discord-init');
const config = require('../config');
const { getRAGSystem } = require('../extensions/rag');
const characterDefinitions = require('../extensions/character');
const { handleCommand } = require('./command-handler');
const { isValidForIntervention, shouldIntervene } = require('./context-intervention');
const { shouldSearch, performSearch } = require('./search-handler');

// Get environment variables
const MENTIONS_ONLY = process.env.MENTIONS_ONLY === 'true';
const IS_DEV_MODE = process.env.NODE_ENV === 'development';
const MEMORY_ENABLED = process.env.MEMORY_ENABLED === 'true';
const RAG_ENABLED = process.env.RAG_ENABLED === 'true';

// Global provider instance
let aiProvider = null;
// Initialize Discord client
const client = setupClient();

function setAIProvider(provider) {
  aiProvider = provider;
  logger.info('AI Provider set in message handler');
}

async function handleMessage(message) {
  if (message.author.bot) return;
  
  try {
    const isMention = message.mentions.has(client.user);
    const isDM = message.channel.type === 1; // DM channels
    
    // Handle commands with prefix
    if (message.content.startsWith(config.commandPrefix)) {
      return await handleCommand(message, aiProvider);
    }
    
    // Skip messages without mentions if mentions_only is enabled and not in DM
    if (MENTIONS_ONLY && !isMention && !isDM) {
      if (shouldIntervene(message)) {
        await handleIntervention(message);
      }
      return;
    }
    
    // Process message for AI response
    if (isMention || isDM) {
      message.channel.sendTyping();
      
      // Clean the message content from mentions
      const cleanContent = message.content
        .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
        .trim();
      
      // Skip empty messages
      if (!cleanContent) return;
      
      // Check if we should perform a search
      if (shouldSearch(cleanContent)) {
        try {
          const searchResults = await performSearch(cleanContent);
          await processMessageWithAI(message, cleanContent, searchResults);
        } catch (err) {
          logger.error(`Search error: ${err.message}`);
          await processMessageWithAI(message, cleanContent);
        }
      } else {
        await processMessageWithAI(message, cleanContent);
      }
    } else if (shouldIntervene(message)) {
      await handleIntervention(message);
    }
  } catch (error) {
    logger.error(`Error handling message: ${error.stack}`);
  }
}

async function handleIntervention(message) {
  try {
    logger.info(`Intervening in conversation in #${message.channel.name}`);
    message.channel.sendTyping();
    
    // Process the message for intervention
    await processMessageWithAI(message, message.content, null, true);
  } catch (error) {
    logger.error(`Error handling intervention: ${error.stack}`);
  }
}

async function processMessageWithAI(message, cleanContent, searchResults = null, isIntervention = false) {
  try {
    // Exit if no AI provider is set
    if (!aiProvider) {
      logger.error('No AI provider set in message handler');
      await message.reply('申し訳ありませんが、AIサービスに接続できません。しばらく経ってからお試しください。');
      return;
    }
    
    // Set up message context
    const messageContext = {
      userId: message.author.id,
      username: message.author.username,
      channelId: message.channel.id,
      channelName: message.channel.name,
      channelType: message.channel.type,
      guildId: message.guild?.id,
      guildName: message.guild?.name,
      isIntervention: isIntervention
    };
    
    // Get conversation history if memory is enabled
    let conversationHistory = [];
    if (MEMORY_ENABLED && aiProvider.memory) {
      try {
        conversationHistory = await aiProvider.memory.getConversationHistory(
          messageContext.channelId, 
          10
        );
        logger.debug(`Retrieved ${conversationHistory.length} history items`);
      } catch (err) {
        logger.error(`Error getting conversation history: ${err.message}`);
      }
    }
    
    // Get RAG results if enabled
    let ragResults = null;
    if (RAG_ENABLED) {
      try {
        const ragSystem = getRAGSystem();
        if (ragSystem) {
          ragResults = await ragSystem.query(cleanContent);
          logger.debug('RAG results retrieved successfully');
        }
      } catch (err) {
        logger.error(`Error getting RAG results: ${err.message}`);
      }
    }
    
    // Build prompt for AI
    const prompt = buildContextPrompt(
      cleanContent,
      messageContext,
      conversationHistory,
      searchResults,
      ragResults
    );
    
    // Get AI response
    const aiResponse = await aiProvider.generateResponse(prompt, messageContext);
    
    // Send response back to Discord
    if (aiResponse && aiResponse.trim()) {
      const chunks = chunkMessage(aiResponse);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
      
      // Store the conversation in memory if enabled
      if (MEMORY_ENABLED && aiProvider.memory) {
        try {
          await aiProvider.memory.storeConversation(
            messageContext.channelId,
            message.author.id,
            cleanContent,
            aiResponse
          );
        } catch (err) {
          logger.error(`Error storing conversation: ${err.message}`);
        }
      }
    } else {
      logger.warn('Empty AI response received');
      await message.reply('申し訳ありませんが、応答を生成できませんでした。もう一度お試しください。');
    }
  } catch (error) {
    logger.error(`Error processing message with AI: ${error.stack}`);
    await message.reply('エラーが発生しました。しばらく経ってからお試しください。');
  }
}

function buildContextPrompt(userMessage, messageContext, conversationHistory = [], searchResults = null, ragResults = null) {
  // Get current time in Japan
  const now = new Date();
  const japanTime = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).format(now);
  
  // Time-based greeting
  const hour = now.getHours();
  let timeGreeting = '';
  
  if (hour >= 5 && hour < 12) {
    timeGreeting = 'おはようございます！';
  } else if (hour >= 12 && hour < 18) {
    timeGreeting = 'こんにちは！';
  } else {
    timeGreeting = 'こんばんは！';
  }
  
  // Building message continuity context
  let continuityMsg = '';
  if (conversationHistory && conversationHistory.length > 0) {
    continuityMsg = '（会話を継続しています）';
  }
  
  // Personalized prefix for the user
  let personalizedPrefix = `${timeGreeting}${continuityMsg}`;
  
  // Character definition
  const character = characterDefinitions.default;
  
  // Base system prompt with character settings
  let systemPrompt = `あなたは${character.name}（${character.nameReading}）として以下の設定で会話します：\n\n`;
  systemPrompt += `【キャラクター設定】\n${character.description}\n\n`;
  systemPrompt += `【会話スタイル】\n${character.conversationStyle}\n\n`;
  systemPrompt += `【基本情報】\n`;
  systemPrompt += `- 現在の日時: ${japanTime}\n`;
  systemPrompt += `- ユーザー名: ${messageContext.username}\n`;
  
  if (messageContext.guildName) {
    systemPrompt += `- サーバー: ${messageContext.guildName}\n`;
    systemPrompt += `- チャンネル: #${messageContext.channelName}\n`;
  } else {
    systemPrompt += `- チャンネル: Direct Message\n`;
  }
  
  systemPrompt += `\n【重要な指示】\n`;
  systemPrompt += `- 日本語で応答してください。\n`;
  systemPrompt += `- 現在の日時情報（${japanTime}）を自然な会話の流れの中で活用してください。ただし、ユーザーが明示的に日付や時間について尋ねた場合や、文脈上必要な場合を除いて、毎回強制的に表示する必要はありません。\n`;
  systemPrompt += `- あなたの応答は、ユーザーの質問や会話の文脈に合わせて自然に行ってください。\n`;
  systemPrompt += `- 人間らしい温かみのある会話を心がけてください。\n`;
  
  // Add search results if available
  if (searchResults) {
    systemPrompt += `\n【Web検索結果】\n${searchResults}\n`;
    systemPrompt += `上記の検索結果を参考にしつつ、質問に答えてください。検索結果にない情報については、「その情報は見つかりませんでした」と正直に伝えてください。\n`;
  }
  
  // Add RAG results if available
  if (ragResults) {
    systemPrompt += `\n【関連知識】\n${ragResults}\n`;
    systemPrompt += `上記の関連知識を参考にしつつ、質問に答えてください。\n`;
  }
  
  // Add conversation history if available
  if (conversationHistory && conversationHistory.length > 0) {
    systemPrompt += `\n【会話履歴】\n`;
    conversationHistory.forEach(item => {
      systemPrompt += `${item.role === 'user' ? messageContext.username : character.name}: ${item.content}\n`;
    });
  }
  
  // Add user message
  const finalPrompt = `${systemPrompt}\n【現在のメッセージ】\n${messageContext.username}: ${userMessage}\n\n${character.name}: ${personalizedPrefix}`;
  
  return finalPrompt;
}

// Function to chunk messages for Discord's 2000 character limit
function chunkMessage(message, chunkSize = 1990) {
  const chunks = [];
  
  for (let i = 0; i < message.length; i += chunkSize) {
    chunks.push(message.slice(i, i + chunkSize));
  }
  
  return chunks;
}

module.exports = {
  handleMessage,
  setAIProvider
};
