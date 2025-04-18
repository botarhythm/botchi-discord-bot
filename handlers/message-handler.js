// Botchi - Discord AI Chatbot
// Message Handler Module

const logger = require('../system/logger');
const { setupClient } = require('../core/discord-init');
const config = require('../config');
const { getRAGSystem } = require('../extensions/rag');
const characterDefinitions = require('../extensions/character');
const { handleCommand } = require('./command-handler');
const { isValidForIntervention, shouldIntervene } = require('./context-intervention');
const { shouldSearch, processMessage: performSearch } = require('./search-handler');
const { processResults, formatSearchResultForAI } = require('../extensions/search-processor');
const dateHandler = require('../extensions/date-handler');

// Get environment variables
const MENTIONS_ONLY = process.env.MENTIONS_ONLY === 'true';
const IS_DEV_MODE = process.env.NODE_ENV === 'development';
const MEMORY_ENABLED = process.env.MEMORY_ENABLED === 'true';
const RAG_ENABLED = process.env.RAG_ENABLED === 'true';

// Global provider instance - 抽象化AIサービス
let aiService = null;
// Initialize Discord client
const client = setupClient();

function setAIProvider(provider) {
  aiService = provider;
  logger.info('AI Service set in message handler');
}

async function handleMessage(message) {
  if (message.author.bot) return;
  
  // --- Add attachment check --- 
  if (message.attachments.size > 0) {
    logger.debug(`メッセージに添付ファイルが含まれています。処理をスキップします。`);
    await message.reply('すみません、添付ファイルを開いて内容を確認することはできないんです 📂');
    return;
  }
  // --- End attachment check --- 

  try {
    // デバッグログを追加：メッセージ受信を記録
    logger.debug(`メッセージを受信: "${message.content}" from ${message.author.username} (${message.author.id})`);
    logger.debug(`チャンネル: ${message.channel.type === 1 ? 'DM' : `#${message.channel.name}`} (${message.channel.id})`);
    
    const isMention = message.mentions.has(client.user);
    const isDM = message.channel.type === 1; // DM channels
    
    // メンションとDM状態をログに出力
    logger.debug(`メンション: ${isMention}, DM: ${isDM}`);
    
    // Handle commands with prefix
    if (message.content.startsWith(config.commandPrefix)) {
      logger.debug(`コマンド実行: ${message.content}`);
      return await handleCommand(message, aiService);
    }
    
    // Skip messages without mentions if mentions_only is enabled and not in DM
    if (MENTIONS_ONLY && !isMention && !isDM) {
      if (shouldIntervene(message, client)) {
        logger.debug(`文脈介入判定: 介入する`);
        await handleIntervention(message);
      } else {
        logger.debug(`文脈介入判定: 介入しない`);
      }
      return;
    }
    
    // Process message for AI response
    if (isMention || isDM) {
      logger.debug('メンションまたはDMのため応答処理を開始');
      message.channel.sendTyping();
      
      // Clean the message content from mentions
      const cleanContent = message.content
        .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
        .trim();
      
      // Skip empty messages
      if (!cleanContent) {
        logger.debug('内容が空のため応答しない');
        return;
      }
      
      logger.debug(`クリーン化されたメッセージ内容: "${cleanContent}"`);
      
      // Check if we should perform a search
      logger.debug(`[handleMessage] Checking if search should be performed for: "${cleanContent}"`);
      const performSearchCheck = shouldSearch(cleanContent);
      logger.debug(`[handleMessage] shouldSearch returned: ${performSearchCheck}`);
      
      if (performSearchCheck) {
        logger.debug('[handleMessage] Attempting to perform search...');
        try {
          logger.debug('検索実行が必要と判断');
          const searchResults = await performSearch(message);
          logger.debug(`[handleMessage] Search process completed. Success: ${searchResults?.success}. Results obtained: ${searchResults?.results?.length || 0}`);
          await processMessageWithAI(message, cleanContent, searchResults);
        } catch (err) {
          logger.error(`[handleMessage] Error during performSearch (processMessage): ${err.message}`);
          await processMessageWithAI(message, cleanContent);
        }
      } else {
        logger.debug('[handleMessage] Search not required. Proceeding without search.');
        logger.debug('検索なしでAI処理を実行');
        await processMessageWithAI(message, cleanContent);
      }
    } else if (shouldIntervene(message, client)) {
      logger.debug('文脈介入の条件に合致');
      await handleIntervention(message);
    } else {
      logger.debug('処理条件に合致せず、応答しない');
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
    // --- Add check for empty cleanContent --- 
    if (!cleanContent || cleanContent.trim() === '') {
        logger.warn('[processMessageWithAI] cleanContent is empty, skipping AI processing.');
        // Optionally send a message back to the user
        // await message.reply('メッセージの内容が見当たりませんでした。');
        return; 
    }
    // --- End check --- 

    // デバッグログ：AI処理開始
    logger.debug(`AI処理開始: ${isIntervention ? '介入モード' : '通常モード'}`);
    
    // Exit if no AI service is set
    if (!aiService) {
      logger.error('No AI service set in message handler');
      await message.reply('申し訳ありませんが、AIサービスに接続できません。しばらく経ってからお試しください。');
      return;
    }
    
    logger.debug(`AIサービス: ${aiService ? '設定済み' : '未設定'}`);
    
    // Set up message context
    const messageContext = {
      userId: message.author.id,
      username: message.author.username,
      channelId: message.channel.id,
      channelName: message.channel.name,
      channelType: message.channel.type,
      guildId: message.guild?.id,
      guildName: message.guild?.name,
      message: cleanContent,
      contextType: isIntervention ? 'intervention' : (message.channel.type === 1 ? 'direct_message' : 'channel'),
      isIntervention: isIntervention
    };
    
    logger.debug(`メッセージコンテキスト生成: ${JSON.stringify(messageContext)}`);
    
    // Get conversation history if memory is enabled
    let conversationHistory = [];
    if (MEMORY_ENABLED && global.botchiMemory?.manager) {
      try {
        conversationHistory = await global.botchiMemory.manager.getConversationHistory(
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
    
    // 検索結果やRAG結果をコンテキストに追加
    if (searchResults) {
      // 検索結果の全体をコンテキストに設定
      messageContext.searchResults = searchResults;
      logger.debug(`検索結果をコンテキストに追加: ${searchResults.summary?.substring(0, 50)}...`);
      
      // クエリタイプに関する情報も別途設定
      if (searchResults.queryType) {
        messageContext.queryType = searchResults.queryType;
      }
      
      // 検索結果タイプに応じたフラグを設定（AIモデルが適切な応答方法を判断できるように）
      if (searchResults.queryType) {
        const queryType = searchResults.queryType;
        
        // 時事性の高い情報を求めるクエリかどうか
        messageContext.isCurrentInfoQuery = queryType.isCurrentInfoQuery || false;
        
        // 定義や意味を尋ねるクエリかどうか
        messageContext.isDefinitionQuery = queryType.isDefinitionQuery || false;
        
        // ハウツー系のクエリかどうか
        messageContext.isHowToQuery = queryType.isHowToQuery || false;
        
        // 事実確認のクエリかどうか
        messageContext.isFactCheckQuery = queryType.isFactCheckQuery || false;
        
        // 一般的な情報を求めるクエリかどうか
        messageContext.isGeneralInfoQuery = queryType.isGeneralInfoQuery || false;
        
        // 位置情報に関するクエリかどうか
        messageContext.isLocalQuery = queryType.isLocalQuery || false;
      }
    }
    
    if (ragResults) {
      messageContext.ragResults = ragResults;
      logger.debug('RAG結果をコンテキストに追加');
    }
    
    if (conversationHistory && conversationHistory.length > 0) {
      messageContext.conversationHistory = conversationHistory;
      logger.debug(`会話履歴をコンテキストに追加: ${conversationHistory.length}件`);
    }
    
    // AI応答を取得 - 抽象化レイヤーを使用
    logger.debug('AIサービスにリクエスト送信');
    const aiResponse = await aiService.getResponse(messageContext);
    logger.debug(`AI応答受信: ${aiResponse ? aiResponse.substring(0, 50) + '...' : '応答なし'}`);
    
    // Send response back to Discord
    if (aiResponse && aiResponse.trim()) {
      const chunks = chunkMessage(aiResponse);
      logger.debug(`応答を${chunks.length}個のチャンクに分割`);
      
      for (const chunk of chunks) {
        await message.reply(chunk);
        logger.debug('応答送信完了');
      }
      
      // Store the conversation in memory if enabled
      if (MEMORY_ENABLED && global.botchiMemory?.manager) {
        try {
          await global.botchiMemory.manager.storeConversation(
            messageContext.channelId,
            messageContext.userId,
            cleanContent,
            aiResponse
          );
          logger.debug('会話履歴を保存');
        } catch (err) {
          logger.error(`Error storing conversation: ${err.message}`);
        }
      }
    } else {
      logger.warn('AIから空の応答を受信');
      await message.reply('申し訳ありません、応答を生成できませんでした。別の質問をお試しください。');
    }
  } catch (error) {
    logger.error(`AI処理エラー: ${error.stack}`);
    try {
      await message.reply('申し訳ありませんが、応答の処理中にエラーが発生しました。しばらく経ってからお試しください。');
    } catch (replyError) {
      logger.error(`返信エラー: ${replyError.message}`);
    }
  }
}

/**
 * 検索結果をプロンプトに統合する
 * @param {Object} searchResults - 検索結果
 * @param {string} userMessage - ユーザーメッセージ
 * @returns {string} 統合されたプロンプト
 */
function formatSearchResultsForPrompt(searchResults, userMessage) {
  if (!searchResults || !searchResults.success) {
    return userMessage;
  }

  // 日付関連のクエリかどうかを判定
  const isDateRelated = dateHandler.isDateRelatedQuery(userMessage);
  const dateInfo = isDateRelated ? dateHandler.formatDateForAI(dateHandler.getCurrentJapanTime()) : null;

  // 検索結果をAI用に整形
  const formattedResults = formatSearchResultForAI(
    searchResults.results,
    searchResults.queryType,
    dateInfo
  );

  // プロンプトの構築
  let prompt = `以下の検索結果を参考に、自然な会話形式で回答してください。\n\n`;
  prompt += `検索クエリ: ${userMessage}\n\n`;
  prompt += `検索結果:\n${formattedResults}\n\n`;
  prompt += `回答の指示:\n`;
  prompt += `1. 検索結果の内容を自然な会話形式で要約してください。\n`;
  prompt += `2. 情報源を適切に引用してください。\n`;
  prompt += `3. 日付情報がある場合は、それを含めて回答してください。\n`;
  prompt += `4. 回答は日本語で、親しみやすい口調でお願いします。\n`;

  return prompt;
}

/**
 * RAG結果をプロンプト用に整形する関数
 * @param {string | null} ragResults - RAGシステムからの結果文字列
 * @returns {string} プロンプトに追加するRAG結果の文字列
 */
function formatRagResultsForPrompt(ragResults) {
  let promptSection = '';
  if (ragResults) {
    promptSection += `\n【関連知識】\n${ragResults}\n`;
    promptSection += `上記の関連知識を参考にしつつ、質問に答えてください。\n`;
  }
  return promptSection;
}

/**
 * 会話履歴をプロンプト用に整形する関数
 * @param {Array} conversationHistory - 会話履歴の配列
 * @param {Object} messageContext - メッセージコンテキスト (ユーザー名を含む)
 * @param {Object} character - キャラクター定義 (キャラクター名を含む)
 * @returns {string} プロンプトに追加する会話履歴の文字列
 */
function formatConversationHistoryForPrompt(conversationHistory, messageContext, character) {
  let promptSection = '';
  if (conversationHistory && conversationHistory.length > 0) {
    promptSection += `\n【会話履歴】\n`;
    conversationHistory.forEach(item => {
      // roleが'user'または'assistant'以外の場合、ログを出力してスキップ
      if (item.role !== 'user' && item.role !== 'assistant') {
        logger.warn(`会話履歴に不明なroleが含まれています: ${item.role}`);
        return; // 不明なroleはスキップ
      }
      const speaker = item.role === 'user' ? messageContext.username : character.name;
      promptSection += `${speaker}: ${item.content}\n`;
    });
  }
  return promptSection;
}

function buildContextPrompt(userMessage, messageContext, conversationHistory = [], searchResults = null, ragResults = null) {
  // Get current time in Japan using the date handler
  const dateInfo = dateHandler.formatDateForAI(dateHandler.getCurrentJapanTime());
  const japanTime = dateHandler.getFormattedDateTimeString();
  
  // Time-based greeting
  const hour = dateInfo.hour;
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
  
  // Character definition
  const character = characterDefinitions.default;
  
  // Base system prompt with character settings
  let systemPrompt = `あなたは${character.name}（${character.nameReading}）として以下の設定で会話します：\n\n`;
  systemPrompt += `【キャラクター設定】\n${character.description}\n\n`;
  systemPrompt += `【会話スタイル】\n${character.conversationStyle}\n\n`;
  systemPrompt += `【基本情報】\n`;
  systemPrompt += `- 現在の日時: ${japanTime}\n`;
  systemPrompt += `- タイムゾーン: ${dateInfo.timezoneName}\n`;
  systemPrompt += `- ユーザー名: ${messageContext.username}\n`;
  
  if (messageContext.guildName) {
    systemPrompt += `- サーバー: ${messageContext.guildName}\n`;
    systemPrompt += `- チャンネル: #${messageContext.channelName}\n`;
  } else {
    systemPrompt += `- チャンネル: Direct Message\n`;
  }
  
  systemPrompt += `\n【重要な指示】\n`;
  systemPrompt += `- 日本語で応答してください。\n`;
  systemPrompt += `- 人間らしい温かみのある会話を心がけてください。\n`;
  systemPrompt += `- 時間や日付に関する質問には、必ず${dateInfo.timezoneName}を基準に回答してください。\n`;
  systemPrompt += `- 検索結果を引用する場合は、必ず情報源のURLを含めてください。\n`;
  
  // 検索結果を整形してプロンプトに追加
  const searchPromptSection = formatSearchResultsForPrompt(searchResults, messageContext.message);
  systemPrompt += searchPromptSection;

  // RAG結果を整形してプロンプトに追加
  const ragPromptSection = formatRagResultsForPrompt(ragResults);
  systemPrompt += ragPromptSection;
  
  // Format conversation history
  const historyPromptSection = formatConversationHistoryForPrompt(conversationHistory, messageContext, character);
  systemPrompt += historyPromptSection;
  
  // Add user message
  const finalPrompt = `${systemPrompt}\n【現在のメッセージ】\n${messageContext.username}: ${userMessage}\n\n${character.name}: `;
  
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
