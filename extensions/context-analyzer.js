/**
 * Bocchy Discord Bot - 文脈分析モジュール
 * チャンネルでの会話の流れを分析し、会話に介入すべきかを判断する
 */

// 介入モードごとの基本確率（0-100）
const INTERVENTION_PROBABILITIES = {
  none: 0,        // 介入しない
  passive: 15,    // ほぼ介入しない
  balanced: 30,   // バランス型（デフォルト）
  active: 50,     // 積極的に介入
  aggressive: 70  // かなり積極的に介入
};

// 設定
const MIN_MESSAGE_LENGTH = 15; // 最小メッセージ長（これより短いとほぼ介入しない）

/**
 * 会話に介入すべきか判断する
 * @param {Object} options - 判断オプション
 * @param {Object} options.message - 現在のメッセージ
 * @param {Array} options.history - 最近のメッセージ履歴
 * @param {string} options.mode - 介入モード (none/passive/balanced/active/aggressive)
 * @param {Array} options.keywords - トリガーキーワード配列
 * @param {number} options.lastInterventionTime - 最後に介入した時間
 * @param {number} options.cooldownSeconds - クールダウン時間（秒）
 * @returns {boolean} 介入すべきかどうか
 */
function shouldIntervene(options) {
  const { 
    message, 
    history = [], 
    mode = 'balanced', 
    keywords = ['ボッチー', 'Bocchy', 'ボット', 'Bot'], 
    lastInterventionTime = 0,
    cooldownSeconds = 60
  } = options;
  
  // 'none' モードなら常に介入しない
  if (mode === 'none') {
    return false;
  }
  
  // メッセージが短すぎるなら確率を大幅に下げる
  if (message.content.length < MIN_MESSAGE_LENGTH) {
    // 短いメッセージでは5%未満の確率でのみ介入
    return Math.random() < 0.05;
  }
  
  // クールダウン期間中なら介入しない
  const now = Date.now();
  if (now - lastInterventionTime < cooldownSeconds * 1000) {
    return false;
  }
  
  // 会話に関連キーワードが含まれるか確認
  const lowerContent = message.content.toLowerCase();
  const containsKeyword = keywords.some(keyword => 
    lowerContent.includes(keyword.toLowerCase())
  );
  
  // 質問文かどうか判定
  const isQuestion = isQuestionText(message.content);
  
  // AI・Bot関連の話題かどうか判定
  const isAIRelated = isAITopic(message.content);
  
  // 感情表現や助けを求める表現があるか判定
  const isEmotionalHelp = hasEmotionalExpression(message.content);
  
  // 最近の会話の流れを分析（質問の連鎖など）
  const conversationContext = analyzeConversationContext(history);
  
  // 基本確率を取得（モードに基づく）
  let interventionProbability = INTERVENTION_PROBABILITIES[mode] || INTERVENTION_PROBABILITIES.balanced;
  
  // 特定条件に応じて確率を調整
  if (containsKeyword) {
    interventionProbability += 30; // キーワードがあれば確率UP
  }
  
  if (isQuestion) {
    interventionProbability += 15; // 質問文なら確率UP
  }
  
  if (isAIRelated) {
    interventionProbability += 25; // AI関連の話題なら確率UP
  }
  
  if (isEmotionalHelp) {
    interventionProbability += 20; // 感情表現や助けを求める場合は確率UP
  }
  
  // 会話コンテキストに基づく調整
  interventionProbability += conversationContext.probabilityModifier;
  
  // 最終確率（0-100の範囲に収める）
  const finalProbability = Math.min(Math.max(interventionProbability, 0), 100);
  
  // 確率に基づいて判断
  return Math.random() * 100 < finalProbability;
}

/**
 * テキストが質問かどうかを判定
 * @param {string} text - 解析するテキスト
 * @returns {boolean} 質問文かどうか
 */
