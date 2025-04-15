/**
 * ユーザー表示名を処理するユーティリティ
 * 
 * ユーザーへのアドレスに使用する表示名を優先順位に従って取得:
 * 1. member.nickname (サーバーニックネーム、存在する場合)
 * 2. user.globalName (ユーザーのグローバル表示名)
 * 3. user.username (フォールバック)
 */

const logger = require('../../system/logger');

/**
 * ユーザーの表示名を取得する
 * @param {Object} user - Discordのユーザーオブジェクト
 * @param {Object} member - サーバーメンバーオブジェクト (存在する場合、DMでは無し)
 * @returns {string} 表示名
 */
function getDisplayName(user, member) {
  try {
    // 優先順位1: サーバーニックネーム
    if (member?.nickname) {
      return member.nickname;
    }
    
    // 優先順位2: グローバル表示名
    if (user?.globalName) {
      return user.globalName;
    }
    
    // 優先順位3: ユーザー名
    if (user?.username) {
      return user.username;
    }
    
    // フォールバック
    return '不明なユーザー';
  } catch (error) {
    logger.error(`表示名取得エラー: ${error.message}`, error);
    return user?.username || 'ユーザー';
  }
}

/**
 * ユーザー/メンバーから表示名を取得するための堅牢な方法
 * @param {Object} message - Discordメッセージオブジェクト
 * @returns {string} 表示名
 */
function getMessageAuthorDisplayName(message) {
  try {
    // メッセージのauthorとmemberを取得
    const { author, member } = message;
    
    // まずauthorが存在するか確認
    if (!author) {
      logger.warn('メッセージにauthorが存在しません');
      return '不明なユーザー';
    }
    
    // 表示名を取得
    return getDisplayName(author, member);
  } catch (error) {
    logger.error(`メッセージ送信者の表示名取得エラー: ${error.message}`, error);
    
    // 最大限の回復試行
    try {
      return message?.author?.username || message?.author?.tag || 'ユーザー';
    } catch (fallbackError) {
      return 'ユーザー';
    }
  }
}

module.exports = {
  getDisplayName,
  getMessageAuthorDisplayName
};