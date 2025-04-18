/**
 * Bocchy Discord Bot - 日付処理モジュール
 * 日付関連のクエリ処理と日本時間の管理を行う
 */

const { DateTime } = require('luxon');
const logger = require('../system/logger');

class DateHandler {
  constructor() {
    this.japanTimeZone = 'Asia/Tokyo';
    logger.info('日付処理モジュールが初期化されました');
  }

  /**
   * 現在の日本時間を取得
   * @returns {DateTime} 日本時間のDateTimeオブジェクト
   */
  getCurrentJapanTime() {
    return DateTime.now().setZone(this.japanTimeZone);
  }

  /**
   * AI用に日付情報を整形
   * @param {DateTime} date - 日付オブジェクト
   * @returns {Object} 整形された日付情報
   */
  formatDateForAI(date) {
    return {
      year: date.year,
      month: date.month,
      day: date.day,
      weekday: date.weekdayLong,
      hour: date.hour,
      minute: date.minute,
      timezone: this.japanTimeZone
    };
  }

  /**
   * 日付関連のクエリかどうかを判定
   * @param {string} query - 検索クエリ
   * @returns {boolean} 日付関連のクエリかどうか
   */
  isDateRelatedQuery(query) {
    const datePatterns = [
      /今日|きょう|本日|今|いま|現在|最近|先週|先月|今年|来年|去年|昨日|明日|あした|あす|今週|今月|今朝|今晩|今夜/i,
      /何日|何時|いつ|何曜日|何月|何年|何時何分|何時ごろ|何時くらい/i,
      /ニュース|天気|予報|予定|スケジュール|イベント|行事|祭り|祝日|休日/i
    ];

    return datePatterns.some(pattern => pattern.test(query));
  }

  /**
   * 日付情報を自然な日本語形式で取得
   * @returns {string} フォーマットされた日付文字列
   */
  getFormattedDateString() {
    const now = this.getCurrentJapanTime();
    return `${now.year}年${now.month}月${now.day}日(${now.weekdayLong}) ${now.hour}時${now.minute}分`;
  }
}

// シングルトンインスタンスをエクスポート
module.exports = new DateHandler(); 