/**
 * 検索ハンドラー - Brave Searchを使用したウェブ検索機能
 * 
 * @module handlers/search-handler
 */

const braveSearch = require('../core/search/brave-search');
const logger = require('../system/logger');
const config = require('../config/env');

// 検索トリガーフレーズ - 明示的な検索意図のあるトリガーと情報要求トリガーを含む
const SEARCH_TRIGGERS = {
  // 日本語
  ja: [
    // 直接的な検索トリガー - 明確に検索を指示するフレーズ
    '検索して', 'けんさくして', 'さがして', 'しらべて', 
    'ネットで調べて', 'インターネットで検索', 'ウェブで検索',
    'オンラインで調べて', 'インターネットで確認',
    // 丁寧な依頼フレーズ - 明確な検索指示
    '検索してください', 'さがしてください', '調べてください', 
    '検索してくれる', '調べてくれる', '検索してほしい',
    '調べてくれますか', '検索してくれますか', '検索をお願い',
    // 検索に関連する明示的なフレーズ
    'について検索', 'を調べて', 'の情報を探して', 
    'について調べて', 'を検索して', 'の情報を教えて',
    // 時事性の高い情報を求めるフレーズ
    '最新の', '最近の', '今日の', '今週の', '今月の',
    '最新情報', '最新ニュース', '新しい情報', '現在の状況',
    '最新動向', '最新トレンド', '最新アップデート',
    // 情報要求を示す間接的なフレーズ
    'とは何ですか', 'について教えて', 'とはどういう意味',
    'の定義は', 'の仕組みは', 'の使い方', 'の方法',
    'はどうやって', 'ってどんな', 'の特徴は',
    // 事実確認を求めるフレーズ
    'は本当に', 'は実際に', 'は事実ですか',
    'の真相は', 'の事実関係', 'は正しいですか'
  ],
  // 英語
  en: [
    // 直接的な検索トリガー - 明確に検索を指示するフレーズ
    'search for', 'search about', 'search the web for',
    'search online for', 'look up', 'find information about',
    'google', 'browse for', 'check online',
    // 丁寧な依頼フレーズ - 明確な検索指示
    'can you search', 'please search', 'could you look up',
    'can you find', 'would you search for', 'could you search',
    'please look up', 'search the internet for',
    // 検索に関連する明示的なフレーズ
    'search information about', 'find details on',
    'look online for', 'web search for',
    // 時事性の高い情報を求めるフレーズ
    'latest', 'recent', 'today\'s', 'this week\'s', 'this month\'s',
    'current', 'newest', 'up-to-date', 'breaking',
    // 情報要求を示す間接的なフレーズ
    'what is', 'who is', 'how to', 'tell me about',
    'explain', 'definition of', 'meaning of',
    'how does', 'what are', 'where is',
    // 事実確認を求めるフレーズ
    'is it true', 'is it real', 'fact check',
    'verify if', 'confirm if', 'is it correct'
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
  // デフォルトは有効、明示的に無効化されているときのみfalseを返す
  // config.SEARCH_ENABLEDは有効かどうかのブール値
  const enabled = config.SEARCH_ENABLED !== false;
  
  // APIキーが設定されているかどうかも確認
  const apiKeyStatus = Boolean(process.env.BRAVE_API_KEY || 
                              process.env.BRAVE_SEARCH_API_KEY || 
                              config.BRAVE_API_KEY);
                           
  // APIキーが設定されていなければ機能は無効
  const isAvailable = enabled && apiKeyStatus;
  
  // 詳細なデバッグログ
  if (config.DEBUG) {
    logger.debug(`検索機能ステータス: ${isAvailable ? '有効' : '無効'} (機能スイッチ: ${enabled ? 'ON' : 'OFF'}, APIキー: ${apiKeyStatus ? '設定済み' : '未設定'})`);
    
    // APIキーのソースを診断
    const keySource = process.env.BRAVE_API_KEY ? 'process.env.BRAVE_API_KEY' : 
                     process.env.BRAVE_SEARCH_API_KEY ? 'process.env.BRAVE_SEARCH_API_KEY' : 
                     config.BRAVE_API_KEY ? 'config.BRAVE_API_KEY' : 'なし';
    
    // 環境変数の状態も詳細に出力
    logger.debug(`環境変数: BRAVE_SEARCH_ENABLED=${process.env.BRAVE_SEARCH_ENABLED || 'undefined'}, config.BRAVE_SEARCH_ENABLED=${config.BRAVE_SEARCH_ENABLED}`);
    logger.debug(`APIキー状態: ソース=${keySource}, キー長=${config.BRAVE_API_KEY ? config.BRAVE_API_KEY.length : 0}文字`);
    
    // APIキーが設定されていないときの警告
    if (!apiKeyStatus) {
      logger.warn('Brave Search APIキーが設定されていないため、検索機能は使用できません');
    }
  }
  
  return isAvailable;
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
      return { trigger: 'search', query: searchQuery, commandTriggered: true };
    }
  }
  
  // 否定表現を含むメッセージは除外
  const negativePatterns = [
    'しなくて', 'してない', 'しないで', 'やめて', 'いらない',
    'しなくていい', 'する必要ない', '結構です', 'けっこうです',
    "don't", "dont", "not", "stop", "can't", "cant", "quit",
    "no need to", "unnecessary", "won't be necessary"
  ];
  
  for (const pattern of negativePatterns) {
    if (contentLower.includes(pattern)) {
      if (config.DEBUG) {
        logger.debug(`否定表現検出のため検索を中止: "${pattern}"`);
      }
      return null;
    }
  }
  
  // 多様な検索意図とクエリパターンを検出
  const searchPatterns = [
    // 「〜を検索して」パターン - 明確に検索を指示するパターン
    {
      pattern: /(.*?)(を|に関して|について|の|に)(検索|調べて|調査して|サーチして|探して)(下さい|ください|ね|よ|くれる|くれません)?$/,
      extractIndex: 1, // 最初のキャプチャグループ
      isExplicitSearch: true,
      score: 95 // 非常に高いスコア（明示的な検索指示）
    },
    // 「〜の情報を教えて」パターン - 明確な情報要求
    {
      pattern: /(.*?)(の|に関する|についての)(情報|データ|詳細|ニュース|最新情報|状況)(を|が|は|に)(知|調|教|探)(?:りたい|べたい|えて|したい)/,
      extractIndex: 1,
      isExplicitSearch: true,
      score: 90
    },
    // 「〜はどうなっている？」のような質問 - 情報要求だが検索ほど明示的ではない
    {
      pattern: /(.*?)(は|って|の)(最新|現在|今|どう|どうなって|どんな)(状況|情報|ニュース|様子)(?:は|か|ですか|でしょうか|ある|ある？)/,
      extractIndex: 1,
      isExplicitSearch: true,
      score: 85
    },
    // 時間要素を含む明示的な情報要求（今日の〜、明日の〜など）
    {
      pattern: /(今日|明日|昨日|今週|来週|今月|来月)(の|における)(.+?)(を|の|について)(検索|調べて|教えて|探して|知りたい)/,
      extractIndex: 3,
      timePrefix: true,
      timeIndex: 1,
      connectIndex: 2,
      isExplicitSearch: true,
      score: 90
    },
    // 「Xとは何ですか？」形式の定義質問
    {
      pattern: /(.*?)(とは|って)(何|なに|どんなもの|どういうもの)(?:ですか|なの|でしょうか|か)/,
      extractIndex: 1,
      isExplicitSearch: false,
      isDefinitionQuery: true,
      score: 75
    },
    // 「Xの意味は？」形式の意味質問
    {
      pattern: /(.*?)(の|における|にとっての)(意味|定義|使い方|役割|機能|特徴|メリット|デメリット)(は|を|が|について)/,
      extractIndex: 1,
      isExplicitSearch: false,
      isDefinitionQuery: true,
      score: 70
    },
    // 「どうやってXをするの？」形式の方法質問
    {
      pattern: /(どうやって|どうすれば|どのように|どうすると|何をすれば|どうしたら)(.*?)(できる|する|作る|なる|実現|達成|解決|改善)(?:の|か|ですか|でしょうか|？)/,
      extractIndex: 2,
      isExplicitSearch: false,
      isHowToQuery: true,
      score: 75
    },
    // 「XはYですか？」形式の事実確認質問
    {
      pattern: /(.*?)(は|って)(本当|実際|事実|正しい|間違い|嘘|真実|正式)(なの|ですか|か|でしょうか|？)/,
      extractIndex: 1,
      isExplicitSearch: false,
      isFactCheckQuery: true,
      score: 80
    },
    // 「最新のX」形式の時事情報質問
    {
      pattern: /(最新|最近|今日|今年|現在|直近|昨今|最先端|トレンド)(の|における|な|で話題の)(.*?)(?:について|は|を|の|とは)/,
      extractIndex: 3,
      timePrefix: true,
      timeIndex: 1,
      connectIndex: 2,
      isExplicitSearch: false,
      isCurrentInfoQuery: true,
      score: 85
    },
    // 「Xの新しい情報」形式の更新情報質問
    {
      pattern: /(.*?)(の|に関する)(最新|最近の|新しい|最新の|アップデート|更新|リリース|発表|トレンド)(情報|ニュース|状況|トピック|動向)/,
      extractIndex: 1,
      isExplicitSearch: false,
      isCurrentInfoQuery: true,
      score: 80
    },
    // Wikiスタイルの質問「Xとは」形式の百科事典的質問
    {
      pattern: /^(.*?)(とは|って何|について教えて|について|の説明|の情報|の解説)/,
      extractIndex: 1,
      isExplicitSearch: false,
      isWikiStyleQuery: true,
      score: 65
    }
  ];

  // パターンを順に試す
  for (const patternObj of searchPatterns) {
    const match = content.match(patternObj.pattern);
    if (match) {
      // パターンにマッチした場合
      let query = match[patternObj.extractIndex].trim();
      
      // 時間要素がある場合は、それも含める
      if (patternObj.timePrefix && match[patternObj.timeIndex]) {
        const timeElement = match[patternObj.timeIndex];
        const connector = match[patternObj.connectIndex];
        query = `${timeElement}${connector}${query}`;
      }
      
      // クエリが空でなければ検索トリガーとして検出
      if (query) {
        if (config.DEBUG) {
          logger.debug(`パターンマッチによる検索クエリ抽出: "${query}" (パターン: ${patternObj.pattern})`);
          logger.debug(`パターンタイプ: ${Object.keys(patternObj).filter(key => key.startsWith('is')).join(', ')}`);
        }
        
        // 検索クエリの種類に関する情報を格納
        const queryInfo = {
          trigger: match[0], 
          query: query,
          score: patternObj.score || 80,
          pattern: patternObj.pattern.toString().substring(0, 100) + '...',
          matchGroups: match.length
        };
        
        // パターンのタイプフラグを追加
        for (const key of Object.keys(patternObj)) {
          if (key.startsWith('is') && patternObj[key] === true) {
            queryInfo[key] = true;
          }
        }
        
        return queryInfo;
      }
    }
  }
  
  // 言語別トリガーの検索（改良版）
  const allTriggers = [];
  
  // すべての言語のトリガーをスコア付きで収集
  for (const lang of Object.keys(SEARCH_TRIGGERS)) {
    for (const trigger of SEARCH_TRIGGERS[lang]) {
      if (contentLower.includes(trigger.toLowerCase())) {
        const triggerIndex = contentLower.indexOf(trigger.toLowerCase());
        
        // ここが重要な改善ポイント: トリガーの前の部分をクエリとして優先的に抽出
        let queryText = '';
        
        // トリガーが文末に近い場合、トリガーの前にある内容をクエリとみなす
        if (triggerIndex > 0 && triggerIndex > contentLower.length * 0.5) {
          queryText = content.substring(0, triggerIndex).trim();
        } 
        // それ以外の場合は従来通りトリガーの後の部分を使用
        else {
          queryText = content.substring(triggerIndex + trigger.length).trim();
        }
        
        // クエリが存在し、かつ妥当な長さ（2-100文字）である場合のみ候補に追加
        if (queryText && queryText.length >= 2 && queryText.length <= 100) {
          // スコアリングロジックを改良
          // 1. トリガーの長さ - 長いトリガーほど意図的なものである可能性が高い
          const triggerLengthScore = trigger.length * 2;
          
          // 2. クエリの長さ - 適切な長さのクエリは良い傾向がある
          const queryLengthScore = Math.min(queryText.length, 50); // 上限を設定
          
          // 3. 位置補正 - 文末に近いトリガーほど重要（例: 「〜を検索して」）
          const positionScore = triggerIndex > contentLower.length * 0.5 ? 40 : 10;
          
          // 4. 最新情報フレーズボーナス - 「最新」「今日の」などを含む場合は高いスコア
          const recentInfoPatterns = ['最新', '今日', '昨日', '今週', '最近', 'latest', 'recent', 'today', 'news', 'current'];
          const hasRecentInfoPattern = recentInfoPatterns.some(p => trigger.includes(p) || queryText.includes(p));
          const recentInfoBonus = hasRecentInfoPattern ? 30 : 0;
          
          // 5. 明示的な検索フレーズボーナス - 「検索」「調べて」などの明示的な単語を含む場合
          const explicitSearchPatterns = ['検索', '調べ', 'search', 'find', 'look up'];
          const hasExplicitSearchPattern = explicitSearchPatterns.some(p => trigger.includes(p));
          const explicitSearchBonus = hasExplicitSearchPattern ? 60 : 0; // 40から60へ引き上げ
          
          // 合計スコアを計算
          const score = triggerLengthScore + queryLengthScore + positionScore + recentInfoBonus + explicitSearchBonus;
          
          allTriggers.push({
            trigger,
            query: queryText,
            score,
            index: triggerIndex,  // 文中の位置
            hasRecentInfoPattern,
            hasExplicitSearchPattern,
            isPreTrigger: triggerIndex > contentLower.length * 0.5 // トリガーの前をクエリに使ったか
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
    
    // 優先度2: 文中の出現位置（トリガーの前をクエリに使った場合は優先）
    if (a.isPreTrigger !== b.isPreTrigger) {
      return a.isPreTrigger ? -1 : 1;
    }
    
    // 優先度3: トリガーの位置
    return a.index - b.index;
  });
  
  // 最も信頼性の高いトリガーを選択
  const bestMatch = allTriggers[0];
  
  // 最低スコアのしきい値をさらに引き上げ - 明確な検索意図のあるケースのみ検索を実行
  const MINIMUM_SCORE_THRESHOLD = 90; // 70から90に引き上げ
  if (bestMatch.score < MINIMUM_SCORE_THRESHOLD) {
    if (config.DEBUG) {
      logger.debug(`検索トリガースコアが低すぎるため無視: ${bestMatch.score} < ${MINIMUM_SCORE_THRESHOLD} (トリガー: "${bestMatch.trigger}")`);
    }
    return null;
  }
  
  // クエリが短すぎる場合（3文字未満）も検索しない
  if (bestMatch.query.length < 3) {
    if (config.DEBUG) {
      logger.debug(`クエリが短すぎるため検索をスキップ: "${bestMatch.query}" (${bestMatch.query.length}文字)`);
    }
    return null;
  }
  
  if (config.DEBUG) {
    logger.debug(`検索トリガー検出 (Score=${bestMatch.score}): "${bestMatch.trigger}", クエリ="${bestMatch.query}"`);
    logger.debug(`検出詳細: 位置=${bestMatch.index}, 最新情報フレーズ=${bestMatch.hasRecentInfoPattern}, 明示的検索フレーズ=${bestMatch.hasExplicitSearchPattern}, 前置きクエリ=${bestMatch.isPreTrigger}`);
    
    if (allTriggers.length > 1) {
      logger.debug(`他の候補: ${allTriggers.length - 1}件（最大スコア: ${allTriggers[0].score}, 最小スコア: ${allTriggers[allTriggers.length - 1].score}）`);
    }
  }
  
  return { 
    trigger: bestMatch.trigger, 
    query: bestMatch.query,
    score: bestMatch.score,  // デバッグ用にスコアも返す
    isRecentInfoQuery: bestMatch.hasRecentInfoPattern,  // 最新情報クエリかどうか
    isExplicitSearch: bestMatch.hasExplicitSearchPattern  // 明示的な検索リクエストかどうか
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
  
  // 検索クライアントのインスタンスを取得
  let clientInstance;
  try {
    // braveSearch モジュールがクラスコンストラクタや getInstance をエクスポートしているか確認が必要
    // ここでは getInstance が存在すると仮定
    if (typeof braveSearch.getInstance === 'function') {
        clientInstance = braveSearch.getInstance();
    } else if (typeof braveSearch === 'function') { 
        // もし braveSearch が直接クラスなら new でインスタンス化 (要APIキー)
        // このケースはAPIキーの渡し方によるため、一旦保留。getInstance優先。
        // const apiKey = config.get('BRAVE_SEARCH_API_KEY'); 
        // clientInstance = new braveSearch(apiKey);
        logger.warn('braveSearch is likely a class, but getInstance() is preferred. Check brave-search.js export structure.');
        // 仮にモジュール自体がインスタンスの場合 (シングルトンエクスポート)
        if(typeof braveSearch.search === 'function') { // Check if it has search method directly
             clientInstance = braveSearch;
        } else {
             throw new Error('Cannot determine how to get Brave Search client instance.');
        }
    } else if (typeof braveSearch.search === 'function') { 
         // モジュールが直接インスタンスをエクスポートしている場合
         clientInstance = braveSearch;
    } else {
        throw new Error('Cannot determine how to get Brave Search client instance from the imported module.');
    }
    
  } catch (error) {
    logger.error(`Brave Search クライアントの取得に失敗: ${error.message}`);
    return {
      success: false,
      error: `Brave Search client initialization failed: ${error.message}`,
      results: []
    };
  }
  
  // 取得したインスタンスの準備ができているか確認
  if (!clientInstance || typeof clientInstance.isReady !== 'function' || !clientInstance.isReady()) {
    logger.warn('Search was triggered but Brave Search client instance is not ready or configured.');
    // isReadyがない、またはfalseの場合のエラー詳細
    if (!clientInstance) logger.warn('Client instance could not be obtained.');
    else if (typeof clientInstance.isReady !== 'function') logger.warn('clientInstance.isReady is not a function.');
    else logger.warn('clientInstance.isReady() returned false.');
    
    return {
      success: false,
      error: 'Brave Search client is not ready or not configured properly',
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
    
    // 検索を実行 (インスタンスを使用)
    let searchResult;
    if (isLocal) {
      if (config.DEBUG) {
        logger.debug(`ローカル検索を実行: "${triggerInfo.query}"`);
      }
      searchResult = await clientInstance.localSearch(triggerInfo.query); // Use instance
    } else {
      if (config.DEBUG) {
        logger.debug(`ウェブ検索を実行: "${triggerInfo.query}"`);
      }
      searchResult = await clientInstance.search(triggerInfo.query); // Use instance
    }
    
    // 検索結果にクエリ情報を追加 (結果がない場合も考慮)
    searchResult = searchResult || { success: false, results: [], query: triggerInfo.query }; // Ensure searchResult exists
    searchResult.queryInfo = triggerInfo;
    searchResult.query = triggerInfo.query; // Ensure query is set even on failure
    searchResult.queryType = getQueryTypeInfo(triggerInfo);
    
    // デバッグ用のログ出力
    if (config.DEBUG) {
       const queryType = searchResult.queryType || {}; // Ensure queryType exists
       const typeStr = Object.keys(queryType).filter(k => queryType[k]).join(', ') || 'なし';
       logger.debug(`検索クエリタイプ: ${typeStr}`);
    }
    
    return searchResult;
  } catch (error) {
    logger.error(`検索処理エラー: ${error.message}`);
    return {
      success: false,
      query: triggerInfo.query,
      queryInfo: triggerInfo,
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

/**
 * 最後に実行された検索の結果を保持する変数
 * AIレスポンス生成時に検索結果を統合するために使用
 */
let lastSearchResult = null;

/**
 * 最後の検索結果を取得する
 * @returns {Object|null} 最後の検索結果またはnull
 */
function getLastSearchResult() {
  return lastSearchResult;
}

/**
 * 検索結果を保存する
 * @param {Object} result - 保存する検索結果
 */
function setLastSearchResult(result) {
  lastSearchResult = result;
  
  if (config.DEBUG) {
    logger.debug(`検索結果を保存: ${result?.success ? '成功' : '失敗'}, ${result?.results?.length || 0}件`);
  }
}

// processMessage関数を修正して検索結果を保存するようにする
const originalProcessMessage = processMessage;
async function processMessageWithSave(message) {
  const result = await originalProcessMessage(message);
  if (result) {
    setLastSearchResult(result);
  }
  return result;
}

/**
 * クエリ情報から検索タイプの情報を抽出・整理する
 * @param {Object} queryInfo 検索クエリ情報
 * @returns {Object} 検索タイプ情報
 */
function getQueryTypeInfo(queryInfo) {
  if (!queryInfo) return {};
  
  // デフォルトの検索タイプ情報
  const typeInfo = {
    isExplicitSearch: false,       // 明示的な検索要求（「〜を検索して」など）
    isDefinitionQuery: false,      // 定義質問（「〜とは何ですか」など）
    isHowToQuery: false,           // ハウツー質問（「どうやって〜するの」など）
    isFactCheckQuery: false,       // 事実確認質問（「〜は本当ですか」など）
    isCurrentInfoQuery: false,     // 最新情報質問（「最新の〜」など）
    isWikiStyleQuery: false,       // 百科事典的質問（「〜とは」など）
    isGeneralInfoQuery: false,     // 一般的な情報質問（その他の情報要求）
    isLocalQuery: false            // 位置情報質問（「〜の場所」など）
  };
  
  // queryInfoから検索タイプフラグを抽出
  Object.keys(queryInfo).forEach(key => {
    if (key.startsWith('is') && queryInfo[key] === true && typeInfo.hasOwnProperty(key)) {
      typeInfo[key] = true;
    }
  });
  
  // 特殊な検索タイプの検出
  if (queryInfo.isRecentInfoQuery) {
    typeInfo.isCurrentInfoQuery = true;
  }
  
  // ローカル検索かどうかをチェック
  if (queryInfo.query) {
    typeInfo.isLocalQuery = isLocalSearchQuery(queryInfo.query);
  }
  
  // 明示的な検索指定がない場合は一般的な情報質問とみなす
  if (!Object.keys(typeInfo).some(key => key !== 'isLocalQuery' && typeInfo[key])) {
    typeInfo.isGeneralInfoQuery = true;
  }
  
  return typeInfo;
}

/**
 * メッセージの内容から検索が必要かどうかを判断する
 * @param {string} content メッセージの内容
 * @returns {boolean} 検索が必要な場合はtrue
 */
function shouldSearch(content) {
  // 検索機能が無効な場合は常にfalse
  if (!isSearchEnabled()) {
    logger.debug('[shouldSearch] Search is disabled.');
    return false;
  }

  // 検索トリガーを検出
  const triggerInfo = detectSearchTrigger(content);
  
  if (config.DEBUG) {
    logger.debug(`[shouldSearch] Content: "${content}"`);
    logger.debug(`[shouldSearch] detectSearchTrigger result: ${JSON.stringify(triggerInfo)}`);
  }
  
  // トリガーが検出された場合はtrue
  const should = triggerInfo !== null;
  logger.debug(`[shouldSearch] Decision: ${should}`);
  return should;
}

// エクスポート
module.exports = {
  detectSearchTrigger,
  isLocalSearchQuery,
  processMessage: processMessageWithSave, // 拡張された処理に置き換え
  sendSearchResult,
  handleSearchIfTriggered,
  getLastSearchResult, // 新しい関数をエクスポート
  setLastSearchResult, // 新しい関数をエクスポート
  getQueryTypeInfo,     // クエリタイプ情報取得関数
  shouldSearch
};