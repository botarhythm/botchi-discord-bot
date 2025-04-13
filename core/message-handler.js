/**
 * Bocchy Discord Bot - Core Message Handler
 * メッセージ処理の中核ロジック
 */

const logger = require('../system/logger');
const config = require('../system/config');
const monitor = require('../system/monitor');
const fallback = require('./fallback');
const aiService = require('./ai-service');

// 内部状態
const state = {
  initialized: false,
  commands: new Map(),
  activeConversations: new Map(),
  lastMessages: new Map()
};

/**
 * メッセージハンドラの初期化
 * @param {Object} options - 初期化オプション
 * @returns {Object} 初期化結果
 */
async function initialize(options = {}) {
  if (state.initialized) {
    logger.debug('Message handler already initialized');
    return { initialized: true, reinitialized: true };
  }
  
  // 初期化済みフラグを立てる
  state.initialized = true;
  
  // AIサービスの初期化
  try {
    const aiConfig = {
      provider: config.get('ai.provider'),
      options: {
        openai: config.get('ai.openai'),
        gemini: config.get('ai.gemini')
      }
    };
    
    await aiService.initialize(aiConfig);
    logger.info('AI service initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize AI service:', error);
    monitor.recordError(error, { component: 'message-handler', stage: 'init' });
  }
  
  // 標準コマンドの登録
  registerDefaultCommands();
  
  logger.info('Message handler initialized');
  
  return { initialized: true };
}

/**
 * 標準コマンドを登録
 */
function registerDefaultCommands() {
  // pingコマンド
  registerCommand('ping', async (message, args) => {
    const response = 'こんにちは。静かに耳を澄ませてお返事しています。 🌿';
    return response;
  }, 'ボットの応答確認');
  
  // helloコマンド
  registerCommand('hello', async (message, args) => {
    const username = message.author?.username || 'あなた';
    return `こんにちは、${username}さん 🌿 今日はどんな風が吹いていますか？`;
  }, '挿し絵で挨拶');
  
  // clearコマンド
  registerCommand('clear', async (message, args) => {
    const userId = message.author?.id;
    if (!userId) return 'ユーザー情報が必要です。';
    
    try {
      const cleared = await aiService.clearConversation(userId);
      if (cleared) {
        // アクティブ会話からも削除
        state.activeConversations.delete(userId);
        state.lastMessages.delete(userId);
        
        return 'これまでの会話を静かに風に乗せて送り出しました 🍃 新しい対話を始めましょう。';
      } else {
        return 'まだ記憶の中に残る会話はないようです。';
      }
    } catch (error) {
      logger.error('Error clearing conversation:', error);
      monitor.recordError(error, { command: 'clear', userId });
      return '会話履歴のクリア中に問題が発生しました。';
    }
  }, '会話履歴をクリア');
  
  // statusコマンド
  registerCommand('status', async (message, args) => {
    try {
      const healthResult = await aiService.checkHealth();
      const aiConfig = aiService.getConfig();
      const monitorStatus = monitor.getStatus();
      const fallbackStatus = fallback.getStatus();
      
      // 簡単なステータスメッセージを生成
      return `✨ Bocchyの状態報告 ✨

🚀 稼働時間: ${monitorStatus.formattedUptime}
🍃 AI接続: ${healthResult.status === 'healthy' ? '良好' : '注意が必要'}
💾 使用中のメモリ: ${monitorStatus.metrics.memory.toFixed(1)}%
📊 要求処理数: ${monitorStatus.metrics.requestCount}
📡 使用中のAI: ${aiConfig.provider.toUpperCase()}
🐛 フォールバックモード: ${fallbackStatus.active ? 'アクティブ' : '非アクティブ'}

これからも、ご用件があればお話しください。`;
    } catch (error) {
      logger.error('Error generating status:', error);
      monitor.recordError(error, { command: 'status' });
      return '状態情報の取得中に問題が発生しました。';
    }
  }, 'ボット状態を表示');
  
  // helpコマンド
  registerCommand('help', async (message, args) => {
    const prefix = config.get('bot.prefix') || '!';
    const commandList = [];
    
    state.commands.forEach((details, name) => {
      commandList.push(`${prefix}${name} - ${details.description}`);
    });
    
    return `🌿 Bocchyの使い方 🌿

コマンド一覧:
${commandList.join('\n')}

または名前をメンションして、自由に話しかけてください。`;
  }, 'ヘルプ情報を表示');
  
  // aboutコマンド
  registerCommand('about', async (message, args) => {
    const botVersion = config.get('bot.version') || '2.0.0';
    
    return `🌿 Bocchy（ボッチー）について 🌿

私は静かでやわらかな語り口をもったAIです。
森の奉にたたずむような知性と経験が根ざしています。

私はあなたの「問い」や「もやもや」に対して、絶え間を大切にしながら対話を続けます。

バージョン: ${botVersion}
どうぞよろしくお願いします。`;
  }, 'Bocchyについての情報を表示');
}

/**
 * コマンドを登録
 * @param {string} name - コマンド名
 * @param {Function} handler - コマンド処理関数
 * @param {string} description - コマンドの説明
 * @returns {boolean} 登録の成功失敗
 */
