/**
 * 検索ハンドラー - Brave Searchを使用したウェブ検索機能
 * 
 * @module handlers/search-handler
 */

const braveSearch = require('../core/search/brave-search');
const logger = require('../system/logger');
const config = require('../config/env');

// 検索トリガーフレーズ - より自然な表現を含める
const SEARCH_TRIGGERS = {
  // 日本語
  ja: [
    // 直接的なトリガー
    '検索', 'けんさく', 'さがして', '調べて', 'しらべて', 
    'ググって', 'ぐぐって', '教えて', 'おしえて',
    // 丁寧な依頼フレーズ
    '検索して', 'さがしてください', '調べてください', '検索してくれる', 
    '調べてくれる', 'おしえてくれる', '教えてくれる', '検索してほしい',
    // 質問形式
    'について教えて', 'とは何', 'って何', 'を知りたい', 'を調べて', 
    'について知りたい', 'について調べて', 'についておしえて'
  ],
  // 英語
  en: [
    // 直接的なトリガー
    'search', 'find', 'look up', 'lookup', 'google', 
    'tell me about', 'what is', 'what are',
    // 丁寧な依頼フレーズ
    'can you search', 'please search', 'could you look up',
    'can you find', 'please tell me about', 'search for',
    // 質問形式
    'do you know what', 'do you know about', 'can you tell me about',
    'i want to know about', 'i need information on', 'how can I find'
  ]
};

// ローカル検索（場所）のトリガーフレーズ - より多くの位置表現を含む
const LOCAL_SEARCH_TRIGGERS = {
  ja: [
    // 位置表現
    '近く', '周辺', '付近', '場所', 'どこ', 'どこで', 'どこに', 'どの辺',
    // 施設
    'お店', '店', 'レストラン', 'カフェ', 'コンビニ', '病院', '駅', '銀行',
    '薬局', 'スーパー', '美容院', '映画館', 'ホテル', '旅館',
    // 位置検索フレーズ
    'まで何分', 'までの距離', 'の行き方', 'への道', 'の場所', 'はどこ',
    '地図で見せて', '地図で表示'
  ],
  en: [
    // 位置表現
    'near', 'nearby', 'around', 'location', 'where', 'where is', 'close to',
    // 施設
    'store', 'shop', 'restaurant', 'cafe', 'hospital', 'station', 'bank',
    'pharmacy', 'supermarket', 'hotel', 'theater', 'cinema',
    // 位置検索フレーズ
    'how to get to', 'directions to', 'map of', 'distance to', 'find on map',
    'show me on map', 'address of', 'located at'
  ]
};

/**
 * 検索が有効かどうかをチェックする
 * @returns {boolean} 検索が有効な場合はtrue
 */
function isSearchEnabled() {
  // 常に有効化する - フォールバックAPIキーが設定されているため
  // config.SEARCH_ENABLEDをチェックするが、通常はtrueになっている
  const enabled = config.SEARCH_ENABLED === true;
  
  // 詳細なデバッグログ
  if (config.DEBUG) {
    const apiKeyStatus = Boolean(process.env.BRAVE_API_KEY || 
                                process.env.BRAVE_SEARCH_API_KEY || 
                                config.BRAVE_API_KEY);
    logger.debug(`検索機能有効確認: ${enabled ? '有効' : '無効'}, APIキー設定有無: ${apiKeyStatus}`);
    
    // APIキーのソースを診断
    const keySource = process.env.BRAVE_API_KEY ? 'process.env.BRAVE_API_KEY' : 
                     process.env.BRAVE_SEARCH_API_KEY ? 'process.env.BRAVE_SEARCH_API_KEY' : 
                     config.BRAVE_API_KEY ? 'config.BRAVE_API_KEY' : 'なし';
    logger.debug(`検索APIキーソース: ${keySource}`);
  }
  
  return enabled;
}

/**
 * メッセージから検索トリガーを検出する
 * @param {string} content メッセージの内容
 * @returns {Object|null} 検出された場合は {trigger, query} 形式のオブジェクト、検出されなかった場合はnull
 */