function isQuestionText(text) {
  if (!text) return false;
  
  const lowerText = text.toLowerCase();
  
  // 質問記号による判定
  if (text.includes('?') || text.includes('？')) {
    return true;
  }
  
  // 日本語の質問表現
  const jpQuestionPatterns = [
    'ですか', 'でしょうか', 'かな', 'かしら', 'なぜ', 'どう', 'どの', 'どこ', 
    'だろう', 'ますか', 'ませんか', 'どんな', 'いかが', '何', '誰', 'どちら',
    '教えて', '分かる', 'わかる', '思いますか', '思う？'
  ];
  
  // 英語の質問表現
  const enQuestionPatterns = [
    ' how ', ' what ', ' when ', ' where ', ' which ', ' who ', ' why ',
    ' can ', ' could ', ' would ', ' should ', ' is ', ' are ', ' do ', ' does '
  ];
  
  // 日本語パターン検索
  for (const pattern of jpQuestionPatterns) {
    if (lowerText.includes(pattern)) {
      return true;
    }
  }
  
  // 英語パターン検索
  for (const pattern of enQuestionPatterns) {
    if (lowerText.includes(pattern)) {
      return true;
    }
  }
  
  return false;
}

/**
 * AI・Bot関連のトピックかどうかを判定
 * @param {string} text - 解析するテキスト
 * @returns {boolean} AI関連かどうか
 */
function isAITopic(text) {
  if (!text) return false;
  
  const lowerText = text.toLowerCase();
  
  // AI・Bot関連キーワード
  const aiKeywords = [
    'ai', '人工知能', 'ボット', 'bot', 'チャット', 'chat', 'gpt', 'llm', 
    'language model', '言語モデル', 'ニューラル', 'neural', 'deep learning', 
    'ディープラーニング', 'machine learning', '機械学習', 'claude', 'bocchy', 
    'ボッチー', 'openai', 'discord bot', 'botchi'
  ];
  
  // いずれかのキーワードが含まれるか確認
  return aiKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * 感情表現や助けを求める表現があるかどうかを判定
 * @param {string} text - 解析するテキスト
 * @returns {boolean} 感情表現や助けを求める表現があるかどうか
 */
function hasEmotionalExpression(text) {
  if (!text) return false;
  
  const lowerText = text.toLowerCase();
  
  // 感情表現や助けを求める表現
  const emotionalPatterns = [
    '助けて', 'ヘルプ', 'help', '分からない', 'わからない', '困った', '難しい', 
    'どうすれば', '教えてほしい', 'アドバイス', 'advice', '悩んでる', '悩み', 
    '心配', 'worry', 'anxious', 'confused', '混乱', 'どうしよう', 'どうしたら'
  ];
  
  // いずれかのパターンが含まれるか確認
  return emotionalPatterns.some(pattern => lowerText.includes(pattern));
}

/**
 * 会話の流れを分析して文脈情報を返す
 * @param {Array} history - メッセージ履歴
 * @returns {Object} 分析結果
 */
function analyzeConversationContext(history) {
  if (!history || history.length === 0) {
    return { 
      probabilityModifier: 0,
      isQuestionChain: false,
      hasRecentQuestion: false,
      topicConsistency: 'unknown'
    };
  }
  
  let questionCount = 0;
  let recentQuestionIndex = -1;
  let probabilityModifier = 0;
  
  // 最近の質問を検索し、質問の連鎖を判定
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (isQuestionText(msg.content)) {
      questionCount++;
      if (recentQuestionIndex === -1) {
        recentQuestionIndex = i;
      }
    }
  }
  
  // 連続した質問があれば確率を上げる（議論が活発な場所に参加したい）
  if (questionCount >= 2) {
    probabilityModifier += 15;
  }
  
  // 最近の質問に誰も答えていないようなら確率を上げる
  const hasRecentQuestion = recentQuestionIndex > -1 && recentQuestionIndex >= history.length - 3;
  if (hasRecentQuestion) {
    let answered = false;
    
    // 質問の後に回答と思われるメッセージがあるか確認
    for (let i = recentQuestionIndex + 1; i < history.length; i++) {
      // 回答と思われる条件（ある程度の長さがあり、疑問文でない）
      if (history[i].content.length > 30 && !isQuestionText(history[i].content)) {
        answered = true;
        break;
      }
    }
    
    if (!answered) {
      probabilityModifier += 20; // 未回答の質問があれば介入確率UP
    }
  }
  
  // 会話の一貫性を簡易チェック
  let topicConsistency = 'low';
  
  if (history.length >= 3) {
    // 最新の数メッセージで共通する単語があるか確認（簡易実装）
    const wordCounts = new Map();
    
    // 最新の3メッセージから単語を抽出してカウント
    for (let i = history.length - 3; i < history.length; i++) {
      const words = extractWords(history[i].content);
      
      for (const word of words) {
        if (word.length < 3) continue; // 短すぎる単語はスキップ
        
        const count = wordCounts.get(word) || 0;
        wordCounts.set(word, count + 1);
      }
    }
    
    // 複数回出現する単語の数をカウント
    let repeatedWords = 0;
    for (const count of wordCounts.values()) {
      if (count >= 2) {
        repeatedWords++;
      }
    }
    
    // 共通単語の数に基づいてトピックの一貫性を判定
    if (repeatedWords >= 3) {
      topicConsistency = 'high';
      probabilityModifier += 10; // 一貫性の高い会話には参加確率UP
    } else if (repeatedWords >= 1) {
      topicConsistency = 'medium';
      probabilityModifier += 5;
    }
  }
  
  return {
    probabilityModifier,
    isQuestionChain: questionCount >= 2,
    hasRecentQuestion,
    topicConsistency
  };
}

