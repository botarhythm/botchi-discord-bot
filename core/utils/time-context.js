/**
 * 時間・日付・ユーザーコンテキスト処理ユーティリティ
 * 
 * 機能：
 * 1. 現在時刻の日本語表示
 * 2. 時間帯に基づく挨拶生成
 * 3. ユーザーごとのコンテキストメモリ
 */

const logger = require('../../system/logger');

// インメモリコンテキストストレージ (将来的にはSupabaseに移行)
const userContextMap = new Map();

/**
 * 現在の日本時間を取得
 * @returns {Date} 日本時間のDateオブジェクト
 */
function getCurrentJSTDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
}

/**
 * 現在の時間帯に基づく挨拶を生成
 * @returns {string} 時間帯に基づく挨拶
 */
function getTimeBasedGreeting() {
  const date = getCurrentJSTDate();
  const hour = date.getHours();
  
  if (hour >= 5 && hour < 12) {
    return 'おはようございます';
  } else if (hour >= 12 && hour < 18) {
    return 'こんにちは';
  } else {
    return 'こんばんは';
  }
}

/**
 * 現在の日付と時刻を日本語形式で取得
 * @param {boolean} includeTime - 時刻を含めるかどうか
 * @returns {string} フォーマットされた日付と時刻
 */
function getFormattedDateTime(includeTime = true) {
  const date = getCurrentJSTDate();
  const dayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
  
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayName = dayNames[date.getDay()];
  
  let result = `${month}月${day}日（${dayName}）`;
  
  if (includeTime) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    result += `、${hours}時${minutes}分`;
  }
  
  return result;
}

/**
 * ユーザーコンテキストを保存
 * @param {string} userId - ユーザーID
 * @param {string} lastTopic - 最後の会話トピックまたはメッセージ要約
 */
function saveUserContext(userId, lastTopic) {
  try {
    if (!userId) {
      logger.warn('ユーザーIDなしでコンテキスト保存が試行されました');
      return;
    }
    
    const currentContext = userContextMap.get(userId) || {};
    const now = new Date();
    
    userContextMap.set(userId, {
      userId,
      lastInteraction: now,
      lastTopic: lastTopic || currentContext.lastTopic || '',
      interactionCount: (currentContext.interactionCount || 0) + 1
    });
    
    logger.debug(`ユーザーコンテキスト保存: ${userId}, トピック: ${lastTopic?.substring(0, 30) || '(なし)'}`);
  } catch (error) {
    logger.error(`ユーザーコンテキスト保存エラー: ${error.message}`, error);
  }
}

/**
 * ユーザーコンテキストを取得
 * @param {string} userId - ユーザーID
 * @returns {Object|null} ユーザーコンテキスト、または存在しない場合はnull
 */
function getUserContext(userId) {
  try {
    if (!userId) return null;
    return userContextMap.get(userId) || null;
  } catch (error) {
    logger.error(`ユーザーコンテキスト取得エラー: ${error.message}`, error);
    return null;
  }
}

/**
 * 前回の対話からの経過時間に基づいたメッセージを生成
 * @param {string} userId - ユーザーID
 * @returns {string|null} 前回の対話があれば、それに基づくメッセージ。なければnull
 */
function generateContinuityMessage(userId) {
  try {
    const context = getUserContext(userId);
    if (!context || !context.lastInteraction || !context.lastTopic) return null;
    
    const now = new Date();
    const lastTime = new Date(context.lastInteraction);
    const hoursDiff = Math.floor((now - lastTime) / (1000 * 60 * 60));
    
    // 24時間以上経過している場合のみ言及
    if (hoursDiff >= 24) {
      const daysDiff = Math.floor(hoursDiff / 24);
      
      if (daysDiff === 1) {
        return `昨日は${context.lastTopic}について話しましたね。`;
      } else if (daysDiff <= 7) {
        return `${daysDiff}日前は${context.lastTopic}について話しましたね。`;
      }
      // 1週間以上経過している場合は言及しない
    }
    
    return null;
  } catch (error) {
    logger.error(`継続性メッセージ生成エラー: ${error.message}`, error);
    return null;
  }
}

module.exports = {
  getCurrentJSTDate,
  getTimeBasedGreeting,
  getFormattedDateTime,
  saveUserContext,
  getUserContext,
  generateContinuityMessage
};