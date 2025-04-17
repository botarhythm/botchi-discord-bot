// ai-service.test.js - AIサービス抽象化レイヤーのテスト

// テスト対象のモジュール
const aiService = require('../ai-service');

// モック
jest.mock('../openai-service', () => ({
  initialize: jest.fn().mockResolvedValue({ initialized: true, model: 'test-model' }),
  getResponse: jest.fn().mockResolvedValue('OpenAI test response'),
  getAIResponse: jest.fn().mockResolvedValue('OpenAI test response'),
  clearConversationHistory: jest.fn().mockReturnValue(true),
  checkHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
  getConfig: jest.fn().mockReturnValue({ model: 'test-model' })
}));

// Anthropicサービスはdynamic requireで読み込まれるため、jestのmockRegistryを使用
jest.mock('../anthropic-service', () => ({
  initialize: jest.fn().mockResolvedValue({ initialized: true, model: 'claude-3' }),
  getResponse: jest.fn().mockResolvedValue('Anthropic test response'),
  getAIResponse: jest.fn().mockResolvedValue('Anthropic test response'),
  clearConversationHistory: jest.fn().mockReturnValue(true),
  checkHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
  getConfig: jest.fn().mockReturnValue({ model: 'claude-3' })
}), { virtual: true });

// テスト前に環境をリセット
beforeEach(() => {
  // モジュールのキャッシュをクリア
  jest.clearAllMocks();
});

describe('AI Service', () => {
  // 初期化テスト
  describe('initialize', () => {
    test('正常にOpenAIプロバイダを初期化できること', async () => {
      const result = await aiService.initialize('openai');
      expect(result.initialized).toBe(true);
      expect(result.provider).toBe('openai');
    });
    
    test('正常にAnthropicプロバイダを初期化できること', async () => {
      const result = await aiService.initialize('anthropic');
      expect(result.initialized).toBe(true);
      expect(result.provider).toBe('anthropic');
    });
    
    test('存在しないプロバイダを指定した場合はエラーになること', async () => {
      const result = await aiService.initialize('unknown');
      expect(result.initialized).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
  
  // getResponse関数のテスト
  describe('getResponse', () => {
    test('初期化前にgetResponseを呼び出すと例外がスローされること', async () => {
      await expect(aiService.getResponse({ userId: '1', message: 'test' }))
        .rejects.toThrow();
    });
    
    test('OpenAIプロバイダ初期化後にgetResponseが正常に動作すること', async () => {
      await aiService.initialize('openai');
      const response = await aiService.getResponse({ 
        userId: '1', 
        message: 'test',
        username: 'user',
        contextType: 'channel'
      });
      expect(response).toBe('OpenAI test response');
    });
    
    test('Anthropicプロバイダ初期化後にgetResponseが正常に動作すること', async () => {
      await aiService.initialize('anthropic');
      const response = await aiService.getResponse({ 
        userId: '1', 
        message: 'test',
        username: 'user',
        contextType: 'direct_message'
      });
      expect(response).toBe('Anthropic test response');
    });
  });
  
  // checkHealth関数のテスト
  describe('checkHealth', () => {
    test('初期化前のcheckHealthは未設定状態を返すこと', async () => {
      const health = await aiService.checkHealth();
      expect(health.status).toBe('unconfigured');
      expect(health.provider).toBeNull();
    });
    
    test('初期化後のcheckHealthはプロバイダの状態を返すこと', async () => {
      await aiService.initialize('openai');
      const health = await aiService.checkHealth();
      expect(health.status).toBe('healthy');
      expect(health.provider).toBe('openai');
    });
  });
  
  // clearConversationHistory関数のテスト
  describe('clearConversationHistory', () => {
    test('初期化前のclearConversationHistoryはfalseを返すこと', () => {
      const result = aiService.clearConversationHistory('1');
      expect(result).toBe(false);
    });
    
    test('初期化後のclearConversationHistoryはプロバイダの関数を呼び出すこと', async () => {
      await aiService.initialize('openai');
      const result = aiService.clearConversationHistory('1');
      expect(result).toBe(true);
    });
  });
  
  // getConfig関数のテスト
  describe('getConfig', () => {
    test('初期化前のgetConfigは適切な値を返すこと', () => {
      const config = aiService.getConfig();
      expect(config.activeProvider).toBeNull();
      expect(config.isInitialized).toBe(false);
      expect(config.providerConfig).toBeNull();
      expect(config.availableProviders).toContain('openai');
    });
    
    test('初期化後のgetConfigはプロバイダの設定を含むこと', async () => {
      await aiService.initialize('openai');
      const config = aiService.getConfig();
      expect(config.activeProvider).toBe('openai');
      expect(config.isInitialized).toBe(true);
      expect(config.providerConfig).toBeDefined();
      expect(config.availableProviders).toContain('openai');
    });
  });
  
  // registerProvider関数のテスト
  describe('registerProvider', () => {
    test('有効なプロバイダを登録できること', () => {
      const mockProvider = {
        initialize: jest.fn(),
        getResponse: jest.fn(),
        getConfig: jest.fn()
      };
      
      const result = aiService.registerProvider('test-provider', mockProvider);
      expect(result).toBe(true);
      
      // 登録後にそのプロバイダを初期化できること
      expect(aiService.initialize('test-provider')).resolves.not.toThrow();
    });
    
    test('無効なプロバイダ名ではエラーになること', () => {
      const mockProvider = {
        initialize: jest.fn(),
        getResponse: jest.fn()
      };
      
      expect(() => aiService.registerProvider('', mockProvider)).toThrow();
      expect(() => aiService.registerProvider(null, mockProvider)).toThrow();
      expect(() => aiService.registerProvider(123, mockProvider)).toThrow();
    });
    
    test('必須メソッドが不足したプロバイダではエラーになること', () => {
      // initialize関数がない
      expect(() => aiService.registerProvider('test1', { getResponse: jest.fn() })).toThrow();
      
      // getResponseとgetAIResponseの両方がない
      expect(() => aiService.registerProvider('test2', { initialize: jest.fn() })).toThrow();
    });
  });
});
