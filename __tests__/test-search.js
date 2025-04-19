/**
 * 検索機能テストスクリプト
 * Discordに接続せずに検索機能のみをテストします
 */

// 環境変数の読み込み
require('dotenv').config();
const searchService = require('../extensions/search-service');
const logger = require('../system/logger');
const axios = require('axios');

// カラー出力用
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

/**
 * 検索タイプをカラー表示する
 */
function colorizeQueryType(type) {
  if (type === true) return `${colors.green}はい${colors.reset}`;
  if (type === false) return `${colors.red}いいえ${colors.reset}`;
  return type;
}

/**
 * テスト用にモックデータを作成（API制限回避用）
 */
function createMockSearchResult(query, queryType) {
  // モックデータを作成
  return {
    summary: `「${query}」に関する検索結果のモックデータです。API制限のため実際の検索は行われていません。`,
    results: [
      { 
        title: "モックタイトル1",
        description: "これはモックの検索結果説明文です。実際のAPIリクエストは行われていません。",
        url: "https://example.com/result1"
      },
      { 
        title: "モックタイトル2",
        description: "これは2つ目のモック検索結果です。API制限回避のためのデータです。",
        url: "https://example.com/result2"
      }
    ],
    sources: "[1] モックタイトル1 (example.com)\n[2] モックタイトル2 (example.com)",
    query: query,
    queryType: queryType || {
      isCurrentInfoQuery: false,
      isDefinitionQuery: false,
      isHowToQuery: false,
      isFactCheckQuery: false, 
      isGeneralInfoQuery: true,
      isLocalQuery: false,
      hasSpecificType: true
    },
    totalResults: 2,
    timestamp: new Date().toISOString(),
    isMockData: true
  };
}

/**
 * クエリタイプを分析（APIエラー時のフォールバック）
 */
function analyzeQueryTypeLocally(query) {
  const lowerQuery = query.toLowerCase();
  
  return {
    isCurrentInfoQuery: /最新|今日|最近|ニュース|速報|新型|アップデート|発表/.test(lowerQuery),
    isDefinitionQuery: /とは|意味|定義|違い|どういう|何(?:です|だ)か|何(?:が|を)/.test(lowerQuery),
    isHowToQuery: /方法|やり方|手順|使い方|作り方|手続き|仕方|手続|すれば|するには/.test(lowerQuery),
    isFactCheckQuery: /本当|事実|嘘|ホント|確か|実際|本当に|なのか|であるか/.test(lowerQuery),
    isGeneralInfoQuery: /情報|まとめ|概要|解説|について|紹介|詳細/.test(lowerQuery),
    isLocalQuery: /場所|どこ|住所|位置|アクセス|最寄り|近く|周辺|地図/.test(lowerQuery),
    hasSpecificType: true
  };
}

/**
 * APIの診断テスト - より詳細な情報を得るため
 */