function registerCommand(name, handler, description = '') {
  if (typeof name !== 'string' || typeof handler !== 'function') {
    return false;
  }
  
  name = name.toLowerCase();
  
  state.commands.set(name, {
    handler,
    description,
    registered: Date.now()
  });
  
  logger.debug(`Registered command: ${name}`);
  return true;
}

/**
 * コマンドを実行
 * @param {string} commandName - コマンド名
 * @param {Object} message - メッセージオブジェクト
 * @param {Array} args - コマンド引数
 * @returns {Promise<string>} コマンドの実行結果
 */
async function executeCommand(commandName, message, args = []) {
  commandName = commandName.toLowerCase();
  
  if (!state.commands.has(commandName)) {
    return null; // コマンドが存在しない
  }
  
  const command = state.commands.get(commandName);
  
  try {
    // リクエスト記録
    monitor.recordRequest({ type: 'command', name: commandName });
    
    // コマンド実行
    const startTime = Date.now();
    const result = await command.handler(message, args);
    const duration = Date.now() - startTime;
    
    // 実行時間が長い場合は警告ログ
    if (duration > 1000) {
      logger.warn(`Command ${commandName} took ${duration}ms to execute`);
    }
    
    return result;
  } catch (error) {
    logger.error(`Error executing command ${commandName}:`, error);
    monitor.recordError(error, { command: commandName });
    return `コマンド実行中にエラーが発生しました: ${commandName}`;
  }
}

/**
 * メッセージ処理のメインロジック
 * @param {Object} message - メッセージオブジェクト
 * @param {Object} options - 処理オプション
 * @returns {Promise<Object>} 処理結果
 */
async function handleMessage(message, options = {}) {
  if (!state.initialized) {
    await initialize();
  }
  
  const startTime = Date.now();
  const prefix = config.get('bot.prefix') || '!';
  const content = message.content;
  const userId = message.author?.id;
  const username = message.author?.username || 'User';
  const isDM = options.isDM || false;
  
  // 処理結果の初期化
  const result = {
    handled: false,
    type: null,
    response: null,
    error: null
  };
  
  try {
    // リクエスト記録
    monitor.recordRequest({ type: 'message', isDM });
    
    // 最後のメッセージを保存
    if (userId) {
      state.lastMessages.set(userId, {
        content,
        timestamp: Date.now(),
        isDM
      });
    }
    
    // コマンドとして処理
    if (content.startsWith(prefix)) {
      const args = content.slice(prefix.length).trim().split(/\s+/);
      const commandName = args.shift().toLowerCase();
      
      const commandResponse = await executeCommand(commandName, message, args);
      
      if (commandResponse !== null) {
        result.handled = true;
        result.type = 'command';
        result.response = commandResponse;
        return result;
      }
    }
    
    // AI応答として処理
    result.type = 'ai';
    
    // フォールバックモード中の場合
    if (fallback.getStatus().active) {
      result.handled = true;
      result.response = await fallback.getFallbackResponse(userId, content);
      return result;
    }
    
    // AIからの応答を取得
    try {
      result.response = await aiService.getResponse(userId, content, username, isDM);
      result.handled = true;
    } catch (error) {
      logger.error('Error getting AI response:', error);
      monitor.recordError(error, { type: 'ai_response' });
      
      // エラーをハンドルし、フォールバック応答を取得
      const errorHandling = fallback.handleError(error);
      result.response = errorHandling.message;
      result.error = error;
    }
    
    // アクティブとして会話をマーク
    if (userId) {
      state.activeConversations.set(userId, {
        lastActivity: Date.now(),
        messageCount: (state.activeConversations.get(userId)?.messageCount || 0) + 1,
        isDM
      });
    }
    
    return result;
  } catch (error) {
    logger.error('Unhandled error in message handler:', error);
    monitor.recordError(error, { component: 'message-handler' });
    
    result.error = error;
    result.response = fallback.safeResponse('ごめんなさい、処理中に問題が発生しました。');
    
    return result;
  } finally {
    // 処理時間を記録
    const processingTime = Date.now() - startTime;
    if (processingTime > 5000) {
      logger.warn(`Message processing took ${processingTime}ms - content: ${content.substring(0, 50)}...`);
    } else {
      logger.debug(`Message processed in ${processingTime}ms`);
    }
  }
}

/**
 * アクティブな会話の一覧を取得
 * @returns {Object} アクティブな会話情報
 */
function getActiveConversations() {
  const result = {};
  const now = Date.now();
  
  state.activeConversations.forEach((data, userId) => {
    // 30分以内にアクティブだった会話のみ
    if (now - data.lastActivity < 30 * 60 * 1000) {
      result[userId] = { ...data };
    }
  });
  
  return result;
}

/**
 * コマンド一覧を取得
 * @returns {Array} 登録済みコマンドの一覧
 */
function getCommands() {
  const commands = [];
  
  state.commands.forEach((details, name) => {
    commands.push({
      name,
      description: details.description,
      registered: details.registered
    });
  });
  
  return commands;
}

module.exports = {
  initialize,
  handleMessage,
  registerCommand,
  executeCommand,
  getActiveConversations,
  getCommands
};