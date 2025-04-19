module.exports = {
  // テスト環境を設定
  testEnvironment: 'node',
  
  // テストファイルのパターン
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // テスト対象外のファイル/ディレクトリパターン
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/supabase-mcp-server-official/',
    '/logs/',
    '__tests__/helpers/',
    '__tests__/mocks/',
    '__tests__/test-search.js',
    '__tests__/gemini-test.js',
    '__tests__/debug-path-test.js',
  ],
  
  // カバレッジの設定
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/vendor/**',
    '!**/coverage/**',
    '!jest.config.js',
    '!**/migrations/**'
  ],
  
  // テスト実行時のタイムアウト設定
  testTimeout: 10000,
  
  // 各テスト間の分離を強化
  resetMocks: true,
  clearMocks: true,
  
  // スナップショットの保存先
  snapshotSerializers: [],
  
  // カバレッジレポートの設定
  coverageReporters: ['text', 'lcov'],
  coverageDirectory: 'coverage',
  
  // テスト後に環境を元に戻すモジュール
  setupFilesAfterEnv: ['./jest.setup.js'],
  
  // テスト実行前の前準備
  globalSetup: undefined,
  
  // テスト実行後のクリーンアップ
  globalTeardown: undefined,
  
  // モック設定
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  }
};
