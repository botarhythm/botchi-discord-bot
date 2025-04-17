// __tests__/helpers/mock-setup.js - テスト用ヘルパー関数

/**
 * テスト環境の設定を行う
 * 環境変数などをテスト用にセットアップする
 * @param {Object} options - 設定オプション
 * @returns {Object} - 元の環境変数と設定値のペア
 */
function setupEnvironment(options = {}) {
  // プロセス環境のチェック
  if (!process || !process.env) {
    console.error('プロセス環境が利用できません。環境変数の設定をスキップします。');
    return {};
  }
  
  // テスト環境のトークン識別子（テスト間の分離を強化）
  const testToken = Math.random().toString(36).substring(2, 10) + Date.now().toString();
  
  // 現在の環境変数を保存（ディープコピーして参照問題を避ける）
  const originalEnv = {};
  try {
    Object.keys(process.env).forEach(key => {
      originalEnv[key] = process.env[key];
    });
  } catch (error) {
    console.warn('環境変数の保存中にエラーが発生しました:', error.message);
  }
  
  // デフォルト値（テスト用環境変数）
  const defaults = {
    OPENAI_API_KEY: `test-api-key-${testToken}`, // 一意のトークンを追加
    OPENAI_MODEL: 'gpt-4o-mini',
    ANTHROPIC_API_KEY: `test-api-key-${testToken}`, // 一意のトークンを追加
    ANTHROPIC_MODEL: 'claude-3-5-sonnet-20240620',
    NODE_ENV: 'test',
    TEST_INSTANCE_ID: testToken
  };
  
  // 各テスト実行ごとに環境をクリーンに保つため、APIキー関連変数を一旦全削除
  const apiKeys = [
    'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY',
    'OPENAI_MODEL', 'ANTHROPIC_MODEL', 'GEMINI_MODEL'
  ];
  
  // 環境変数を確実に削除
  try {
    apiKeys.forEach(key => {
      if (key in process.env) {
        delete process.env[key];
      }
    });
  } catch (error) {
    console.warn('APIキー環境変数のクリア中にエラーが発生しました:', error.message);
  }
  
  // 環境変数をセット（オプションで上書き）
  const settings = { ...defaults, ...options };
  try {
    Object.entries(settings).forEach(([key, value]) => {
      if (value === null || value === '') {
        // 明示的にnullまたは空文字列の場合は確実に削除
        if (key in process.env) {
          delete process.env[key];
        }
      } else {
        // 値が存在する場合は設定（文字列に変換）
        process.env[key] = String(value);
      }
    });
  } catch (error) {
    console.warn('環境変数の設定中にエラーが発生しました:', error.message);
  }
  
  // より確実にモック環境を特定するためのフラグを設定
  try {
    process.env.IS_TEST_ENVIRONMENT = 'true';
    process.env.TEST_SETUP_TIME = Date.now().toString();
    process.env.TEST_TOKEN = testToken;
  } catch (error) {
    console.warn('テスト環境フラグの設定中にエラーが発生しました:', error.message);
  }
  
  // 設定した環境変数の検証ログ（デバッグモードの場合）
  if (options.DEBUG_TESTS === 'true' || process.env.DEBUG_TESTS === 'true') {
    console.debug(`テスト環境変数設定完了 (トークン: ${testToken}):`, 
      apiKeys.reduce((acc, key) => {
        acc[key] = process.env[key] ? `設定あり (${process.env[key].length}文字)` : '未設定';
        return acc;
      }, {})
    );
  }
  
  return originalEnv;
}

/**
 * テスト環境をクリーンアップする
 * @param {Object} originalEnv - 元の環境変数
 * @returns {boolean} - クリーンアップ成功の有無
 */
