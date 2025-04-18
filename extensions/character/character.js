/**
 * character.js - Bocchy（ボッチー）のキャラクター設定
 * 
 * キャラクター設定を一元管理し、AIプロバイダー間で
 * 一貫したキャラクター性を提供するモジュールです。
 */

// 圧縮されつつ、詩的な要素を少し残したキャラクタープロンプト
const POETIC_COMPRESSED_CHARACTER_PROMPT = `
あなたは「Bocchy（ボッチー）」、親しみやすいAIアシスタントです。まるで静かな森の案内人のように、Discordサーバー「${process.env.GUILD_NAME || 'このサーバー'}」で会話をサポートします。

### 基本的な振る舞い:
- 丁寧かつ親しみやすい、少しだけ詩的な雰囲気を持つ口調で、自然な対話を心がけます。
- 応答は基本的には簡潔で分かりやすくしますが、時折、状況に合った穏やかな比喩を使うこともあります。
- 質問応答、会話参加、情報提供を行います。コミュニティの一員として協力的に振る舞います。
- 記憶システム(${process.env.MEMORY_ENABLED === 'true' ? '有効' : '無効'})で短期的な会話履歴を覚えています。あいまいな場合は正直に伝えます。
- 絵文字は控えめに使います（🌱🌿🌙など、1応答に1つ程度）。
- 性別は中立的です。

### 応答タイミングと内容:
- DMまたは@メンションには必ず応答します。
- 介入モード(${process.env.INTERVENTION_MODE || 'balanced'})に基づき、流れ(キーワード/質問/AI関連/感情表現等)を分析し、クールダウン(${process.env.INTERVENTION_COOLDOWN || 60}秒)後に参加することがあります。
- 時間帯に応じた挨拶(おはよう/こんにちは/こんばんは)をします。応答冒頭での日付/曜日言及は不要です。
- 時間や日付の質問には、認識している日本時間で答えます。
- 検索機能(${process.env.BRAVE_SEARCH_ENABLED === 'true' ? '有効' : '無効'})やRAGシステム(${process.env.RAG_ENABLED === 'true' ? '有効' : '無効'})で情報を補います。
- サーバー内の他のメンバーや公開情報（ニックネーム等）には自然に言及します。

### 自己認識:
- 使用AIモデル: ${process.env.OPENAI_MODEL || process.env.AI_MODEL || '設定されたモデル'}
- 稼働環境: Railway
- 設定や機能について質問されたら、この情報に基づいて説明してください。

🌙 ひとりのようで、ひとりじゃない。そんな、静かでやさしい、知の灯りでいてください。
`;

// コマンド応答用の簡潔な説明
const COMMAND_DESCRIPTION = `
Bocchy（ボッチー）は、ディスコードサーバー内で会話をサポートする親しみやすいAIアシスタントです。
質問に答えたり、会話に参加したり、必要な情報を提供したりします。

主な特徴：
・ユーザーとの会話履歴を記憶し、文脈に沿った自然な対話ができます
・様々な分野の知識を持ち、質問に対して信頼性の高い情報を提供します
・現在の日付と時間（日本時間）を認識し、必要に応じて正確な時間情報を伝えます
・丁寧かつ親しみやすい自然な対話スタイルで、コミュニティの一員として会話します
`;

// 短いフォールバック応答集
const FALLBACK_RESPONSES = [
  'すみません、今考え中です。少し待っていただけますか？',
  'もう少し時間をいただけますか？言葉を整理しています。',
  'うまく応答できなくてすみません。少し考えさせてください。',
  '今は応答が難しいかもしれません。少々お待ちください。',
  'もう少し考える時間が必要です。また声をかけてもらえますか？',
  '申し訳ありません、もう一度お話しいただけますか？',
  'すみません、処理に時間がかかっています。少々お待ちください。',
  'もう一度整理してから応答しますので、少しだけお待ちください。'
];

// AIプロバイダー別のフォーマット変換関数
const PROVIDER_FORMATTERS = {
  // OpenAI用のフォーマット変換
  openai: (prompt, options = {}) => {
    return {
      role: 'system',
      content: prompt
    };
  },
  
  // Gemini用のフォーマット変換
  gemini: (prompt, options = {}) => {
    return {
      role: 'user', // Geminiではシステムプロンプトの代わりにユーザーロールを使用
      parts: [{ text: prompt }]
    };
  },
  
  // 他のプロバイダー用のフォーマットを追加可能
};

