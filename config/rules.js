/**
 * ボッチのルール設定
 */

const RULES = {
  // 基本設定
  BASE: {
    maxResponseLength: 2000,    // 応答の最大長
    defaultLanguage: 'ja',      // デフォルト言語
    timeoutSeconds: 30,         // タイムアウト時間
  },

  // 会話ルール
  CONVERSATION: {
    maxTurns: 10,              // 最大会話ターン数
    minMessageLength: 2,        // 最小メッセージ長
    maxMessageLength: 1000,     // 最大メッセージ長
    cooldownSeconds: 1,         // メッセージ間のクールダウン時間
  },

  // 制限ルール
  LIMITATIONS: {
    maxDailyMessages: 100,      // 1日あたりの最大メッセージ数
    maxConcurrentSessions: 3,   // 同時セッション数の制限
    maxAttachmentSize: 5242880, // 添付ファイルの最大サイズ（5MB）
  },

  // カスタマイズルール
  CUSTOMIZATION: {
    allowedEmojis: true,        // 絵文字の使用許可
    allowedMarkdown: true,      // Markdownの使用許可
    allowedHtml: false,         // HTMLの使用許可
  }
};

// ルールの取得
const getRule = (category, key) => {
  if (!RULES[category]) {
    throw new Error(`Unknown rule category: ${category}`);
  }
  if (!RULES[category][key]) {
    throw new Error(`Unknown rule key: ${category}.${key}`);
  }
  return RULES[category][key];
};

// ルールの検証
const validateRule = (category, key, value) => {
  const rule = getRule(category, key);
  switch (typeof rule) {
    case 'number':
      return value <= rule;
    case 'boolean':
      return true;
    default:
      return true;
  }
};

module.exports = {
  RULES,
  getRule,
  validateRule
}; 