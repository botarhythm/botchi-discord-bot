/**
 * Bocchy Discord Bot - 文脈分析モジュール
 * チャンネルでの会話の流れを分析し、会話に介入すべきかを判断する
 */

// 外部依存を削除し、設定を内部化
const ANALYZER_CONFIG = {
  // 介入モードごとの基本確率（0-100）
  INTERVENTION_PROBABILITIES: {
    none: 0,        // 介入しない
    passive: 20,    // ほぼ介入しない
    balanced: 40,   // バランス型（デフォルト）
    active: 60,     // 積極的に介入
    aggressive: 75  // かなり積極的に介入
  },
  // 設定
  MIN_MESSAGE_LENGTH: 10, // 最小メッセージ長（これより短いとほぼ介入しない）- 短くして判定しやすく
  MAX_MESSAGE_LENGTH: 800, // 処理する最大メッセージ長 - 長めのメッセージも処理
  MAX_PROCESS_TIME: 100, // 処理時間上限（ms）- 少し余裕を持たせる
  DEFAULT_KEYWORDS: ['ボッチー', 'Bocchy', 'ボット', 'Bot', 'AI', '人工知能', 'Discord', 'ディスコード'],
  DEFAULT_COOLDOWN: 30 // デフォルトクールダウン時間（秒）- 短めにして介入しやすく
};

// 事前コンパイルされた正規表現パターン
const QUESTION_PATTERNS = {
  JP: /ですか|でしょうか|かな|かしら|なぜ|どう|どの|どこ|だろう|ますか|ませんか|どんな|いかが|何|誰|どちら|教えて|分かる|わかる|思いますか|思う？/,
  EN: /\b(how|what|when|where|which|who|why|can|could|would|should|is|are|do|does)\b/i,
  SYMBOLS: /\?|？/
};

// AI・Bot関連キーワード（事前定義）
const AI_KEYWORDS = [
  'ai', '人工知能', 'ボット', 'bot', 'チャット', 'chat', 'gpt', 'llm', 
  'language model', '言語モデル', 'ニューラル', 'neural', 'deep learning', 
  'ディープラーニング', 'machine learning', '機械学習', 'claude', 'bocchy', 
  'ボッチー', 'openai', 'discord bot', 'botchi'
];