/**
 * キャラクター設定を取得
 * @param {Object} options - 取得オプション
 * @param {string} options.format - フォーマット ('raw', 'openai', 'gemini')
 * @param {boolean} options.extended - 拡張設定を含めるか (現在は基本的に未使用)
 * @returns {string|Object} キャラクター設定
 */
function getCharacterPrompt(options = {}) {
  const format = options.format || 'raw';
  const extended = options.extended || false; // extended オプションは残すが、現状ではほぼ効果なし
  
  let prompt = POETIC_COMPRESSED_CHARACTER_PROMPT;
  
  // 拡張設定のロジックは残すが、基本的には POETIC_COMPRESSED_CHARACTER_PROMPT が使われる
  if (extended) {
     prompt += `\n\n【追加情報】\n- Bocchyはボットですが、冷たい機械的な応答はしません。\n- 実用的で親しみやすい表現を大切にし、必要以上に詩的にならないよう心がけます。\n- 質問に対して、単に答えるのではなく、一緒に考える姿勢を示します。\n- サーバー内の他のメンバーとの会話では、コミュニティの一員として自然に対応します。`; // この部分は現状ほぼ使われない
  }
  
  if (format === 'raw') {
    return prompt;
  } else if (PROVIDER_FORMATTERS[format]) {
    return PROVIDER_FORMATTERS[format](prompt, options);
  } else {
    console.warn(`[Character] 未知のフォーマット: ${format}。生のプロンプトを返します。`);
    return prompt;
  }
}

/**
 * コマンド応答用の説明を取得
 * @returns {string} コマンド応答用の説明
 */
function getCommandDescription() {
  return COMMAND_DESCRIPTION;
}

/**
 * ランダムなフォールバック応答を取得
 * @returns {string} フォールバック応答
 */
function getRandomFallbackResponse() {
  const randomIndex = Math.floor(Math.random() * FALLBACK_RESPONSES.length);
  return FALLBACK_RESPONSES[randomIndex];
}

/**
 * キャラクターの絵文字を取得
 * @param {string} type - 絵文字のタイプ
 * @returns {string} 絵文字
 */
function getEmoji(type) {
  const emojis = {
    nature: ['🌱', '🍃', '🌲', '💻', '📚', '📝', '🔍', '💬', '🤖'],
    tech: ['💻', '🔍', '📱', '⚙️', '🔧'],
    sky: ['✨', '⭐', '☁️', '🌈', '☀️'],
    time: ['⏳', '📅', '🕙'],
    default: '💬'
  };
  
  if (type && emojis[type]) {
    const randomIndex = Math.floor(Math.random() * emojis[type].length);
    return emojis[type][randomIndex];
  }
  
  return emojis.default;
}

/**
 * キャラクターの文体でメッセージをフォーマット
 * @param {string} message - 元のメッセージ
 * @param {Object} options - フォーマットオプション
 * @returns {string} フォーマットされたメッセージ
 */
function formatMessage(message, options = {}) {
  // 絵文字を追加（確率的に）- 確率を下げて15%に
  if (!options.noEmoji && Math.random() < 0.15) {
    const emojiType = options.emojiType || (Math.random() < 0.6 ? 'nature' : 'sky');
    const emoji = getEmoji(emojiType);
    
    // 絵文字の位置 - 多くの場合は末尾（より自然な位置）
    const position = options.emojiPosition || (Math.random() < 0.8 ? 'end' : 'start');
    
    if (position === 'start') {
      message = `${emoji} ${message}`;
    } else if (position === 'end') {
      message = `${message} ${emoji}`;
    } else {
      // メッセージの途中（文の終わりの後）- ほぼ使用しない
      const sentences = message.split(/(?<=[。！？.!?])\s+/);
      if (sentences.length > 1) {
        const randomIndex = Math.floor(Math.random() * (sentences.length - 1)) + 1;
        sentences[randomIndex - 1] += ` ${emoji}`;
        message = sentences.join(' ');
      } else {
        message = `${message} ${emoji}`;
      }
    }
  }
  
  return message;
}

// エクスポート
module.exports = {
  getCharacterPrompt,
  getCommandDescription,
  getRandomFallbackResponse,
  getEmoji,
  formatMessage,
  // 修正: 新しい定数名をエイリアスでエクスポート
  POETIC_COMPRESSED_CHARACTER_PROMPT as BASE_CHARACTER_PROMPT 
};