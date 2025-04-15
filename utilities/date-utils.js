/**
 * Bocchy Discord Bot - 日付ユーティリティ
 * 日付のフォーマットなどを行うユーティリティ関数群
 */

/**
 * 日付を日本語フォーマットで整形
 * @param {Date} date - フォーマットする日付
 * @returns {string} フォーマットされた日付文字列
 */
function formatDateTime(date) {
  if (!date || !(date instanceof Date)) {
    date = new Date();
  }
  
  // 曜日の配列
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  
  // 年月日の取得
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 月は0-11なので+1
  const day = date.getDate();
  const weekday = weekdays[date.getDay()];
  
  // 時刻の取得
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  // 日本語形式で整形
  return `${year}年${month}月${day}日 (${weekday}) ${hours}:${minutes}:${seconds}`;
}

/**
 * 相対時間を日本語で表現（例: 5分前、3時間前、昨日）
 * @param {Date|number} date - 変換する日付またはタイムスタンプ
 * @returns {string} 相対時間の文字列
 */
function getRelativeTimeString(date) {
  // Date型でない場合は変換
  const targetDate = date instanceof Date ? date : new Date(date);
  
  // 現在時刻との差（ミリ秒）
  const diff = Date.now() - targetDate.getTime();
  
  // 差分を秒に変換
  const seconds = Math.floor(diff / 1000);
  
  // 相対時間の計算
  if (seconds < 60) {
    return 'たった今';
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}分前`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours}時間前`;
  } else if (seconds < 604800) {
    const days = Math.floor(seconds / 86400);
    return `${days}日前`;
  } else if (seconds < 2592000) {
    const weeks = Math.floor(seconds / 604800);
    return `${weeks}週間前`;
  } else if (seconds < 31536000) {
    const months = Math.floor(seconds / 2592000);
    return `${months}ヶ月前`;
  } else {
    const years = Math.floor(seconds / 31536000);
    return `${years}年前`;
  }
}

/**
 * 日時をISO 8601形式の文字列に変換
 * @param {Date} date - 変換する日付
 * @returns {string} ISO 8601形式の文字列
 */
function toISOString(date) {
  if (!date || !(date instanceof Date)) {
    date = new Date();
  }
  return date.toISOString();
}

/**
 * 指定された日付が今日かどうかを判定
 * @param {Date} date - 判定する日付
 * @returns {boolean} 今日の日付ならtrue
 */
function isToday(date) {
  const today = new Date();
  return date.getDate() === today.getDate() &&
         date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear();
}

// エクスポート
module.exports = {
  formatDateTime,
  getRelativeTimeString,
  toISOString,
  isToday
};