// 感情表現や助けを求める表現（事前定義）
const EMOTIONAL_PATTERNS = [
  '助けて', 'ヘルプ', 'help', '分からない', 'わからない', '困った', '難しい', 
  'どうすれば', '教えてほしい', 'アドバイス', 'advice', '悩んでる', '悩み', 
  '心配', 'worry', 'anxious', 'confused', '混乱', 'どうしよう', 'どうしたら'
];

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
  try {
    // 処理時間モニタリング開始
    const startTime = Date.now();
    
    // より詳細なデバッグ情報（システムのロガーがあれば利用、なければconsole.log）
    // ロガーの準備（一度だけ宣言）
    const logger = require('../system/logger') || console;
    
    logger.debug('[ANALYZER] Context analyzer called with options:', JSON.stringify({
      messageContent: options?.message?.content?.substring(0, 30),
      historyLength: options?.history?.length,
      mode: options?.mode,
      keywordsCount: Array.isArray(options?.keywords) ? options?.keywords.length : 0,
      lastInterventionTime: options?.lastInterventionTime ? new Date(options.lastInterventionTime).toISOString() : 'none',
      cooldownSeconds: options?.cooldownSeconds || ANALYZER_CONFIG.DEFAULT_COOLDOWN
    }));
    
    // オプションの安全な展開
    const { 
      message, 
      history = [], 
      mode = 'balanced', 
      keywords = ANALYZER_CONFIG.DEFAULT_KEYWORDS, 
      lastInterventionTime = 0,
      cooldownSeconds = ANALYZER_CONFIG.DEFAULT_COOLDOWN
    } = options || {};
    
    // メッセージが存在しない、または無効な場合は介入しない
    if (!message || !message.content) {
      logger.debug('[ANALYZER] No valid message content, skipping intervention');
      return false;
    }
    
    // メッセージが長すぎる場合は処理しない (リソース消費防止)
    if (message.content.length > ANALYZER_CONFIG.MAX_MESSAGE_LENGTH) {
      logger.debug(`[ANALYZER] Message too long (${message.content.length} chars), skipping intervention`);
      return false;
    }
    
    // 'none' モードなら常に介入しない
    if (mode === 'none') {
      logger.debug('[ANALYZER] Intervention mode is none, skipping intervention');
      return false;
    }
    
    // 短いメッセージでもキーワードチェックを先に行う
    const lowerContent = message.content.toLowerCase();
    
    // AIキーワードを含むか先に確認 - 関連性の高い発言の場合は短くても介入確率を上げる
    const isAIRelated = isAITopic(message.content);
    
    // メッセージが短すぎる場合
    if (message.content.length < ANALYZER_CONFIG.MIN_MESSAGE_LENGTH) {
      // AIキーワードを含む場合は50%の確率で介入（大幅に上げる）
      if (isAIRelated) {
        const rand = Math.random();
        const willIntervene = rand < 0.5; // 50%の高確率
        logger.debug(`[ANALYZER] Short message (${message.content.length} chars) but AI related, random check: ${rand.toFixed(3)} < 0.5? ${willIntervene ? 'will intervene' : 'will not intervene'}`);
        return willIntervene;
      }
      
      // AI関連でない短いメッセージは10%の低確率で介入
      const rand = Math.random();
      const willIntervene = rand < 0.1;
      logger.debug(`[ANALYZER] Message too short (${message.content.length} chars), random check: ${rand.toFixed(3)} < 0.1? ${willIntervene ? 'will intervene' : 'will not intervene'}`);
      return willIntervene;
    }
    
    // クールダウン期間中なら介入しない
    const now = Date.now();
    if (now - lastInterventionTime < cooldownSeconds * 1000) {
      const remainingCooldown = ((lastInterventionTime + (cooldownSeconds * 1000)) - now) / 1000;
      logger.debug(`[ANALYZER] Cooldown active, remaining: ${remainingCooldown.toFixed(1)} seconds, skipping intervention`);
      return false;
    } else {
      logger.debug(`[ANALYZER] No cooldown active (last intervention: ${new Date(lastInterventionTime).toISOString()})`);
    }
    
    // 処理時間チェック
    if (now - startTime > ANALYZER_CONFIG.MAX_PROCESS_TIME) {
      logger.warn('[ANALYZER] Context analysis timeout in initial checks');
      return false;
    }
    
    // 会話に関連キーワードが含まれるか確認（lowerContentは既に設定済み）
    const matchedKeywords = [];
    
    // キーワード処理の改善
    const containsKeyword = Array.isArray(keywords) && keywords.some(keyword => {
      if (!keyword) return false;
      const lowerKeyword = keyword.toLowerCase();
      const contains = lowerContent.includes(lowerKeyword);
      if (contains) matchedKeywords.push(keyword);
      return contains;
    });
    
    logger.debug(`[ANALYZER] Keywords check: ${containsKeyword ? 'found' : 'not found'}, matched: [${matchedKeywords.join(', ')}]`);
    
    // 質問文かどうか判定
    const isQuestion = isQuestionText(message.content);
    logger.debug(`[ANALYZER] Question check: ${isQuestion ? 'is question' : 'not a question'}`);
    
    // 処理時間チェック
    if (Date.now() - startTime > ANALYZER_CONFIG.MAX_PROCESS_TIME) {
      logger.warn('[ANALYZER] Context analysis timeout after question analysis');
      return false;
    }
    
    // AI・Bot関連の話題かどうか判定（すでに評価済み、ログ出力のみ実施）
    logger.debug(`[ANALYZER] AI topic check: ${isAIRelated ? 'is AI-related' : 'not AI-related'}`);
    
    // 感情表現や助けを求める表現があるか判定
    const isEmotionalHelp = hasEmotionalExpression(message.content);
    logger.debug(`[ANALYZER] Emotional expression check: ${isEmotionalHelp ? 'has emotional expression' : 'no emotional expression'}`);
    
    // 処理時間チェック
    if (Date.now() - startTime > ANALYZER_CONFIG.MAX_PROCESS_TIME) {
      logger.warn('[ANALYZER] Context analysis timeout after topic analysis');
      return false;
    }
    
    // 最近の会話の流れを分析（質問の連鎖など）
    const conversationContext = analyzeConversationContext(history);
    logger.debug(`[ANALYZER] Conversation context: ${JSON.stringify(conversationContext)}`);
    
    // 基本確率を取得（モードに基づく）
    let interventionProbability = ANALYZER_CONFIG.INTERVENTION_PROBABILITIES[mode] || 
                                 ANALYZER_CONFIG.INTERVENTION_PROBABILITIES.balanced;
    
    logger.debug(`[ANALYZER] Base intervention probability (${mode} mode): ${interventionProbability}%`);
    
    // 特定条件に応じて確率を調整
    let probabilityLog = [`Base (${mode}): ${interventionProbability}%`];
    
    if (containsKeyword) {
      interventionProbability += 30; // キーワードがあれば確率UP
      probabilityLog.push(`Keywords (+30): ${interventionProbability}%`);
    }
    
    if (isQuestion) {
      interventionProbability += 15; // 質問文なら確率UP
      probabilityLog.push(`Question (+15): ${interventionProbability}%`);
    }
    
    if (isAIRelated) {
      interventionProbability += 25; // AI関連の話題なら確率UP
      probabilityLog.push(`AI-related (+25): ${interventionProbability}%`);
    }
    
    if (isEmotionalHelp) {
      interventionProbability += 20; // 感情表現や助けを求める場合は確率UP
      probabilityLog.push(`Emotional (+20): ${interventionProbability}%`);
    }
    
    // 会話コンテキストに基づく調整
    if (conversationContext.probabilityModifier !== 0) {
      interventionProbability += conversationContext.probabilityModifier;
      probabilityLog.push(`Context (${conversationContext.probabilityModifier > 0 ? '+' : ''}${conversationContext.probabilityModifier}): ${interventionProbability}%`);
    }
    
    // 最終確率（0-100の範囲に収める）
    const finalProbability = Math.min(Math.max(interventionProbability, 0), 100);
    
    if (finalProbability !== interventionProbability) {
      probabilityLog.push(`Clamped to range: ${finalProbability}%`);
    }
    
    logger.debug(`[ANALYZER] Probability calculation: ${probabilityLog.join(' → ')}`);
    
    // 最終処理時間チェック
    if (Date.now() - startTime > ANALYZER_CONFIG.MAX_PROCESS_TIME) {
      logger.warn('[ANALYZER] Context analysis timeout before final decision');
      return false;
    }
    
    // 確率に基づいて判断
    const randomValue = Math.random() * 100;
    const willIntervene = randomValue < finalProbability;
    
    logger.debug(`[ANALYZER] Final decision: random value ${randomValue.toFixed(2)} < probability ${finalProbability.toFixed(2)}? ${willIntervene ? 'YES, WILL INTERVENE' : 'NO, WILL NOT INTERVENE'}`);
    
    return willIntervene;
  } catch (error) {
    // ロガーにエラーを出力（できない場合はconsoleにフォールバック）
    try {
      const logger = require('../system/logger');
      logger.error('[ANALYZER] Error in context intervention analysis:', error);
    } catch (e) {
      console.error('[ANALYZER] Error in context intervention analysis:', error);
    }
    return false; // エラー時は安全に介入しない
  }
}

