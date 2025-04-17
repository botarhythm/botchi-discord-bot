// jest.setup.js - Jestのセットアップファイル

// テスト用環境変数の読み込み
require('dotenv').config({ path: '.env.test' });

// テスト実行時に環境変数をセット
process.env.NODE_ENV = 'test';

// console.logを無効化してテスト出力をクリーンに保つ
if (process.env.SILENT_LOGS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    // エラーとワーニングは残す
    warn: console.warn,
    error: console.error
  };
}

// モックするモジュールのリセット
jest.mock('./system/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// テストタイムアウトの拡張 (API呼び出しのテストなど長時間かかる場合)
jest.setTimeout(10000);

// グローバルなafterAllフック
afterAll(() => {
  // 全テスト終了後のクリーンアップ処理
  jest.resetAllMocks();
});