function cleanupEnvironment(originalEnv) {
  // プロセス環境のチェック
  if (!process || !process.env) {
    console.error('プロセス環境が利用できません。環境変数のクリーンアップをスキップします。');
    return false;
  }
  
  // 元の環境変数の有効性確認
  if (!originalEnv || typeof originalEnv !== 'object') {
    console.warn('有効な環境変数の元の状態が提供されていません。クリーンアップをスキップします。');
    return false;
  }
  
  // テスト環境のフラグをチェック
  const isTestEnv = process.env.IS_TEST_ENVIRONMENT === 'true';
  const testToken = process.env.TEST_TOKEN || '';
  
  if (!isTestEnv) {
    console.warn('テスト環境フラグが設定されていません。安全のため詳細なクリーンアップをスキップします。');
    // 最小限のクリーンアップのみ実行
    try {
      // 重要なAPIキーのみクリーンアップ
      ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY'].forEach(key => {
        if (key in process.env) delete process.env[key];
      });
      return true;
    } catch (error) {
      console.error('最小限のクリーンアップ中にエラーが発生しました:', error.message);
      return false;
    }
  }
  
  // デバッグログ用のフラグ
  const isDebugMode = process.env.DEBUG_TESTS === 'true';
  
  try {
    if (isDebugMode) {
      console.debug(`環境変数クリーンアップ開始 (トークン: ${testToken})`);
    }
    
    // 現在のキーをリストとして保存（ループ中に削除するため）
    const currentKeys = Object.keys(process.env);
    
    // テスト用に追加された環境変数を特定してクリア
    // まずAPIキー関連変数やテスト専用フラグを削除
    const testKeys = [
      'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY',
      'OPENAI_MODEL', 'ANTHROPIC_MODEL', 'GEMINI_MODEL',
      'IS_TEST_ENVIRONMENT', 'TEST_SETUP_TIME', 'TEST_TOKEN', 'TEST_INSTANCE_ID'
    ];
    
    // 確実にキーを削除
    testKeys.forEach(key => {
      if (key in process.env) {
        delete process.env[key];
      }
    });
    
    // テスト中に追加されたその他の変数をクリア
    // 安全に実行するため、try-catchブロックで各キーを個別に処理
    for (const key of currentKeys) {
      try {
        // 元の環境変数にないキーは削除（テストで追加されたと見なす）
        if (!(key in originalEnv)) {
          delete process.env[key];
          if (isDebugMode) {
            console.debug(`追加された環境変数を削除: ${key}`);
          }
        }
      } catch (keyError) {
        console.warn(`キー "${key}" のクリーンアップに失敗しました:`, keyError.message);
      }
    }
    
    // 元の環境変数を復元
    let restoredCount = 0;
    for (const [key, value] of Object.entries(originalEnv)) {
      try {
        if (value === undefined || value === null) {
          if (key in process.env) {
            delete process.env[key];
          }
        } else {
          process.env[key] = String(value);
          restoredCount++;
        }
      } catch (restoreError) {
        console.warn(`キー "${key}" の復元に失敗しました:`, restoreError.message);
      }
    }
    
    // 復元ログ
    if (isDebugMode) {
      console.debug(`環境変数が復元されました: ${restoredCount}/${Object.keys(originalEnv).length} 件`);
    }
    
    return true;
  } catch (error) {
    console.error('環境変数のクリーンアップ中に重大なエラーが発生しました:', error.message);
    
    // エラー発生時でも最低限のクリーンアップを試みる
    try {
      // APIキーなどの重要変数は確実に削除
      ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY'].forEach(key => {
        if (key in process.env) delete process.env[key];
      });
    } catch (e) {
      console.error('最終的なクリーンアップにも失敗しました:', e.message);
    }
    
    return false;
  }
}

/**
 * モック応答を作成する
 * @returns {Object} - 各APIサービスのモック応答
 */
function createMockResponses() {
  return {
    openai: {
      status: 200,
      data: {
        choices: [
          {
            message: {
              content: '森の奥からこんにちは'
            }
          }
        ]
      }
    },
    anthropic: {
      status: 200,
      data: {
        content: [
          {
            text: '森の奥からこんにちは'
          }
        ]
      }
    }
  };
}

/**
 * Axios呼び出しをテスト用にモックする
 * @param {Object} axios - モック済みのaxiosインスタンス
 * @param {Object} responses - モック応答のセット
 * @param {Object} options - モックオプション
 */
