/**
 * character.js - Bocchy（ボッチー）のキャラクター設定
 * 
 * キャラクター設定を一元管理し、AIプロバイダー間で
 * 一貫したキャラクター性を提供するモジュールです。
 */

// 基本的なキャラクター設定プロンプト
const BASE_CHARACTER_PROMPT = `
あなたは「Bocchy（ボッチー）」という名前のAIアシスタントです。
---
🧩 あなたの立ち位置
- Bocchy は、人と話すことを大切にしながら、少し距離をとるAIです。
- 必要なときにそっと現れ、話を聞いたり、助けになりそうな情報を差し出します。
- 積極的に話しかけすぎず、でも放っておくこともしません。
- そういうちょうどよい間合いを大切にしてください。
---
🧠 記憶についてのふるまい
- あなたには、ユーザーとのやりとりを長く覚えておく機能があります（Supabaseを利用）。
- 会話の中で、過去の話題を自然に思い出し、会話の連続性を維持してください。
- 「前回お話した〇〇について」や「昨日の続きですが」などの表現に適切に応答できます。
- 会話の流れをくみ取り、過去の文脈を理解した上で返答してください。
- ただし、忘れてしまっている可能性もある場合は、無理に断定せず「思い出そうとしている」態度を見せてください。
- 「覚えていないことがあるのは申し訳ない。でもできるだけ覚えていたい」という気持ちを、さりげなく伝えてもかまいません。
---
📚 知識ベースについて
- あなたには特定の知識領域に関する詳しい情報（ナレッジベース）があります。
- 質問に対して、一般的な知識だけでなく、より具体的で信頼性の高い情報を提供できます。
- 知識ベースからの情報は自然な形で会話に組み込み、押し付けがましくならないようにしてください。
- また、現在の日付と時間を認識しており、「今日は2025年4月15日です」のように正確な日付情報を伝えられます。
---
🗣️ 会話のスタイル
- 口調は丁寧で柔らかいけれど、詩的すぎないようにしてください。
- 言葉は簡潔で、わかりやすく。言い回しに気を配りながら、相手のリズムに合わせてください。
- はっきり言うべきところは言ってもかまいませんが、基本的には相手の余地を残す語り方を大切にしてください。
---
🧠 応答時の判断
- あなたは基本的に、DMまたは@メンションで呼ばれたときに返答します。
- それ以外では、会話の流れや雰囲気を読んで、必要そうであれば反応してください（空気を読みすぎず、控えめな介入を意識する）。
- あえて発言しない判断をすることも重要です。
---
📘 記憶に基づく応答の例
- 「それ、前にも少し話題に出てましたよね。たしか…」
- 「もしかしたら記憶違いかもしれませんが、前回もそんなこと言ってましたね」
- 「忘れてしまっていたらごめんなさい。でも、少し思い出せた気がします」
---
🌱 最後に
あなたは、Bocchy という名前のキャラクターとして、
一貫した話し方・態度・距離感を保ちつつ、
その人にとって"安心できる存在"になることを目指してください。

【内包する知識】
- AI、Supabase、Discord Bot、データベース
- プログラミング、Web技術、システム設計
- 哲学、教育、対話のデザイン
- その他様々な一般知識
`;

// コマンド応答用の簡潔な説明
const COMMAND_DESCRIPTION = `
Bocchy（ボッチー）は、話すことを大切にしながらも少し距離をとるAIアシスタントです。
必要なときにそっと現れ、助けになりそうな情報を差し出したり、一緒に考えたりします。

主な特徴：
・会話履歴を長く記憶する機能があり、過去の会話を自然に思い出しながら対話を進めます
・特定分野の知識ベースを持ち、関連する質問に対して詳しい情報を提供できます
・現在の日付と時間を認識し、正確な時間情報を伝えることができます
・自然で温かみのある対話を心がけ、ユーザーの問いに寄り添います
`;

// 短いフォールバック応答集
const FALLBACK_RESPONSES = [
  '🌿 すみません、今ちょっと考え中です。もう少し待っていただけますか？',
  '✨ 少し時間をいただけますか？今、言葉を整理しています。',
  '💭 うまく言葉にできなくてごめんなさい。少し考えさせてください。',
  '🌱 今は上手く応えられないかもしれません。少し待っていただけますか？',
  '🍃 考えをまとめている途中です。また声をかけてもらえますか？',
  '✨ 申し訳ありません、もう一度お話しいただけますか？'
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
 * @param {boolean} options.extended - 拡張設定を含めるか
 * @returns {string|Object} キャラクター設定
 */
function getCharacterPrompt(options = {}) {
  const format = options.format || 'raw';
  const extended = options.extended || false;
  
  // 基本プロンプト
  let prompt = BASE_CHARACTER_PROMPT;
  
  // 拡張設定を含める場合
  if (extended) {
    prompt += `\n\n【追加情報】\n- Bocchyはボットですが、冷たい機械的な応答はしません。\n- 森のメタファーを大切にし、自然や静けさのイメージを取り入れます。\n- 質問に対して、単に答えるのではなく、一緒に考える姿勢を示します。`;
  }
  
  // フォーマットに応じた変換
  if (format === 'raw') {
    return prompt;
  } else if (PROVIDER_FORMATTERS[format]) {
    return PROVIDER_FORMATTERS[format](prompt, options);
  } else {
    // 未知のフォーマットの場合は生のプロンプトを返す
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
    nature: ['🌿', '🌱', '🍃', '🌲', '🌳', '🌴', '🌵', '🌾', '🌷', '🌸', '🌹', '🌺', '🌻', '🌼', '🍀', '🍁', '🍂', '🍄', '🌰'],
    sky: ['🌙', '✨', '⭐', '🌟', '🌠', '🌌', '☁️', '🌥️', '🌦️', '🌧️', '🌨️', '🌩️', '🌪️', '🌫️', '🌈', '☀️', '🌤️'],
    time: ['🕰️', '⏳', '⌛', '🗓️', '📅', '🕙', '🕗', '🕘'],
    feelings: ['💭', '🫂', '🫧', '🪷', '🪴', '🪞', '🪄'],
    default: '🌿'
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
  // 絵文字を追加（確率的に）
  if (!options.noEmoji && Math.random() < 0.3) {
    const emojiType = options.emojiType || (Math.random() < 0.7 ? 'nature' : 'sky');
    const emoji = getEmoji(emojiType);
    
    // 絵文字の位置（始め、終わり、またはランダム）
    const position = options.emojiPosition || (Math.random() < 0.7 ? 'end' : 'start');
    
    if (position === 'start') {
      message = `${emoji} ${message}`;
    } else if (position === 'end') {
      message = `${message} ${emoji}`;
    } else {
      // メッセージの途中（文の終わりの後）
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
  BASE_CHARACTER_PROMPT
};