/**
 * テキストから単語を抽出（簡易実装）
 * @param {string} text - 解析するテキスト
 * @returns {Array} 抽出された単語配列
 */
function extractWords(text) {
  if (!text) return [];
  
  // 英数字の単語を抽出（簡易実装）
  // 実際の実装では形態素解析などの高度な方法を使うべき
  return text.toLowerCase()
    .replace(/[.,\\/#!$%\\^&\\*;:{}=\\-_`~()]/g, '')
    .split(/\\s+/)
    .filter(word => word.length > 0);
}

/**
 * Bocchyのキャラクター設定に基づいて、文脈に適した応答のヒントを提供
 * @param {Object} context - 会話コンテキスト情報
 * @returns {Object} 応答のヒント
 */
function getResponseHint(context) {
  // 文脈情報に基づいて、適切な応答スタイルやトーンのヒントを提供
  // 実装例：質問には丁寧に、感情的な表現には共感的に、など
  
  const hints = {
    tone: 'neutral', // neutral, empathetic, curious, thoughtful
    style: 'standard', // standard, detailed, concise, poetic
    focusPoints: []
  };
  
  // 質問に対する応答ヒント
  if (context.isQuestion) {
    hints.tone = 'thoughtful';
    hints.style = 'detailed';
    hints.focusPoints.push('answer_with_depth');
  }
  
  // 感情表現への応答ヒント
  if (context.hasEmotionalExpression) {
    hints.tone = 'empathetic';
    hints.focusPoints.push('acknowledge_feelings');
  }
  
  // AI関連トピックへの応答ヒント
  if (context.isAITopic) {
    hints.style = 'detailed';
    hints.focusPoints.push('show_domain_knowledge');
  }
  
  // Bocchyらしい応答のためのヒント
  hints.focusPoints.push('gentle_guidance');
  hints.focusPoints.push('maintain_character');
  
  return hints;
}

// モジュールをエクスポート
module.exports = {
  shouldIntervene,
  isQuestionText,
  isAITopic,
  hasEmotionalExpression,
  analyzeConversationContext,
  getResponseHint
};