/**
 * テキストが質問かどうかを判定
 * @param {string} text - 解析するテキスト
 * @returns {boolean} 質問文かどうか
 */
function isQuestionText(text) {
  try {
    if (!text) return false;
    
    const lowerText = text.toLowerCase();
    
    // 質問記号による判定（事前コンパイルされたパターンを使用）
    if (QUESTION_PATTERNS.SYMBOLS.test(text)) {
      return true;
    }
    
    // 日本語の質問表現（事前コンパイルされたパターンを使用）
    if (QUESTION_PATTERNS.JP.test(lowerText)) {
      return true;
    }
    
    // 英語の質問表現（事前コンパイルされたパターンを使用）
    if (QUESTION_PATTERNS.EN.test(lowerText)) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error in question text analysis:', error);
    return false; // エラー時は安全に非質問と判定
  }
}

/**
 * AI・Bot関連のトピックかどうかを判定
 * @param {string} text - 解析するテキスト
 * @returns {boolean} AI関連かどうか
 */
function isAITopic(text) {
  try {
    if (!text) return false;
    
    const lowerText = text.toLowerCase();
    
    // 事前定義されたキーワードリストを使用
    // いずれかのキーワードが含まれるか確認
    return AI_KEYWORDS.some(keyword => lowerText.includes(keyword));
  } catch (error) {
    console.error('Error in AI topic analysis:', error);
    return false; // エラー時は安全にAI関連でないと判定
  }
}

