/**
 * Bocchy Discord Bot - メッセージ履歴管理モジュール
 * チャンネルごとのメッセージ履歴を管理し、文脈判断に使用する
 */

// チャンネルごとのメッセージ履歴を保存するMap
const channelMessages = new Map();

// 設定
const MAX_MESSAGES_PER_CHANNEL = 50;  // チャンネルごとの最大保存メッセージ数
const MAX_MESSAGE_AGE_MS = 30 * 60 * 1000;  // メッセージの最大保持時間（30分）
const MAX_CHANNELS = 100;  // 最大チャンネル数

// ボットの最後の発言時間を記録
const lastBotMessageTimes = new Map();

/**
 * モジュールの初期化
 */
function initialize() {
  console.log(`Message history system initialized with max ${MAX_MESSAGES_PER_CHANNEL} messages per channel`);
  
  // 古いメッセージをクリーンアップするタイマーを設定
  setInterval(cleanupOldMessages, 5 * 60 * 1000); // 5分ごとに実行
  
  return Promise.resolve({ status: 'success' });
}

/**
 * メッセージを履歴に追加
 * @param {string} channelId - チャンネルID
 * @param {Object} message - メッセージオブジェクト
 */
function addMessageToHistory(channelId, message) {
  if (!channelId || !message) return;
  
  // チャンネルのメッセージ配列を取得または新規作成
  if (!channelMessages.has(channelId)) {
    // チャンネル数が上限に達している場合、最も古いアクティビティのチャンネルを削除
    if (channelMessages.size >= MAX_CHANNELS) {
      const oldestChannel = getOldestActiveChannel();
      if (oldestChannel) {
        channelMessages.delete(oldestChannel);
      }
    }
    
    channelMessages.set(channelId, []);
  }
  
  // メッセージ配列を取得
  const messages = channelMessages.get(channelId);
  
  // メッセージを追加
  messages.push({
    id: message.id,
    content: message.content,
    author: {
      id: message.author.id,
      username: message.author.username,
      bot: message.author.bot
    },
    timestamp: message.createdTimestamp || Date.now()
  });
  
  // もしこれがボットのメッセージなら、最終発言時間を更新
  if (message.author.bot) {
    lastBotMessageTimes.set(channelId, Date.now());
  }
  
  // 上限を超えた場合、古いメッセージを削除
  if (messages.length > MAX_MESSAGES_PER_CHANNEL) {
    messages.shift();
  }
}

/**
 * 指定チャンネルの最近のメッセージを取得
 * @param {string} channelId - チャンネルID
 * @param {number} limit - 取得するメッセージ数（デフォルト10）
 * @returns {Array} メッセージの配列
 */
function getRecentMessages(channelId, limit = 10) {
  if (!channelId || !channelMessages.has(channelId)) {
    return [];
  }
  
  const messages = channelMessages.get(channelId);
  return messages.slice(-Math.min(limit, messages.length));
}

/**
 * 指定チャンネルのメッセージ履歴をクリア
 * @param {string} channelId - チャンネルID
 */
function clearChannelHistory(channelId) {
  if (channelId && channelMessages.has(channelId)) {
    channelMessages.delete(channelId);
    lastBotMessageTimes.delete(channelId);
    return true;
  }
  return false;
}

/**
 * ボットがチャンネルで最後に発言した時間を取得
 * @param {string} channelId - チャンネルID
 * @param {string} botId - ボットのID
 * @returns {number} 最後の発言時間（ミリ秒タイムスタンプ）
 */
function getLastBotMessageTime(channelId, botId) {
  return lastBotMessageTimes.get(channelId) || 0;
}

/**
 * ボットの最後の発言時間を更新
 * @param {string} channelId - チャンネルID
 * @param {string} botId - ボットのID
 */
function updateLastBotMessageTime(channelId, botId) {
  if (channelId) {
    lastBotMessageTimes.set(channelId, Date.now());
    return true;
  }
  return false;
}

/**
 * 古いメッセージと非アクティブなチャンネルをクリーンアップ
 */
function cleanupOldMessages() {
  const now = Date.now();
  
  // 各チャンネルをループ
  for (const [channelId, messages] of channelMessages.entries()) {
    // 期限切れのメッセージをフィルタリング
    const validMessages = messages.filter(msg => (now - msg.timestamp) < MAX_MESSAGE_AGE_MS);
    
    if (validMessages.length === 0) {
      // メッセージがない場合はチャンネルを削除
      channelMessages.delete(channelId);
      lastBotMessageTimes.delete(channelId);
    } else if (validMessages.length < messages.length) {
      // 有効なメッセージだけを保持
      channelMessages.set(channelId, validMessages);
    }
  }
}

/**
 * 最も古いアクティビティを持つチャンネルを取得
 * @returns {string|null} チャンネルID
 */
function getOldestActiveChannel() {
  if (channelMessages.size === 0) return null;
  
  let oldestChannelId = null;
  let oldestActivity = Date.now();
  
  // 各チャンネルの最新メッセージの時間を比較
  for (const [channelId, messages] of channelMessages.entries()) {
    if (messages.length === 0) continue;
    
    const latestMessageTime = messages[messages.length - 1].timestamp;
    if (latestMessageTime < oldestActivity) {
      oldestActivity = latestMessageTime;
      oldestChannelId = channelId;
    }
  }
  
  return oldestChannelId;
}

/**
 * 現在の設定と統計情報を取得
 * @returns {Object} 設定と統計情報
 */
function getConfig() {
  let totalMessagesStored = 0;
  
  // 保存されている全メッセージ数をカウント
  for (const messages of channelMessages.values()) {
    totalMessagesStored += messages.length;
  }
  
  return {
    maxMessagesPerChannel: MAX_MESSAGES_PER_CHANNEL,
    maxMessageAge: MAX_MESSAGE_AGE_MS,
    maxChannels: MAX_CHANNELS,
    activeChannels: channelMessages.size,
    totalMessagesStored
  };
}

module.exports = {
  initialize,
  addMessageToHistory,
  getRecentMessages,
  clearChannelHistory,
  getLastBotMessageTime,
  updateLastBotMessageTime,
  getConfig
};
