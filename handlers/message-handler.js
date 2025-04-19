// Botchi - Discord AI Chatbot
// Message Handler Module

const logger = require('../system/logger');
const { setupClient } = require('../core/discord-init');
const config = require('../config');
const characterDefinitions = require('../extensions/character/character');
const { handleCommand } = require('./command-handler');
const { isValidForIntervention, shouldIntervene } = require('./context-intervention');
const { shouldSearch, processMessage: performSearch } = require('./search-handler');
const { processResults, formatSearchResultForAI } = require('../extensions/search-processor');
const dateHandler = require('../extensions/date-handler');
const crypto = require('crypto');
const { OpenAIService } = require('../extensions/openai-service');
const { cleanPrompt } = require('../extensions/prompt-cleaner');
const googleService = require('../extensions/google-service');
const { BOT_VERSION, MEMORY_ENABLED, SEARCH_ENABLED } = require('../config');

// Get environment variables
const MENTIONS_ONLY = process.env.MENTIONS_ONLY === 'true';
const IS_DEV_MODE = process.env.NODE_ENV === 'development';

// Global provider instance - 抽象化AIサービス
let aiService = null;
// Initialize Discord client
const client = setupClient();

function setAIProvider(provider) {
  aiService = provider;
  logger.info('AI Service set in message handler');
}

async function handleMessage(message) {
  const invocationId = crypto.randomBytes(4).toString('hex'); // Generate a unique ID
  logger.debug(`[${invocationId}] Received message: "${message.content}" from ${message.author.tag} (${message.author.id})`);

  try {
    // Ignore messages from bots or self
    if (message.author.bot || message.author.id === client.user.id) {
      // logger.debug(`[${invocationId}] Ignoring message from bot or self`); // Optional: Log ignored messages
      return;
    }

    // Log channel info
    const channelInfo = message.channel.type === 1 ? 'DM' : `#${message.channel.name}`;
    logger.debug(`[${invocationId}] Channel: ${channelInfo} (${message.channel.id})`);

    // Check for mentions and DMs
    const isMention = message.mentions.has(client.user.id);
    const isDM = message.channel.type === 1; // 1 is DMChannel

    // Log mention and DM status
    logger.debug(`[${invocationId}] Mention: ${isMention}, DM: ${isDM}`);

    // Handle commands with prefix
    if (message.content.startsWith(config.commandPrefix)) {
      logger.debug(`[${invocationId}] Executing command: ${message.content}`);
      return await handleCommand(message, aiService);
    }

    // Skip messages without mentions if mentions_only is enabled and not in DM
    if (MENTIONS_ONLY && !isMention && !isDM) {
      // Pass invocationId to shouldIntervene if it accepts/uses it, otherwise log here
      if (await shouldIntervene(message, client /*, invocationId */)) {
        logger.debug(`[${invocationId}] Context intervention check (MENTIONS_ONLY): Intervening`);
        await handleIntervention(message, invocationId); // Pass ID
      } else {
        logger.debug(`[${invocationId}] Context intervention check (MENTIONS_ONLY): Not intervening`);
      }
      return;
    }

    // Process message for AI response
    if (isMention || isDM) {
      logger.debug(`[${invocationId}] Starting response process (mention or DM)`);
      message.channel.sendTyping();

      // Clean the message content from mentions
      const cleanContent = message.content
        .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
        .trim();

      // Skip empty messages
      if (!cleanContent) {
        logger.debug(`[${invocationId}] Empty content after cleaning, not responding`);
        return;
      }

      logger.debug(`[${invocationId}] Cleaned message content: "${cleanContent}"`);

      // Check if we should perform a search
      logger.debug(`[${invocationId}] [handleMessage] Checking if search should be performed for: "${cleanContent}"`);
      const performSearchCheck = shouldSearch(cleanContent);
      logger.debug(`[${invocationId}] [handleMessage] shouldSearch returned: ${performSearchCheck}`);

      if (performSearchCheck) {
        logger.debug(`[${invocationId}] [handleMessage] Attempting to perform search...`);
        try {
          logger.debug(`[${invocationId}] Search determined necessary`);
          const searchResults = await performSearch(cleanContent);
          logger.debug(`[${invocationId}] [handleMessage] Search process completed. Success: ${searchResults?.success}. Results obtained: ${searchResults?.results?.length || 0}`);
          await processMessageWithAI(message, cleanContent, searchResults);
        } catch (err) {
          logger.error(`[${invocationId}] [handleMessage] Error during performSearch (processMessage): ${err.message}`);
          await processMessageWithAI(message, cleanContent, null);
        }
      } else {
        logger.debug(`[${invocationId}] [handleMessage] Search not required. Proceeding without search.`);
        logger.debug(`[${invocationId}] Executing AI process without search`);
        await processMessageWithAI(message, cleanContent, null);
      }
    } else if (await shouldIntervene(message, client /*, invocationId */)) {
      logger.debug(`[${invocationId}] Context intervention criteria met`); // Changed log message slightly for clarity
      await handleIntervention(message, invocationId); // Pass ID
    } else {
      logger.debug(`[${invocationId}] No processing conditions met, not responding`);
    }
  } catch (error) {
    // Include invocationId if available, otherwise log globally
    const idPrefix = typeof invocationId !== 'undefined' ? `[${invocationId}] ` : '';
    logger.error(`${idPrefix}Error handling message: ${error.stack}`);
  }
}

