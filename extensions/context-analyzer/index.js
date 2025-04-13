/**
 * Context Analyzer - 会話文脈分析モジュール
 * 
 * メッセージの文脈を分析し、ボットが会話に自然に介入すべきタイミングを判断します。
 * キーワード検出、文脈理解、確率的判断を組み合わせて介入の適切さを評価します。
 * 
 * @module extensions/context-analyzer
 */

const logger = require('../../system/logger') || console;

// 環境変数から設定を読み込み
const INTERVENTION_MODE = process.env.INTERVENTION_MODE || 'balanced'; // none, passive, balanced, active, aggressive
const INTERVENTION_KEYWORDS = (process.env.INTERVENTION_KEYWORDS || 'ボッチー,Bocchy,ボット,Bot').split(',');
const INTERVENTION_COOLDOWN = parseInt(process.env.INTERVENTION_COOLDOWN || '60', 10); // 秒単位

// クールダウンの管理（チャンネルごと）
const cooldowns = new Map();

// 介入確率の設定
const PROBABILITY = {
  passive: 0.2,    // 20%の確率で介入
  balanced: 0.5,   // 50%の確率で介入
  active: 0.7,     // 70%の確率で介入
  aggressive: 0.9  // 90%の確率で介入
};

/**
 * 特定のチャンネルがクールダウン中かどうかをチェック
 * @param {string} channelId - チャンネルID
 * @returns {boolean} クールダウン中かどうか
 */
function isInCooldown(channelId) {
  if (!cooldowns.has(channelId)) {
    return false;
  }
  
  const cooldownTime = cooldowns.get(channelId);
  const now = Date.now();
  
  return now < cooldownTime;
}

/**
 * チャンネルにクールダウンを設定
 * @param {string} channelId - チャンネルID
 */
function setCooldown(channelId) {
  const now = Date.now();
  const cooldownEnd = now + (INTERVENTION_COOLDOWN * 1000);
  cooldowns.set(channelId, cooldownEnd);
}

/**
 * メッセージ内容に特定のキーワードが含まれているかをチェック
 * @param {string} content - メッセージ内容
 * @param {string[]} keywords - チェックするキーワード配列
 * @returns {boolean} キーワードが含まれているかどうか
 */
function containsKeywords(content, keywords) {
  const lowerContent = content.toLowerCase();
  return keywords.some(keyword => lowerContent.includes(keyword.toLowerCase()));
}

/**
 * メッセージの内容から質問パターンを検出
 * @param {string} content - メッセージ内容
 * @returns {boolean} 質問パターンが検出されたかどうか
 */
function detectQuestionPattern(content) {
  // 「？」や疑問詞で終わる文など
  const questionPatterns = [
    /(\?|？|でしょうか|ですか|かな|思いますか)$/,
    /^(なぜ|どうして|なんで|どうやって|どう|何|いつ|どこ|だれ|どんな)/
  ];
  
  return questionPatterns.some(pattern => pattern.test(content));
}

/**
 * 意見を求めるパターンを検出
 * @param {string} content - メッセージ内容 
 * @returns {boolean} 意見を求めるパターンが検出されたかどうか
 */
function detectOpinionRequest(content) {
  const opinionPatterns = [
    /(\どう思(う|います)|意見|どうかな|教えて)/,
    /(について|どう|思い|考え).*(？|教えて|知りたい)/
  ];
  
  return opinionPatterns.some(pattern => pattern.test(content));
}

/**
 * 直近のメッセージから会話の停滞を検出
 * @param {Array} recentMessages - 直近のメッセージ配列
 * @returns {boolean} 会話が停滞しているかどうか
 */
function detectStagnantDiscussion(recentMessages) {
  // メッセージが少ない場合は停滞とみなさない
  if (!recentMessages || recentMessages.length < 3) {
    return false;
  }
  
  // 短いメッセージの連続を検出（数回のやり取りが短い言葉だけの場合）
  const shortMessageCount = recentMessages
    .filter(msg => msg.content.length < 10)
    .length;
  
  // 半数以上が短いメッセージの場合、停滞とみなす
  if (shortMessageCount > recentMessages.length / 2) {
    return true;
  }
  
  return false;
}

