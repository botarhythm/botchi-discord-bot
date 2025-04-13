// extensions/message-history.js - チャンネルごとのメッセージ履歴管理モジュール
/**
 * メッセージ履歴管理
 * チャンネルごとの会話履歴を保持し、文脈分析のためのデータを提供する
 */

// 設定
const MAX_MESSAGES_PER_CHANNEL = 50; // チャンネルごとの最大履歴数
const MESSAGE_EXPIRY = 30 * 60 * 1000; // 30分でメッセージを期限切れに
const CHANNEL_EXPIRY = 24 * 60 * 60 * 1000; // 24時間使用されないチャンネルのデータを破棄

// チャンネルごとのメッセージ履歴マップ
const channelMessages = new Map();

// 最後のチャンネル使用タイムスタンプ
const lastChannelActivityTime = new Map();

/**
 * メッセージを履歴に追加
 * @param {string} channelId - メッセージのチャンネルID
 * @param {Message} message - Discordメッセージオブジェクト
 */
function addMessageToHistory(channelId, message) {
  // メッセージが有効かチェック
  if (!message || !message.content || message.author.bot) {
    return;
  }
  
  // チャンネルの会話履歴を取得または作成
  let messages = [];
  if (channelMessages.has(channelId)) {
    messages = channelMessages.get(channelId);
  }
  
  // 新しいメッセージを追加
  messages.push({
    id: message.id,
    content: message.content,
    author: {
      id: message.author.id,
      username: message.author.username
    },
    createdTimestamp: message.createdTimestamp
  });
  
  // 古いメッセージを削除
  const now = Date.now();
  messages = messages
    .filter(msg => now - msg.createdTimestamp < MESSAGE_EXPIRY) // 期限切れメッセージを除外
    .slice(-MAX_MESSAGES_PER_CHANNEL); // 最大数を維持
  
  // 更新した履歴を保存
  channelMessages.set(channelId, messages);
  
  // チャンネルの最終アクティビティタイムスタンプを更新
  lastChannelActivityTime.set(channelId, now);
}

/**
 * チャンネルの最近のメッセージを取得
 * @param {string} channelId - チャンネルID
 * @param {number} limit - 取得するメッセージの最大数（デフォルト10）
 * @returns {Array} メッセージの配列
 */
function getRecentMessages(channelId, limit = 10) {
  // チャンネルの会話履歴があるか確認
  if (!channelMessages.has(channelId)) {
    return [];
  }
  
  const messages = channelMessages.get(channelId);
  
  // 最新のメッセージから指定数を返す
  return messages.slice(-limit);
}

/**
 * チャンネルの会話履歴をクリア
 * @param {string} channelId - チャンネルID
 */
function clearChannelHistory(channelId) {
  channelMessages.delete(channelId);
  lastChannelActivityTime.delete(channelId);
}

/**
 * 定期的なクリーンアップを実行
 * 長時間使用されていないチャンネルのデータを削除
 */
function cleanupExpiredData() {
  const now = Date.now();
  
  for (const [channelId, lastActivity] of lastChannelActivityTime.entries()) {
    if (now - lastActivity > CHANNEL_EXPIRY) {
      // 長時間使用されていないチャンネルのデータを削除
      channelMessages.delete(channelId);
      lastChannelActivityTime.delete(channelId);
      console.log(`[メッセージ履歴] チャンネル ${channelId} の未使用データを削除しました`);
    }
  }
}

/**
 * モジュール設定情報を取得
 * @returns {Object} 設定情報
 */
function getConfig() {
  return {
    activeChannels: channelMessages.size,
    totalMessagesStored: Array.from(channelMessages.values()).reduce((sum, messages) => sum + messages.length, 0),
    maxMessagesPerChannel: MAX_MESSAGES_PER_CHANNEL,
    messageExpiry: MESSAGE_EXPIRY / (60 * 1000), // 分単位
    channelExpiry: CHANNEL_EXPIRY / (60 * 60 * 1000) // 時間単位
  };
}

// 毎時間クリーンアップを実行
setInterval(cleanupExpiredData, 60 * 60 * 1000);

module.exports = {
  addMessageToHistory,
  getRecentMessages,
  clearChannelHistory,
  getConfig
};