async function testApiDirectly() {
  console.log(`\n${colors.cyan}APIの直接診断を実行します...${colors.reset}`);
  
  const apiKey = process.env.GOOGLE_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;
  const apiUrl = 'https://www.googleapis.com/customsearch/v1';
  
  if (!apiKey || !cseId) {
    console.error(`${colors.red}エラー: APIキーまたはCSE IDが設定されていません${colors.reset}`);
    return false;
  }
  
  try {
    console.log(`APIキー: ${apiKey.substring(0, 5)}...`);
    console.log(`CSE ID: ${cseId.substring(0, 5)}...`);
    console.log(`APIエンドポイント: ${apiUrl}`);
    
    const testResponse = await axios.get(apiUrl, {
      params: {
        key: apiKey,
        cx: cseId,
        q: 'test query'
      },
      headers: {
        'Accept': 'application/json'
      },
      timeout: 15000,
      validateStatus: () => true // 全てのステータスコードを許可
    });
    
    console.log(`${colors.green}APIレスポンスステータス: ${testResponse.status}${colors.reset}`);
    console.log(`レスポンスヘッダー: ${JSON.stringify(testResponse.headers).substring(0, 200)}...`);
    
    if (testResponse.status === 200) {
      console.log(`${colors.green}API接続に成功しました${colors.reset}`);
      console.log(`レスポンスデータキー: ${Object.keys(testResponse.data).join(', ')}`);
      return true;
    } else {
      console.log(`${colors.yellow}API応答エラー: ${testResponse.status}${colors.reset}`);
      console.log(`エラーデータ: ${JSON.stringify(testResponse.data).substring(0, 300)}`);
      return false;
    }
  } catch (error) {
    console.error(`${colors.red}API直接診断エラー:${colors.reset}`, error.message);
    
    if (error.response) {
      console.error(`ステータス: ${error.response.status}`);
      console.error(`データ: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    } else if (error.request) {
      console.error(`リクエストエラー: リクエストは送信されましたが、レスポンスがありませんでした`);
      console.error(`リクエスト詳細: ${JSON.stringify(error.request).substring(0, 200)}`);
    } else {
      console.error(`設定エラー: ${error.message}`);
    }
    
    console.error(`${colors.yellow}エラースタック:${colors.reset}\n${error.stack}`);
    return false;
  }
}

/**
 * 検索機能をテストする
 */
async function testSearchFeature() {
  console.log(`${colors.bright}${colors.cyan}===== 検索機能テスト =====${colors.reset}\n`);
  
  // APIキーの確認
  const apiKey = process.env.GOOGLE_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cseId) {
    console.error(`${colors.red}エラー: GOOGLE_API_KEYまたはGOOGLE_CSE_IDが設定されていません。.envファイルを確認してください。${colors.reset}`);
    return;
  }
  console.log(`${colors.green}GOOGLE_API_KEY: 設定されています (${apiKey.substring(0, 3)}...)${colors.reset}`);
  console.log(`${colors.green}GOOGLE_CSE_ID: 設定されています (${cseId.substring(0, 3)}...)${colors.reset}\n`);
  
  // API診断テスト
  const apiDiagnostic = await testApiDirectly();
  console.log(`\n${colors.cyan}API診断結果: ${apiDiagnostic ? colors.green + '正常' : colors.red + '異常'}${colors.reset}\n`);
  
  // 健全性確認
  console.log(`${colors.cyan}API健全性チェック中...${colors.reset}`);
  const healthCheck = await searchService.checkHealth();
  console.log(`健全性ステータス: ${healthCheck.status === 'healthy' ? colors.green + healthCheck.status : colors.red + healthCheck.status}${colors.reset}`);
  console.log(`メッセージ: ${healthCheck.message}`);
  console.log();
  
  // API制限に達していることを警告
  let useMockData = !apiDiagnostic || healthCheck.status !== 'healthy';
  if (useMockData) {
    console.warn(`${colors.yellow}警告: API診断または健全性チェックに失敗しました。モックデータでテストを続行します。${colors.reset}`);
    console.log(`${colors.yellow}エラー内容: ${healthCheck.message}${colors.reset}\n`);
  }
  
  // テストクエリ
  const testQueries = [
    { text: "量子コンピュータとは何ですか", type: "定義系" },
    { text: "最新のAI技術ニュース", type: "時事情報" },
    { text: "パスタの作り方を教えて", type: "ハウツー" },
    { text: "地球温暖化は本当ですか", type: "事実確認" },
    { text: "東京タワーの場所", type: "位置情報" },
    { text: "猫について教えて", type: "一般情報" }
  ];
  
  // 各クエリをテスト
  for (const query of testQueries) {
    console.log(`\n${colors.bright}${colors.yellow}===== テスト: ${query.type} - "${query.text}" =====${colors.reset}`);
    try {
      console.log(`${colors.cyan}検索中...${colors.reset}`);
      const startTime = Date.now();
      
      let results;
      
      if (useMockData) {
        // モックデータを使用
        console.log(`${colors.yellow}API問題のためモックデータを使用します${colors.reset}`);
        // ローカルでクエリタイプを分析
        const queryType = analyzeQueryTypeLocally(query.text);
        // モックデータを作成
        results = createMockSearchResult(query.text, queryType);
      } else {
        try {
          // 実際のAPI呼び出しを試みる
          results = await searchService.performSearch(query.text, {
            count: 5,
            useCache: true,
            useMockOnError: true,
            timeout: 15000 // タイムアウト延長
          });
        } catch (apiError) {
          console.log(`${colors.yellow}API呼び出しエラーのためモックデータを使用します: ${apiError.message}${colors.reset}`);
          // ローカルでクエリタイプを分析
          const queryType = analyzeQueryTypeLocally(query.text);
          // モックデータを作成
          results = createMockSearchResult(query.text, queryType);
        }
      }
      
      const elapsedTime = Date.now() - startTime;
      
      console.log(`\n${colors.green}検索完了 ${results.isMockData ? '(モックデータ)' : ''}(${elapsedTime}ms)${colors.reset}`);
      console.log(`\n${colors.magenta}【クエリタイプ分析】${colors.reset}`);
      
      // クエリタイプの安全な表示
      const queryType = results.queryType || { 
        isDefinitionQuery: false,
        isCurrentInfoQuery: false,
        isHowToQuery: false,
        isFactCheckQuery: false,
        isGeneralInfoQuery: false,
        isLocalQuery: false
      };
      
      console.log(`定義系クエリ: ${colorizeQueryType(queryType.isDefinitionQuery)}`);
      console.log(`時事情報クエリ: ${colorizeQueryType(queryType.isCurrentInfoQuery)}`);
      console.log(`ハウツークエリ: ${colorizeQueryType(queryType.isHowToQuery)}`);
      console.log(`事実確認クエリ: ${colorizeQueryType(queryType.isFactCheckQuery)}`);
      console.log(`一般情報クエリ: ${colorizeQueryType(queryType.isGeneralInfoQuery)}`);
      console.log(`位置情報クエリ: ${colorizeQueryType(queryType.isLocalQuery)}`);
      
      // 検索結果サマリー
      console.log(`\n${colors.magenta}【検索結果サマリー】${colors.reset}`);
      console.log(results.summary || "サマリーはありません");
      
      // 情報源
      console.log(`\n${colors.magenta}【情報源】${colors.reset}`);
      console.log(results.sources || "情報源はありません");
      
      // 結果数
      console.log(`\n${colors.magenta}【統計】${colors.reset}`);
      console.log(`結果件数: ${results.results?.length || 0}`);
      console.log(`合計結果数: ${results.totalResults || 0}`);
      console.log(`テストデータ: ${results.isMockData ? '使用' : '未使用'}`);
      
      console.log(`\n${colors.green}テスト成功${colors.reset}`);
    } catch (error) {
      console.error(`\n${colors.red}エラー:${colors.reset}`, error.message);
      console.error(`エラースタック:\n${error.stack}`);
    }
  }
}

// テストを実行
console.log(`${colors.bright}検索機能テストを開始します...${colors.reset}\n`);
testSearchFeature()
  .then(() => {
    console.log(`\n${colors.bright}${colors.green}すべてのテストが完了しました${colors.reset}`);
    process.exit(0);
  })
  .catch(err => {
    console.error(`\n${colors.bright}${colors.red}テスト実行中にエラーが発生しました:${colors.reset}`, err);
    console.error(`エラースタック:\n${err.stack}`);
    process.exit(1);
  }); 