async function handleIntervention(message, invocationId = 'N/A') { // Accept ID
  try {
    logger.info(`[${invocationId}] Intervening in conversation in ${message.channel.type === 1 ? 'DM' : '#' + message.channel.name}`);
    message.channel.sendTyping();

    // Process the message for intervention
    await processMessageWithAI(message, message.content, null);
  } catch (error) {
    logger.error(`[${invocationId}] Error handling intervention: ${error.stack}`);
  }
}

async function processMessageWithAI(message, content, searchResults = null) {
  const idLog = `[${message.channel.id}]`;
  
  try {
    if (!content || content.trim() === '') {
        logger.warn(`${idLog} [processMessageWithAI] content is empty, skipping AI processing.`);
        return;
    }

    logger.debug(`${idLog} AI Processing Start: ${searchResults ? 'With Search Results' : 'Normal Mode'}`);

    if (!aiService) {
      logger.error(`${idLog} No AI service set in message handler`);
      await message.reply('申し訳ありませんが、AIサービスに接続できません。しばらく経ってからお試しください。');
      return;
    }

    logger.debug(`${idLog} AI Service: ${aiService ? 'Set' : 'Not Set'}`);

    // メンバー情報の取得
    let effectiveUsername = message.author.username;
    if (message.member && message.member.nickname) {
        effectiveUsername = message.member.nickname;
        logger.debug(`${idLog} Using server nickname: ${effectiveUsername}`);
    } else if (message.channel.type === 1) {
        logger.debug(`${idLog} Using global username in DM: ${effectiveUsername}`);
    } else {
        logger.debug(`${idLog} No server nickname found, using global username: ${effectiveUsername}`);
    }

    const messageContext = {
      userId: message.author.id,
      username: message.author.username,
      effectiveUsername: effectiveUsername,
      channelId: message.channel.id,
      channelName: message.channel.name || 'unknown',
      channelType: message.channel.type,
      guildId: message.guild?.id,
      guildName: message.guild?.name,
      message: content,
      isIntervention: false
    };
    
    logger.debug(`${idLog} Message context generated: ${JSON.stringify(messageContext).substring(0, 200)}...`);

    // 会話履歴の取得
    let conversationHistory = [];
    if (MEMORY_ENABLED && global.botchiMemory?.manager) {
      try {
        conversationHistory = await global.botchiMemory.manager.getConversationHistory(
          messageContext.channelId, 
          10
        );
        logger.debug(`${idLog} Retrieved ${conversationHistory.length} history items`);
      } catch (err) {
        logger.error(`${idLog} Error getting conversation history: ${err.message}`);
      }
    }

    // プロンプトの準備
    const systemPrompt = buildContextPrompt(content, messageContext, conversationHistory, searchResults);
    logger.debug(`${idLog} System prompt generated`);

    // 検索結果があればそれを追加コンテキストとして利用
    let additionalContext = '';
    if (searchResults && searchResults.success && Array.isArray(searchResults.results) && searchResults.results.length > 0) {
      additionalContext = formatSearchResultsForPrompt(searchResults, content);
      logger.debug(`${idLog} Using search results for AI context`);
    } else {
      additionalContext = content;
      logger.debug(`${idLog} No search results available, using clean content`);
    }

    logger.debug(`${idLog} Sending request to AI service`);
    const aiResponse = await aiService.getResponse({
      ...messageContext,
      systemPrompt,
      additionalContext
    });
    
    logger.debug(`${idLog} Received AI response: ${aiResponse ? aiResponse.substring(0, 50) + '...' : 'No response'}`);

    if (aiResponse && aiResponse.trim()) {
      const formattedResponse = characterDefinitions.formatMessage(aiResponse);
      const chunks = chunkMessage(formattedResponse, 1990);
      logger.debug(`${idLog} Answer split into ${chunks.length} chunks`);
      
      for (const chunk of chunks) {
        await message.reply(chunk);
        logger.debug(`${idLog} Answer sent`);
      }
      
      // 会話履歴を保存
      if (MEMORY_ENABLED && global.botchiMemory?.manager) {
        try {
          await global.botchiMemory.manager.storeConversation(
            messageContext.channelId,
            messageContext.userId,
            content,
            aiResponse 
          );
          logger.debug(`${idLog} Conversation history saved`);
        } catch (err) {
          logger.error(`${idLog} Error storing conversation: ${err.message}`);
        }
      }
    } else {
      logger.warn(`${idLog} AI returned empty response`);
      await message.reply('申し訳ありません、応答を生成できませんでした。別の質問をお試しください。');
    }
  } catch (error) {
    logger.error(`${idLog} Error in processMessageWithAI: ${error.stack}`);
    try {
      await message.reply('申し訳ありませんが、応答の処理中にエラーが発生しました。しばらく経ってからお試しください。');
    } catch (replyError) {
      logger.error(`${idLog} Reply error: ${replyError.message}`);
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

  // 念のため型チェック
  const formattedResultsText = typeof formattedResults === 'string'
    ? formattedResults
    : JSON.stringify(formattedResults);

  // プロンプトの構築
  let prompt = `以下の検索結果を参考に、自然な会話形式で回答してください。\n\n`;
  prompt += `検索クエリ: ${userMessage}\n\n`;
  prompt += `検索結果:\n${formattedResultsText}\n\n`;
  prompt += `回答の指示:\n`;
  prompt += `1. 検索結果の内容を自然な会話形式で要約してください。\n`;
  prompt += `2. 情報源を適切に引用してください。\n`;
  prompt += `3. 日付情報がある場合は、それを含めて回答してください。\n`;
  prompt += `4. 回答は日本語で、親しみやすい口調でお願いします。\n`;

  return prompt;
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
        // Use a generic identifier for logging if invocationId isn't readily available here
        logger.warn(`Conversation history contains unknown role: ${item.role}`);
        return; // 不明なroleはスキップ
      }
      // Use effectiveUsername for the user's part in the history
      const speaker = item.role === 'user' ? messageContext.effectiveUsername : character.name;
      promptSection += `${speaker}: ${item.content}\n`;
    });
  }
  return promptSection;
}

