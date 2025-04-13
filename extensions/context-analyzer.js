// extensions/context-analyzer.js - 文脈分析と会話介入判断モジュール
/**
 * 文脈分析器
 * ユーザー間の会話を分析し、Bocchyがいつ会話に介入すべきかを判断するモジュール
 */

// 環境変数からの設定読み込み
const INTERVENTION_MODE = process.env.INTERVENTION_MODE || 'balanced';
const INTERVENTION_KEYWORDS = (process.env.INTERVENTION_KEYWORDS || 'ボッチー,Bocchy,ボット,Bot,AI').split(',');
const INTERVENTION_COOLDOWN = parseInt(process.env.INTERVENTION_COOLDOWN || '60', 10) * 1000; // 秒をミリ秒に変換

// 最後に介入した時間を記録するマップ（チャンネルごと）
const lastInterventionTimes = new Map();

// 介入モードごとの確率（百分率）
const INTERVENTION_PROBABILITIES = {
  'none': 0,       // 介入なし
  'passive': 20,   // 控えめ (20%)
  'balanced': 50,  // バランス (50%)
  'active': 70,    // 積極的 (70%)
  'aggressive': 90 // 最大 (90%)
};

/**
 * 文脈分析と介入判断
 * @param {Message} message - 現在のメッセージ
 * @param {Array} recentMessages - 最近のメッセージ履歴
 * @returns {Promise<boolean>} 介入すべきかどうか
 */
async function shouldIntervene(message, recentMessages = []) {
  // 介入モードが無効の場合は介入しない
  if (INTERVENTION_MODE === 'none') {
    return false;
  }
  
  const channelId = message.channel.id;
  const currentTime = Date.now();
  
  // クールダウン確認
  if (lastInterventionTimes.has(channelId)) {
    const lastIntervention = lastInterventionTimes.get(channelId);
    if (currentTime - lastIntervention < INTERVENTION_COOLDOWN) {
      console.log(`[文脈分析] チャンネル ${message.channel.name} は介入クールダウン中 (残り ${Math.ceil((INTERVENTION_COOLDOWN - (currentTime - lastIntervention)) / 1000)}秒)`);
      return false;
    }
  }
  
  // 会話の流れと文脈を分析
  const analysisResult = analyzeContext(message, recentMessages);
  
  // 介入確率を取得
  const probability = INTERVENTION_PROBABILITIES[INTERVENTION_MODE] || 50;
  
  // 文脈スコアに介入確率を加味
  const shouldInterventScore = analysisResult.score * (probability / 100);
  const randomFactor = Math.random() * 100;
  
  const willIntervene = randomFactor < shouldInterventScore;
  
  // 介入する場合は最後の介入時間を更新
  if (willIntervene) {
    lastInterventionTimes.set(channelId, currentTime);
    console.log(`[文脈分析] チャンネル ${message.channel.name} で介入を決定 (スコア: ${shouldInterventScore.toFixed(2)})`);
  }
  
  return willIntervene;
}

/**
 * 会話文脈の分析
 * @param {Message} message - 現在のメッセージ
 * @param {Array} recentMessages - 最近のメッセージ履歴
 * @returns {Object} 分析結果とスコア
 * @private
 */
function analyzeContext(message, recentMessages) {
  let score = 0;
  const reasons = [];
  
  // 1. キーワードマッチ
  const messageContent = message.content.toLowerCase();
  const containsKeyword = INTERVENTION_KEYWORDS.some(keyword => 
    messageContent.includes(keyword.toLowerCase().trim())
  );
  
  if (containsKeyword) {
    score += 70;
    reasons.push('キーワードマッチ');
  }
  
  // 2. 質問形式チェック
  const isQuestion = messageContent.includes('?') || 
                      messageContent.includes('？') ||
                      /何|誰|どこ|いつ|なぜ|どうして|どうやって|どの|教えて/.test(messageContent);
  
  if (isQuestion) {
    score += 40;
    reasons.push('質問形式');
  }
  
  // 3. 会話の長さと活発さ
  if (recentMessages.length >= 3) {
    score += 15;
    reasons.push('活発な会話');
    
    // 4. 複数ユーザーの参加
    const uniqueUsers = new Set(recentMessages.map(msg => msg.author.id));
    if (uniqueUsers.size >= 2) {
      score += 20;
      reasons.push('複数ユーザーの会話');
    }
    
    // 5. 会話の途切れ
    const lastMessageTime = recentMessages[recentMessages.length - 1]?.createdTimestamp || 0;
    const currentTime = message.createdTimestamp;
    const timeDifference = currentTime - lastMessageTime;
    
    if (timeDifference > 60000) { // 1分以上の間隔
      score += 10;
      reasons.push('会話の途切れ');
    }
  }
  
  // 6. メッセージの長さによる重み付け (短すぎるメッセージは減点)
  if (message.content.length < 5) {
    score -= 30;
    reasons.push('短いメッセージ');
  } else if (message.content.length > 100) {
    score += 20;
    reasons.push('長いメッセージ');
  }
  
  // 最終スコアを0-100の範囲に正規化
  score = Math.max(0, Math.min(100, score));
  
  return {
    score,
    reasons,
    containsKeyword,
    isQuestion
  };
}

/**
 * 介入のクールダウンをリセット
 * @param {string} channelId - チャンネルID
 */
function resetCooldown(channelId) {
  if (lastInterventionTimes.has(channelId)) {
    lastInterventionTimes.delete(channelId);
  }
}

/**
 * 現在の介入モードを取得
 * @returns {string} 現在の介入モード
 */
function getCurrentMode() {
  return INTERVENTION_MODE;
}

/**
 * モジュール設定情報を取得
 * @returns {Object} 設定情報
 */
function getConfig() {
  return {
    mode: INTERVENTION_MODE,
    probability: INTERVENTION_PROBABILITIES[INTERVENTION_MODE],
    keywords: INTERVENTION_KEYWORDS,
    cooldown: INTERVENTION_COOLDOWN / 1000, // ミリ秒から秒に変換
    activeCooldowns: lastInterventionTimes.size
  };
}

module.exports = {
  shouldIntervene,
  resetCooldown,
  getCurrentMode,
  getConfig
};