function detectSearchTrigger(content) {
  // 基本的な検証
  if (!content || typeof content !== 'string') {
    if (config.DEBUG) {
      logger.debug(`検索トリガー検出: 無効なコンテンツ "${content}"`);
    }
    return null;
  }
  
  // 検索機能が有効かチェック - isSearchEnabled関数を使用
  if (!isSearchEnabled()) {
    if (config.DEBUG) {
      logger.debug('検索機能が無効です - isSearchEnabled()がfalseを返しました');
    }
    return null;
  }
  
  const contentLower = content.toLowerCase();
  
  // 明示的な検索コマンドをまず確認（例: !search）
  if (contentLower.startsWith(`${config.PREFIX}search`)) {
    const searchQuery = content.substring((config.PREFIX + 'search').length).trim();
    if (searchQuery) {
      if (config.DEBUG) {
        logger.debug(`検索コマンド検出: "${searchQuery}"`);
      }
      return { trigger: 'search', query: searchQuery };
    }
  }
  
  // 否定表現を含むメッセージは除外
  const negativePatterns = [
    'しなくて', 'してない', 'しないで', 'やめて', 'いらない',
    "don't", "dont", "not", "stop", "can't", "cant", "quit"
  ];
  
  for (const pattern of negativePatterns) {
    if (contentLower.includes(pattern)) {
      if (config.DEBUG) {
        logger.debug(`否定表現検出のため検索を中止: "${pattern}"`);
      }
      return null;
    }
  }
  
  // 言語別トリガーの検索（改良版）
  const allTriggers = [];
  
  // すべての言語のトリガーをスコア付きで収集
  for (const lang of Object.keys(SEARCH_TRIGGERS)) {
    for (const trigger of SEARCH_TRIGGERS[lang]) {
      if (contentLower.includes(trigger.toLowerCase())) {
        const triggerIndex = contentLower.indexOf(trigger.toLowerCase());
        const afterTrigger = content.substring(triggerIndex + trigger.length).trim();
        
        // クエリが存在し、かつ妥当な長さ（2-100文字）である場合のみ候補に追加
        if (afterTrigger && afterTrigger.length >= 2 && afterTrigger.length <= 100) {
          // トリガーの品質スコアを計算（長いトリガーほど誤検出の可能性が低い）
          const score = trigger.length * 2 + afterTrigger.length;
          
          allTriggers.push({
            trigger,
            query: afterTrigger,
            score,
            index: triggerIndex  // 文中の位置（先頭に近いほど優先）
          });
        }
      }
    }
  }
  
  // 検出結果がない場合
  if (allTriggers.length === 0) {
    return null;
  }
  
  // スコアで並べ替え、最も信頼性の高い検出結果を選択
  allTriggers.sort((a, b) => {
    // 優先度1: スコア（高いほど良い）
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    
    // 優先度2: 文中の出現位置（早いほど良い）
    return a.index - b.index;
  });
  
  // 最も信頼性の高いトリガーを選択
  const bestMatch = allTriggers[0];
  
  if (config.DEBUG) {
    logger.debug(`検索トリガー検出 (Score=${bestMatch.score}): "${bestMatch.trigger}", クエリ="${bestMatch.query}"`);
    if (allTriggers.length > 1) {
      logger.debug(`他の候補: ${allTriggers.length - 1}件（最大スコア: ${allTriggers[0].score}, 最小スコア: ${allTriggers[allTriggers.length - 1].score}）`);
    }
  }
  
  return { 
    trigger: bestMatch.trigger, 
    query: bestMatch.query,
    score: bestMatch.score  // デバッグ用にスコアも返す
  };
}

/**
 * クエリがローカル検索（場所）かどうかを判定する
 * @param {string} query 検索クエリ
 * @returns {boolean} ローカル検索の場合はtrue
 */
function isLocalSearchQuery(query) {
  if (!query || typeof query !== 'string') {
    return false;
  }
  
  const queryLower = query.toLowerCase();
  
  // 全ての言語のローカル検索トリガーをチェック
  for (const lang of Object.keys(LOCAL_SEARCH_TRIGGERS)) {
    for (const trigger of LOCAL_SEARCH_TRIGGERS[lang]) {
      if (queryLower.includes(trigger)) {
        if (config.DEBUG) {
          logger.debug(`ローカル検索トリガー検出: "${trigger}"`);
        }
        return true;
      }
    }
  }
  
  return false;
}

/**
 * メッセージを処理して検索を実行する
 * @param {Object} message Discordメッセージオブジェクト
 * @returns {Promise<Object|null>} 検索結果またはnull
 */