function mockAxiosForTest(axios, responses, options = {}) {
  // モックがまだ設定されていない場合は警告
  if (!axios || !axios.post || typeof axios.post.mockImplementation !== 'function') {
    console.warn('Axiosモックが正しく設定されていません。jest.mock("axios")が呼ばれていることを確認してください。');
    return;
  }

  // レスポンスがない場合は警告
  if (!responses || (!responses.openai && !responses.anthropic)) {
    console.warn('モックレスポンスが指定されていません。createMockResponses()を使用してください。');
    // デフォルトのレスポンスを作成
    responses = createMockResponses();
  }

  // デフォルトオプション
  const defaultOptions = {
    shouldFail: false,  // trueの場合、エラーをスローする
    failureRate: 0,     // 0〜1の確率でランダムにエラーを発生させる（0は常に成功）
    delayResponse: 0,   // レスポンスを遅延させるミリ秒数（0は遅延なし）
    errorStatusCode: 500, // エラー時のステータスコード
    errorMessage: 'Mocked API error',  // エラーメッセージ
    debug: process.env.DEBUG_TESTS === 'true' // デバッグログを出力するか
  };
  
  // オプションをマージ
  const mockOptions = { ...defaultOptions, ...options };
  
  // 既存のモックをクリア
  axios.post.mockReset();
  axios.post.mockClear();  // mockClearも追加して確実にクリア
  
  // 深いコピーでレスポンスを複製（参照の問題を避けるため）
  const safeResponses = {
    openai: responses.openai ? JSON.parse(JSON.stringify(responses.openai)) : null,
    anthropic: responses.anthropic ? JSON.parse(JSON.stringify(responses.anthropic)) : null
  };
  
  // 新しいモック実装を設定
  axios.post.mockImplementation((url, data) => {
    const requestTime = Date.now();
    if (mockOptions.debug) {
      console.debug(`[${requestTime}] Axios POST モック呼び出し: ${url}`, 
        data ? {model: data.model, messagesCount: data.messages?.length} : 'データなし');
    }
    
    // レスポンスを遅延させる場合
    const delay = mockOptions.delayResponse > 0 
      ? new Promise(resolve => setTimeout(resolve, mockOptions.delayResponse))
      : Promise.resolve();
    
    return delay.then(() => {
      // エラー発生の判定
      const shouldFail = mockOptions.shouldFail || 
        (mockOptions.failureRate > 0 && Math.random() < mockOptions.failureRate);
      
      if (shouldFail) {
        // エラーオブジェクトの生成
        const error = new Error(mockOptions.errorMessage);
        error.response = {
          status: mockOptions.errorStatusCode,
          data: { error: mockOptions.errorMessage }
        };
        
        if (mockOptions.debug) {
          console.debug(`[${Date.now()}] Axios モックエラー: ${error.message}`, error.response);
        }
        
        return Promise.reject(error);
      }
      
      // 正常なレスポンスの場合、URLに応じたモックレスポンスを返す
      let response = { status: 200, data: {} };
      
      if (url && url.includes('openai.com') && safeResponses.openai) {
        response = safeResponses.openai;
      } else if (url && url.includes('anthropic.com') && safeResponses.anthropic) {
        response = safeResponses.anthropic;
      } else if (mockOptions.debug) {
        console.debug(`[${Date.now()}] URLパターンにマッチするレスポンスが見つかりません: ${url}`);
        // デフォルトのレスポンスを返す
        if (safeResponses.openai) {
          response = safeResponses.openai;
          console.debug('OpenAIのモックレスポンスをデフォルトとして使用します');
        }
      }
      
      if (mockOptions.debug) {
        console.debug(`[${Date.now()}] Axios モックレスポンス:`, 
          response.data?.choices ? 
            `choices: ${response.data.choices.length}, ` +
            `content: ${response.data.choices[0]?.message?.content?.substring(0, 30)}...` : 
            response);
      }
      
      return Promise.resolve({...response});  // 新しいオブジェクトを返して参照問題を回避
    });
  });
  
  // 他のメソッドも必要ならモック設定
  ['get', 'put', 'delete', 'patch'].forEach(method => {
    if (axios[method] && typeof axios[method].mockImplementation === 'function') {
      axios[method].mockReset();
      axios[method].mockImplementation(() => {
        console.warn(`Axios ${method.toUpperCase()} は現在モック化されていません`);
        return Promise.resolve({ status: 200, data: {} });
      });
    }
  });
}

/**
 * コンテキストマネージャーをモックする
 * @returns {Object} モック済みのコンテキストマネージャー
 */
function mockContextManager() {
  return {
    initialize: jest.fn().mockResolvedValue({ initialized: true }),
    getConfig: jest.fn().mockReturnValue({
      useSupabase: false,
      userCount: 0,
      initialized: true
    }),
    saveContext: jest.fn().mockResolvedValue(true),
    loadContext: jest.fn().mockResolvedValue({ messages: [] }),
    clearContext: jest.fn().mockResolvedValue(true)
  };
}

module.exports = {
  setupEnvironment,
  cleanupEnvironment,
  createMockResponses,
  mockAxiosForTest,
  mockContextManager
};