/**
 * 話題が関連する分野かを検出（Bocchyが得意な分野についての会話か）
 * @param {string} content - メッセージ内容
 * @returns {boolean} 関連する話題かどうか
 */
function detectRelevantTopic(content) {
  const relevantTopics = [
    /AI|人工知能|機械学習|ChatGPT|LLM|言語モデル/i,
    /プログラミング|コード|開発|JavaScript|Python|アプリ/i,
    /哲学|思想|考え方|アイデア|概念/i,
    /詩|俳句|短歌|文学|表現/i,
    /自然|森|植物|癒し|静けさ/i
  ];
  
  return relevantTopics.some(pattern => pattern.test(content));
}

/**
 * メッセージの文脈に基づいて介入すべきかどうかを判断
 * @param {string} content - メッセージ内容
 * @param {Array} recentMessages - 直近のメッセージ配列
 * @returns {boolean} 介入すべきかどうか
 */
function shouldInterveneBasedOnContext(content, recentMessages) {
  // 質問パターンの検出
  const isQuestion = detectQuestionPattern(content);
  
  // 意見を求めるパターンの検出
  const isAskingOpinion = detectOpinionRequest(content);
  
  // 会話が停滞しているかの検出
  const isStagnantDiscussion = detectStagnantDiscussion(recentMessages);
  
  // 話題が関連する分野かの検出
  const isRelevantTopic = detectRelevantTopic(content);
  
  // デバッグログ
  logger.debug(`文脈分析結果: 質問=${isQuestion}, 意見=${isAskingOpinion}, 停滞=${isStagnantDiscussion}, 関連話題=${isRelevantTopic}`);
  
  // いずれかの条件を満たせば介入を検討
  return isQuestion || isAskingOpinion || isStagnantDiscussion || isRelevantTopic;
}

/**
 * メッセージと文脈から介入すべきかどうかを総合的に判断
 * @param {Object} message - ディスコードメッセージオブジェクト
 * @param {Array} recentMessages - 直近のメッセージ配列
 * @param {Object} options - オプション設定
 * @returns {boolean} 介入すべきかどうか
 */
async function shouldIntervene(message, recentMessages = [], options = {}) {
  // 介入モードがnoneの場合は常に介入しない
  if (INTERVENTION_MODE === 'none') {
    return false;
  }
  
  // メッセージ内容の取得
  const content = message.content;
  const channelId = message.channel.id;
  
  // クールダウンチェック（短時間に何度も介入しない）
  if (isInCooldown(channelId)) {
    logger.debug(`チャンネル ${channelId} はクールダウン中のため介入しません`);
    return false;
  }
  
  // 1. キーワードチェック（特定キーワードへの反応）
  if (containsKeywords(content, INTERVENTION_KEYWORDS)) {
    logger.info(`キーワード検出による介入: ${content}`);
    setCooldown(channelId);
    return true;
  }
  
  // 2. 文脈分析（会話の流れから介入タイミングを判断）
  if (shouldInterveneBasedOnContext(content, recentMessages)) {
    // 介入確率の計算（モードに応じた確率）
    const probability = PROBABILITY[INTERVENTION_MODE] || 0.5;
    const shouldTrigger = Math.random() < probability;
    
    if (shouldTrigger) {
      logger.info(`文脈分析による介入 (${INTERVENTION_MODE}モード): ${content}`);
      setCooldown(channelId);
      return true;
    } else {
      logger.debug(`介入条件を満たしますが、確率判定で見送り (${INTERVENTION_MODE}モード)`);
    }
  }
  
  return false;
}

module.exports = {
  shouldIntervene,
  isInCooldown,
  setCooldown
};