/**
 * 感情表現や助けを求める表現があるかどうかを判定
 * @param {string} text - 解析するテキスト
 * @returns {boolean} 感情表現や助けを求める表現があるかどうか
 */
function hasEmotionalExpression(text) {
  try {
    if (!text) return false;
    
    const lowerText = text.toLowerCase();
    
    // 事前定義されたパターンリストを使用
    // いずれかのパターンが含まれるか確認
    return EMOTIONAL_PATTERNS.some(pattern => lowerText.includes(pattern));
  } catch (error) {
    console.error('Error in emotional expression analysis:', error);
    return false; // エラー時は安全に感情表現なしと判定
  }
}

/**
 * 会話の流れを分析して文脈情報を返す
 * @param {Array} history - メッセージ履歴
 * @returns {Object} 分析結果
 */
function analyzeConversationContext(history) {
  try {
    // 履歴がない場合のデフォルト値
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
      // 無効なメッセージデータをスキップ
      if (!msg || !msg.content) continue;
      
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
        // 無効なメッセージデータをスキップ
        if (!history[i] || !history[i].content) continue;
        
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
      let validMessageCount = 0;
      for (let i = history.length - 1; i >= 0 && validMessageCount < 3; i--) {
        // 無効なメッセージデータをスキップ
        if (!history[i] || !history[i].content) continue;
        
        const words = extractWords(history[i].content);
        validMessageCount++;
        
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
  } catch (error) {
    console.error('Error in conversation context analysis:', error);
    // エラー時のフォールバック値
    return { 
      probabilityModifier: 0,
      isQuestionChain: false,
      hasRecentQuestion: false,
      topicConsistency: 'unknown'
    };
  }
}

/**
 * テキストから単語を抽出（簡易実装）
 * @param {string} text - 解析するテキスト
 * @returns {Array} 抽出された単語配列
 */
function extractWords(text) {
  try {
    if (!text) return [];
    
    // 英数字の単語を抽出（簡易実装）
    // 実際の実装では形態素解析などの高度な方法を使うべき
    return text.toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
      .split(/\s+/)
      .filter(word => word && word.length > 0);
  } catch (error) {
    console.error('Error in word extraction:', error);
    return []; // エラー時は空配列を返す
  }
}

/**
 * Bocchyのキャラクター設定に基づいて、文脈に適した応答のヒントを提供
 * @param {Object} context - 会話コンテキスト情報
 * @returns {Object} 応答のヒント
 */
function getResponseHint(context) {
  try {
    // 無効なコンテキストのチェック
    const validContext = context && typeof context === 'object';
    
    // 文脈情報に基づいて、適切な応答スタイルやトーンのヒントを提供
    // 実装例：質問には丁寧に、感情的な表現には共感的に、など
    const hints = {
      tone: 'neutral', // neutral, empathetic, curious, thoughtful
      style: 'standard', // standard, detailed, concise, poetic
      focusPoints: []
    };
    
    if (validContext) {
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
    }
    
    // Bocchyらしい応答のためのヒント（常に追加）
    hints.focusPoints.push('gentle_guidance');
    hints.focusPoints.push('maintain_character');
    
    return hints;
  } catch (error) {
    console.error('Error in response hint generation:', error);
    // エラー時のフォールバック値
    return {
      tone: 'neutral',
      style: 'standard',
      focusPoints: ['gentle_guidance', 'maintain_character']
    };
  }
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