function buildContextPrompt(userMessage, messageContext, conversationHistory = [], searchResults = null) {
  // Get current time in Japan using the date handler
  const dateInfo = dateHandler.formatDateForAI(dateHandler.getCurrentJapanTime());
  const japanTime = dateHandler.getFormattedDateTimeString(); // 例: "2024年MM月DD日(曜日) 午後3時32分 (JST (UTC+9))"
  const hour = dateInfo.hour; // 現在の時 (0-23)
  
  // Time-based greeting calculation (used in prompt instructions now)
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
  systemPrompt += `- タイムゾーン: ${dateInfo.timezoneName}\n`;
  systemPrompt += `- ユーザー名: ${messageContext.effectiveUsername}\n`;

  if (messageContext.guildName) {
    systemPrompt += `- サーバー: ${messageContext.guildName}\n`;
    systemPrompt += `- チャンネル: #${messageContext.channelName}\n`;
  } else {
    systemPrompt += `- チャンネル: Direct Message\n`;
  }
  
  systemPrompt += `\n【重要な指示】\n`;
  systemPrompt += `- 日本語で応答してください。
`;
  systemPrompt += `- 人間らしい温かみのある会話を心がけてください。
`;
  systemPrompt += `- **時間帯への配慮:** 現在の日本時間は ${japanTime} (${hour}時台) です。この時間帯を応答内容や会話のトーンに自然に反映させてください。例えば、夜遅くなら相手を気遣う言葉、朝なら活気のある言葉を選ぶなど、状況に応じた人間らしい配慮をお願いします。
`;
  systemPrompt += `- **挨拶の対応:** もしユーザーが「おはよう」「こんにちは」「こんばんは」といった挨拶からメッセージを始めた場合は、あなたも現在の時間帯 (${hour}時台) に合った適切な挨拶（${timeGreeting} など）を返してください。ユーザーからの挨拶がない場合は、必ずしも挨拶で応答を開始する必要はありません。
`;
  systemPrompt += `- 時間や日付に関する質問には、必ず${dateInfo.timezoneName}を基準に回答してください。
`;
  systemPrompt += `- 検索結果を引用する場合は、必ず情報源のURLを含めてください。
`;
  // Refined instruction about using nicknames
  systemPrompt += `- **ニックネームの使用:** このサーバー（${messageContext.guildName || 'この場所'}）では、多くのメンバーがニックネームを使っています。ニックネーム（例：現在話している相手は「${messageContext.effectiveUsername}」さん）は、サーバー内では公開情報として扱われ、メンバー同士の会話で自然に使われます。あなたも会話の中でユーザーや他のメンバーに言及する際は、メンションや会話履歴からわかる範囲で、**必ずニックネームを使用してください**。例えば、「${messageContext.effectiveUsername}さんはどう思いますか？」のように話しかけてください。**「あなた」のような一般的な呼び方は絶対に避けてください。**
`;
  systemPrompt += `- **メンバーに関する質問:** もし「このサーバーには誰がいますか？」といった質問を受けた場合は、現在サーバーに参加しているメンバーのニックネーム（またはユーザー名）をリストアップして答えるのが適切です。（現時点ではメンバーリストを直接参照できませんが、応答方針として覚えておいてください）
`;
  
  // 会話履歴の追加
  if (conversationHistory && conversationHistory.length > 0) {
    systemPrompt += `\n\n# 会話履歴\n以下は最近の${conversationHistory.length}件の会話です：\n`;
    
    conversationHistory.forEach((historyItem, index) => {
      const roleName = historyItem.role === 'user' ? `${historyItem.username || 'ユーザー'}` : 'ボッチー';
      systemPrompt += `\n[${index + 1}] ${roleName}: ${historyItem.content}\n`;
    });
  }
    
  // 検索結果を整形してプロンプトに追加
  const searchPromptSection = formatSearchResultsForPrompt(searchResults, userMessage);
  systemPrompt += searchPromptSection;
  
  return systemPrompt;
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
