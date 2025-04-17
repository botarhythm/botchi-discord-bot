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
      if (shouldIntervene(message)) {
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
      if (shouldSearch(cleanContent)) {
        try {
          logger.debug('検索実行が必要と判断');
          const searchResults = await performSearch(cleanContent);
          await processMessageWithAI(message, cleanContent, searchResults);
        } catch (err) {
          logger.error(`Search error: ${err.message}`);
          await processMessageWithAI(message, cleanContent);
        }
      } else {
        logger.debug('検索なしでAI処理を実行');
        await processMessageWithAI(message, cleanContent);
      }
    } else if (shouldIntervene(message)) {
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
  
  // Personalized prefix for the user - DMと通常チャンネルで同じ処理にする
  let personalizedPrefix = ''; // 常に空の文字列を設定
  
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
  
  // 検索結果が存在する場合、結果とクエリの種類に基づいて適切に統合
  if (searchResults) {
    // 検索結果の概要と整形されたデータを追加
    systemPrompt += `\n【Web検索結果】\n`;
    
    // 検索クエリと成功/失敗状態を追加
    if (searchResults.query) {
      systemPrompt += `検索クエリ: 「${searchResults.query}」\n`;
    }
    
    // 検索結果のサマリー情報があれば追加
    if (searchResults.summary) {
      systemPrompt += `検索結果サマリー: ${searchResults.summary}\n\n`;
    }
    
    // 検索結果の詳細情報
    if (searchResults.results && searchResults.results.length > 0) {
      systemPrompt += `${searchResults.results.length}件の結果が見つかりました\n`;
      
      searchResults.results.forEach((result, index) => {
        // 最大5件まで、概要と著作権に配慮しつつ表示
        if (index < 5) {
          systemPrompt += `[${index + 1}] タイトル: ${result.title}\n`;
          
          // 説明文は短く制限（著作権への配慮）
          if (result.description) {
            // 説明文を150文字程度に制限
            const shortenedDesc = result.description.length > 150 
              ? result.description.substring(0, 150) + '...' 
              : result.description;
            systemPrompt += `    概要: ${shortenedDesc}\n`;
          }
          
          // URLのドメイン部分のみ表示
          if (result.url) {
            const domain = result.url.replace(/^https?:\/\/([^\/]+).*$/, '$1');
            systemPrompt += `    出典: ${domain}\n\n`;
          }
        }
      });
    }

    // 著作権への配慮の指示
    systemPrompt += `【著作権への配慮】検索結果から情報を引用する場合は必ず短く（25語以内）し、引用符で囲んでください。長文の引用や全文の再現は避け、内容を自分の言葉で要約してください。\n`;

    // 検索クエリのタイプに応じた応答指示
    if (messageContext.queryType) {
      // クエリタイプに応じた指示
      if (messageContext.isCurrentInfoQuery) {
        systemPrompt += `【応答指示】最新情報を求めるクエリです。検索結果から最新の情報を中心に、わかりやすく簡潔に説明してください。情報の日付や時期を明記し、情報の鮮度を伝えてください。\n`;
      } else if (messageContext.isDefinitionQuery) {
        systemPrompt += `【応答指示】定義や意味を尋ねるクエリです。検索結果から概念や用語の定義を明確に説明してください。複数の視点や解釈がある場合は、それらを簡潔にまとめてください。\n`;
      } else if (messageContext.isHowToQuery) {
        systemPrompt += `【応答指示】方法や手順を尋ねるクエリです。検索結果からステップバイステップの説明を、簡潔かつ明確に提供してください。重要なポイントや注意点も含めてください。\n`;
      } else if (messageContext.isFactCheckQuery) {
        systemPrompt += `【応答指示】事実確認を求めるクエリです。検索結果に基づいて、事実かどうかを客観的に説明してください。情報源の信頼性にも言及し、複数の見解がある場合はそれを示してください。\n`;
      } else if (messageContext.isLocalQuery) {
        systemPrompt += `【応答指示】場所や位置に関するクエリです。検索結果から場所の情報を分かりやすく伝えてください。基本的な情報（住所、営業時間、評価など）を簡潔にまとめてください。\n`;
      } else {
        systemPrompt += `【応答指示】検索結果を参考にしつつ、クエリに対して簡潔で明確な応答を作成してください。検索結果から得られた情報を自然な会話の流れに統合し、情報源の信頼性や公開日時に留意してください。\n`;
      }
    } else {
      // 一般的な指示
      systemPrompt += `【応答指示】上記の検索結果を参考にしつつ、ユーザーの質問に答えてください。検索結果にない情報については、「その情報は見つかりませんでした」と正直に伝えてください。\n`;
    }
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
