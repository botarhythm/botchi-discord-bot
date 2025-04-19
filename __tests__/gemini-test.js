// Gemini API接続テストユーティリティ
require('dotenv').config();

const geminiService = require('../services/ai/gemini-service');

// テスト用コンソール出力ユーティリティ
function logSection(title) {
  console.log('\n' + '='.repeat(50));
  console.log(`  ${title}`);
  console.log('='.repeat(50));
}

// 設定情報の表示
async function showConfiguration() {
  logSection('Gemini API設定情報');
  
  const config = geminiService.getConfig();
  console.log('API設定状態:', geminiService.isConfigured() ? '設定済み' : '未設定');
  console.log('APIエンドポイント:', config.endpoint);
  console.log('キャッシュ有効期間:', config.cacheExpiry / 1000 / 60, '分');
  console.log('最大リトライ回数:', config.maxRetries);
  console.log('リクエストタイムアウト:', config.requestTimeout / 1000, '秒');
  
  // APIキー部分的マスキング
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const maskedKey = apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4);
    console.log('APIキー:', maskedKey);
  } else {
    console.log('APIキー: 設定されていません');
  }
}

// ヘルスチェック
async function performHealthCheck() {
  logSection('API健全性チェック');
  
  try {
    const healthStatus = await geminiService.checkHealth();
    console.log('健全性状態:', healthStatus.status);
    console.log('最終チェック:', new Date(healthStatus.lastCheck).toLocaleString());
    console.log('連続失敗回数:', healthStatus.consecutiveFailures);
    
    if (healthStatus.status === 'unhealthy') {
      console.error('警告: APIが応答していないか、エラーが発生しています');
      if (healthStatus.error) {
        console.error('エラー詳細:', healthStatus.error);
      }
    }
  } catch (error) {
    console.error('健全性チェック実行中にエラーが発生しました:', error);
  }
}

// シンプルなメッセージテスト
async function testSimpleMessage() {
  logSection('シンプルなメッセージテスト');
  
  const testUserId = 'test-user-' + Date.now();
  const testMessage = 'こんにちは、元気ですか？';
  
  try {
    console.log('テストメッセージ送信中:', testMessage);
    console.time('応答時間');
    
    const response = await geminiService.getAIResponse(
      testUserId,
      testMessage,
      'テストユーザー',
      false
    );
    
    console.timeEnd('応答時間');
    console.log('応答結果:');
    console.log(response);
  } catch (error) {
    console.error('テスト中にエラーが発生しました:', error);
  }
}

// 複数回の会話テスト
async function testConversation() {
  logSection('会話テスト');
  
  const testUserId = 'conversation-test-' + Date.now();
  const messages = [
    'こんにちは、自己紹介してください',
    'あなたの得意なことは何ですか？',
    '日本の歴史について教えてください'
  ];
  
  try {
    for (let i = 0; i < messages.length; i++) {
      console.log(`\n[テストメッセージ ${i+1}/${messages.length}]: ${messages[i]}`);
      console.time(`メッセージ${i+1}応答時間`);
      
      const response = await geminiService.getAIResponse(
        testUserId,
        messages[i],
        'テストユーザー',
        false
      );
      
      console.timeEnd(`メッセージ${i+1}応答時間`);
      console.log('応答:');
      console.log(response.substring(0, 150) + (response.length > 150 ? '...' : ''));
    }
  } catch (error) {
    console.error('会話テスト中にエラーが発生しました:', error);
  }
}

// エラー処理テスト
async function testErrorHandling() {
  logSection('エラー処理テスト');
  
  // テスト用に一時的に無効なAPIキーを設定
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'invalid_key';
  
  try {
    console.log('無効なAPIキーでテスト中...');
    const response = await geminiService.getAIResponse(
      'error-test-user',
      'このメッセージはエラーになるはずです',
      'テストユーザー',
      false
    );
    
    console.log('応答結果:');
    console.log(response);
  } catch (error) {
    console.error('予期しないエラーが発生しました:', error);
  } finally {
    // 元のAPIキーを復元
    process.env.GEMINI_API_KEY = originalKey;
  }
}

// メイン実行関数
async function runTests() {
  try {
    logSection('Gemini API接続テスト');
    
    await showConfiguration();
    await performHealthCheck();
    
    if (geminiService.isConfigured()) {
      await testSimpleMessage();
      await testConversation();
      await testErrorHandling();
    } else {
      console.error('\n⚠️ APIキーが設定されていないため、テストをスキップします');
      console.log('GEMINI_API_KEYを.envファイルに設定するか、環境変数として設定してください');
    }
    
    logSection('テスト完了');
  } catch (error) {
    console.error('テスト実行中にエラーが発生しました:', error);
  }
}

// テスト実行
runTests();
