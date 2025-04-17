/**
 * OpenAI統合テスト
 * 実際のAPIとの連携をテスト
 * 
 * 注意: このテストは実際のAPIキーが必要です。
 * TEST_WITH_REAL_API環境変数が設定されている場合のみ実行されます。
 */

const openaiService = require('../../openai-service');
const { createTestContext, mockEnvironment } = require('../helpers/test-utils');

// APIキーがない場合はテストをスキップ
const shouldRunTests = process.env.TEST_WITH_REAL_API === 'true' && 
                       process.env.OPENAI_API_KEY;

// テスト実行の条件付けと説明
const conditionalTest = shouldRunTests ? describe : describe.skip;

conditionalTest('OpenAI API 統合テスト', () => {
  // 元の環境変数を保存
  let restoreEnv;
  
  beforeAll(() => {
    // 環境変数を設定
    restoreEnv = mockEnvironment({
      OPENAI_MODEL: 'gpt-3.5-turbo',  // 安価なモデルを使用
      OPENAI_MAX_TOKENS: '100',       // トークン数を制限
      DEBUG: 'true'
    });
  });
  
  afterAll(() => {
    // 環境変数を元に戻す
    if (restoreEnv) restoreEnv();
  });
  
  beforeEach(async () => {
    // 各テスト前にサービスを初期化
    await openaiService.initialize();
  });
  
  test('実際のOpenAI APIで応答を取得できる', async () => {
    const response = await openaiService.getResponse(createTestContext({
      message: '簡単な挨拶をしてください',
      userId: 'integration-test-user'
    }));
    
    expect(response).toBeTruthy();
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(10);
  }, 30000); // タイムアウトを30秒に設定
  
  test('APIキーが正しくないとエラーが発生する', async () => {
    // 誤ったAPIキーを設定
    const restoreTemp = mockEnvironment({
      OPENAI_API_KEY: 'invalid-key'
    });
    
    try {
      // サービスを再初期化
      await openaiService.initialize();
      
      // APIリクエストを実行
      const response = await openaiService.getResponse(createTestContext({
        message: 'これはエラーになるはずです',
        userId: 'invalid-key-test'
      }));
      
      // エラーレスポンスのチェック
      expect(response).toContain('問題');
    } finally {
      // 環境変数を元に戻す
      restoreTemp();
      // サービスを元の設定で再初期化
      await openaiService.initialize();
    }
  }, 15000); // タイムアウトを15秒に設定
}); 