async function processMessage(message) {
  if (!message || !message.content) {
    return null;
  }
  
  // メッセージから検索トリガーを検出
  const triggerInfo = detectSearchTrigger(message.content);
  
  if (!triggerInfo) {
    return null; // 検索トリガーが見つからない場合
  }
  
  // 検索クライアントが設定されているか確認
  if (!braveSearch.isReady()) {
    logger.warn('Search was triggered but Brave Search API is not configured.');
    return {
      success: false,
      error: 'Brave Search API is not configured',
      results: []
    };
  }
  
  try {
    // 検索タイプを判定（ローカル検索か通常検索か）
    const isLocal = isLocalSearchQuery(triggerInfo.query);
    
    // タイピング表示を送信（長い検索の場合）
    if (message.channel && typeof message.channel.sendTyping === 'function') {
      await message.channel.sendTyping();
    }
    
    // 検索を実行
    let searchResult;
    
    if (isLocal) {
      if (config.DEBUG) {
        logger.debug(`ローカル検索を実行: "${triggerInfo.query}"`);
      }
      searchResult = await braveSearch.localSearch(triggerInfo.query);
    } else {
      if (config.DEBUG) {
        logger.debug(`ウェブ検索を実行: "${triggerInfo.query}"`);
      }
      searchResult = await braveSearch.search(triggerInfo.query);
    }
    
    return searchResult;
  } catch (error) {
    logger.error(`検索処理エラー: ${error.message}`);
    
    return {
      success: false,
      query: triggerInfo.query,
      error: error.message,
      results: []
    };
  }
}

/**
 * 検索結果をメッセージとして送信する
 * @param {Object} message 元のDiscordメッセージ
 * @param {Object} searchResult 検索結果
 * @returns {Promise<boolean>} 送信成功の場合はtrue
 */
async function sendSearchResult(message, searchResult) {
  if (!message || !message.channel) {
    return false;
  }
  
  try {
    // 検索結果をテキスト形式に変換
    const resultText = braveSearch.formatSearchResultText(searchResult);
    
    // 結果をDiscordに送信
    if (resultText) {
      await message.reply(resultText);
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error(`検索結果送信エラー: ${error.message}`);
    
    // エラー時にシンプルなメッセージを送信
    try {
      await message.reply('検索中にエラーが発生しました。後でもう一度お試しください。');
    } catch (replyError) {
      logger.error(`エラーメッセージ送信失敗: ${replyError.message}`);
    }
    
    return false;
  }
}

/**
 * メッセージが検索トリガーを含むかチェックし、検索を実行する
 * @param {Object} message Discordのメッセージオブジェクト
 * @returns {Promise<boolean>} 検索が実行された場合はtrue
 */
async function handleSearchIfTriggered(message) {
  // 基本的な検証
  if (!message || !message.content) {
    if (config.DEBUG) {
      logger.debug('検索ハンドラー: 無効なメッセージオブジェクト');
    }
    return false;
  }
  
  // 検索機能が無効な場合は早期リターン
  if (!isSearchEnabled()) {
    if (config.DEBUG) {
      logger.debug('検索機能は無効です');
    }
    return false;
  }
  
  // 基本的なデバッグ情報
  if (config.DEBUG) {
    logger.debug(`検索ハンドラー: メッセージを処理 "${message.content.substring(0, 30)}..."`);
  }
  
  try {
    // 検索を処理
    const searchResult = await processMessage(message);
    
    // 検索結果がない場合
    if (!searchResult) {
      if (config.DEBUG) {
        logger.debug('検索トリガー検出なし、またはクエリが処理されなかった');
      }
      return false;
    }
    
    // 検索結果の簡易ログ
    if (config.DEBUG) {
      logger.debug(`検索結果: ${searchResult.success ? '成功' : '失敗'}, ${searchResult.results?.length || 0}件`);
    }
    
    // 検索結果を送信して結果を返す
    return await sendSearchResult(message, searchResult);
  } catch (error) {
    logger.error(`検索ハンドラーエラー: ${error.message}`);
    return false;
  }
}

// エクスポート
module.exports = {
  detectSearchTrigger,
  isLocalSearchQuery,
  processMessage,
  sendSearchResult,
  handleSearchIfTriggered
};