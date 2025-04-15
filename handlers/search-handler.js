/**
 * 検索ハンドラー - Brave Searchを使用したウェブ検索機能
 * 
 * @module handlers/search-handler
 */

const braveSearch = require('../core/search/brave-search');
const logger = require('../system/logger');
const config = require('../config/env');

// 検索トリガーフレーズ
const SEARCH_TRIGGERS = {
  // 日本語
  ja: [
    '検索', 'けんさく', 'さがして', '調べて', 'しらべて', 
    'ググって', 'ぐぐって', '教えて', 'おしえて'
  ],
  // 英語
  en: [
    'search', 'find', 'look up', 'lookup', 'google', 
    'tell me about', 'what is', 'what are'
  ]
};

// ローカル検索（場所）のトリガーフレーズ
const LOCAL_SEARCH_TRIGGERS = {
  ja: ['近く', '周辺', '付近', '場所', 'どこ', 'どこで', 'お店', '店', 'レストラン', 'カフェ', 'コンビニ'],
  en: ['near', 'nearby', 'around', 'location', 'where', 'where is', 'store', 'shop', 'restaurant', 'cafe']
};

/**
 * メッセージから検索トリガーを検出する
 * @param {string} content メッセージの内容
 * @returns {Object|null} 検出された場合は {trigger, query} 形式のオブジェクト、検出されなかった場合はnull
 */
function detectSearchTrigger(content) {
  if (!content || typeof content !== 'string') {
    if (config.DEBUG) {
      logger.debug(`検索トリガー検出: 無効なコンテンツ "${content}"`);
    }
    return null;
  }
  
  // 検索機能が有効かチェック
  if (!config.SEARCH_ENABLED && config.DEBUG) {
    logger.debug('検索機能が無効です（BRAVE_API_KEYが設定されていません）');
  }
  
  const contentLower = content.toLowerCase();
  let detectedTrigger = null;
  let query = null;
  
  if (config.DEBUG) {
    logger.debug(`検索トリガー検出開始: "${contentLower.substring(0, 30)}..."`);
    
    // 利用可能なトリガーをログに出力（デバッグ用）
    const allTriggers = {};
    for (const lang of Object.keys(SEARCH_TRIGGERS)) {
      allTriggers[lang] = SEARCH_TRIGGERS[lang];
    }
    logger.debug(`利用可能な検索トリガー: ${JSON.stringify(allTriggers)}`);
  }
  
  // 明示的な検索コマンドをまず確認（例: !search）
  if (contentLower.startsWith(`${config.PREFIX}search`)) {
    const searchQuery = content.substring((config.PREFIX + 'search').length).trim();
    if (searchQuery) {
      if (config.DEBUG) {
        logger.debug(`明示的な検索コマンド検出: クエリ "${searchQuery}"`);
      }
      return { trigger: 'search', query: searchQuery };
    }
  }
  
  // 全ての言語のトリガーをチェック
  for (const lang of Object.keys(SEARCH_TRIGGERS)) {
    // その言語の全トリガーをチェック
    for (const trigger of SEARCH_TRIGGERS[lang]) {
      // "検索 クエリ" または "検索：クエリ" または "検索:クエリ" パターンを検出
      const patterns = [
        new RegExp(`${trigger}[\\s:：]+(.*?)(?=$|\\n)`, 'i'),
        new RegExp(`${trigger}(.*?)(?=$|\\n)`, 'i') // スペースなしのケースもカバー
      ];
      
      for (const pattern of patterns) {
        const match = contentLower.match(pattern);
        if (match && match[1] && match[1].trim()) {
          detectedTrigger = trigger;
          query = match[1].trim();
          
          if (config.DEBUG) {
            logger.debug(`検索トリガー検出成功: 言語=${lang}, トリガー="${trigger}", パターン="${pattern}", クエリ="${query}"`);
          }
          
          return { trigger: detectedTrigger, query: query };
        } else if (config.DEBUG && match) {
          // 部分的なマッチがあった場合のデバッグ情報
          logger.debug(`検索トリガー部分マッチ: "${trigger}", マッチ結果=${JSON.stringify(match)}`);
        }
      }
    }
  }
  
  if (config.DEBUG) {
    logger.debug(`検索トリガー検出: トリガーなし (content="${contentLower.substring(0, 30)}...")`);
  }
  
  return null;
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
  if (!message || !message.content) {
    if (config.DEBUG) {
      logger.debug('検索ハンドラー: 無効なメッセージオブジェクト');
    }
    return false;
  }
  
  // 検索機能が無効な場合は早期リターン
  if (!config.BRAVE_API_KEY && !braveSearch.isReady()) {
    if (config.DEBUG) {
      logger.debug('検索ハンドラー: Brave Search APIが設定されていないため、検索機能は無効');
    }
    return false;
  }
  
  if (config.DEBUG) {
    logger.debug(`検索ハンドラー: メッセージを処理 "${message.content.substring(0, 30)}..."`);
  }
  
  try {
    // 検索を処理
    const searchResult = await processMessage(message);
    
    if (!searchResult) {
      if (config.DEBUG) {
        logger.debug('検索ハンドラー: 検索トリガーなし、またはクエリが処理されなかった');
      }
      return false; // 検索が実行されなかった場合
    }
    
    if (config.DEBUG) {
      logger.debug(`検索ハンドラー: 検索結果取得 (success=${searchResult.success}, results=${searchResult.results?.length || 0}件)`);
      
      if (!searchResult.success) {
        logger.debug(`検索エラー: ${searchResult.error || 'unknown error'}`);
      }
    }
    
    // 検索結果を送信
    const sent = await sendSearchResult(message, searchResult);
    
    if (config.DEBUG) {
      logger.debug(`検索結果送信: ${sent ? '成功' : '失敗'}`);
    }
    
    return sent;
  } catch (error) {
    logger.error(`検索ハンドラーエラー: ${error.message}`);
    if (config.DEBUG) {
      logger.debug(`検索ハンドラー詳細エラー: ${error.stack || 'スタック情報なし'}`);
    }
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