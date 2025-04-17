// anthropic-service.test.js - Anthropic統合サービスのテスト

// モジュールのモック
jest.mock('axios');

// テスト対象モジュール
const anthropicService = require('../anthropic-service');
const axios = require('axios');

describe('Anthropic Service', () => {
  // テスト前に環境変数とモックをリセット
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
    process.env.ANTHROPIC_MODEL = 'claude-3-5-sonnet-20240620';
  });

  // テスト後に環境変数をクリア
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
  });

  // initialize関数のテスト
  describe('initialize', () => {
    test('APIキーが設定されている場合は正常に初期化できること', async () => {
      // チェックヘルス関数のモック
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: { content: [{ text: 'Hello' }] }
      });

      const result = await anthropicService.initialize();
      
      expect(result.initialized).toBe(true);
      expect(result.apiConfigured).toBe(true);
      expect(result.model).toBe('claude-3-5-sonnet-20240620');
      expect(result.healthStatus).toBe('healthy');
    });

    test('APIキーが設定されていない場合は警告を返すこと', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      
      const result = await anthropicService.initialize();
      
      expect(result.initialized).toBe(true);
      expect(result.apiConfigured).toBe(false);
    });
  });

  // getResponse関数のテスト
  describe('getResponse', () => {
    test('コンテキストから適切なパラメータを抽出して応答を返すこと', async () => {
      // getAIResponse関数をモック
      const mockResponse = '森の奥からこんにちは';
      const spy = jest.spyOn(anthropicService, 'getAIResponse').mockResolvedValue(mockResponse);
      
      const context = {
        userId: 'user123',
        username: 'testuser',
        message: 'こんにちは',
        contextType: 'direct_message'
      };
      
      const response = await anthropicService.getResponse(context);
      
      expect(response).toBe(mockResponse);
      expect(spy).toHaveBeenCalledWith(
        'user123',
        'こんにちは',
        'testuser',
        true // isDM = true
      );
      
      spy.mockRestore();
    });
    
    test('エラーが発生した場合は適切に処理すること', async () => {
      // getAIResponse関数をモック
      const spy = jest.spyOn(anthropicService, 'getAIResponse').mockRejectedValue(new Error('API error'));
      
      const context = {
        userId: 'user123',
        username: 'testuser',
        message: 'こんにちは',
        contextType: 'channel'
      };
      
      await expect(anthropicService.getResponse(context)).rejects.toThrow('API error');
      
      spy.mockRestore();
    });
  });

  // getAIResponse関数のテスト
  describe('getAIResponse', () => {
    test('APIキーが設定されていない場合はエラーメッセージを返すこと', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      
      const response = await anthropicService.getAIResponse('user123', 'test', 'user');
      
      expect(response).toContain('API設定に問題');
    });
    
    test('正常にAPIを呼び出して応答を返すこと', async () => {
      // APIレスポンスをモック
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          content: [{
            text: '森の奥からこんにちは'
          }]
        }
      });
      
      const response = await anthropicService.getAIResponse('user123', 'こんにちは', 'testuser');
      
      expect(response).toBe('森の奥からこんにちは');
      expect(axios.post).toHaveBeenCalledTimes(1);
      
      // リクエスト内容を検証
      const axiosCall = axios.post.mock.calls[0];
      expect(axiosCall[1].model).toBe('claude-3-5-sonnet-20240620');
      expect(axiosCall[1].messages.length).toBeGreaterThanOrEqual(2); // システムプロンプト + ユーザーメッセージ
      
      // 最後のメッセージがユーザーのものであること
      const lastMessage = axiosCall[1].messages[axiosCall[1].messages.length - 1];
      expect(lastMessage.role).toBe('user');
      expect(lastMessage.content).toBe('こんにちは');
    });
    
    test('エラー発生時はリトライすること', async () => {
      // 最初のリクエストでは429エラー、2回目で成功するシナリオ
      axios.post
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValueOnce({
          status: 200,
          data: {
            content: [{
              text: 'リトライ後の応答'
            }]
          }
        });
      
      const response = await anthropicService.getAIResponse('user123', 'test', 'user');
      
      expect(response).toBe('リトライ後の応答');
      expect(axios.post).toHaveBeenCalledTimes(2); // リトライ含めて2回呼ばれること
    });
    
    test('5xx系エラーも適切にリトライすること', async () => {
      // サーバーエラーシナリオ
      axios.post
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValueOnce({
          status: 200,
          data: {
            content: [{
              text: 'サーバーエラー後の応答'
            }]
          }
        });
      
      const response = await anthropicService.getAIResponse('user123', 'test', 'user');
      
      expect(response).toBe('サーバーエラー後の応答');
      expect(axios.post).toHaveBeenCalledTimes(2);
    });
    
    test('リトライ上限を超えるとエラーメッセージを返すこと', async () => {
      // 4回連続でエラーになるシナリオ（リトライ上限は3回）
      axios.post
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockRejectedValueOnce({ response: { status: 429 } });
      
      const response = await anthropicService.getAIResponse('user123', 'test', 'user');
      
      expect(response).toContain('混みあって');
      expect(axios.post).toHaveBeenCalledTimes(4); // 初回 + リトライ3回
    });
    
    test('応答が空または短すぎる場合は適切なメッセージを返すこと', async () => {
      // 空の応答
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          content: [{ text: '' }]
        }
      });
      
      const response = await anthropicService.getAIResponse('user123', 'test', 'user');
      
      expect(response).toContain('言葉が見つからない');
      
      // 短すぎる応答
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          content: [{ text: 'Hi' }]
        }
      });
      
      const response2 = await anthropicService.getAIResponse('user123', 'test', 'user');
      
      expect(response2).toContain('うまく言葉が紡げなかった');
    });
  });
  
  // checkHealth関数のテスト
  describe('checkHealth', () => {
    test('APIキーがない場合は未設定状態を返すこと', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      
      const health = await anthropicService.checkHealth();
      
      expect(health.status).toBe('unconfigured');
    });
    
    test('APIが正常に応答する場合はhealthy状態を返すこと', async () => {
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: { content: [{ text: 'OK' }] }
      });
      
      const health = await anthropicService.checkHealth();
      
      expect(health.status).toBe('healthy');
    });
    
    test('API呼び出しでエラーが発生した場合はunhealthy状態を返すこと', async () => {
      axios.post.mockRejectedValueOnce(new Error('API error'));
      
      const health = await anthropicService.checkHealth();
      
      expect(health.status).toBe('unhealthy');
      expect(health.error).toBeDefined();
    });
  });
  
  // その他の補助関数のテスト
  describe('補助関数', () => {
    test('clearConversationHistoryが会話キャッシュをクリアすること', () => {
      // 事前に会話キャッシュを設定（内部実装に依存するため注意）
      const userId = 'test-user';
      
      // モックしてgetAIResponseを呼び出し、内部でキャッシュを作成
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          content: [{
            text: 'テスト応答'
          }]
        }
      });
      
      return anthropicService.getAIResponse(userId, 'テスト', 'user')
        .then(() => {
          // 会話履歴をクリア
          const result = anthropicService.clearConversationHistory(userId);
          
          expect(result).toBe(true);
          
          // 再度会話を開始すると初期状態から始まる
          axios.post.mockResolvedValueOnce({
            status: 200,
            data: {
              content: [{
                text: '新しい会話'
              }]
            }
          });
          
          return anthropicService.getAIResponse(userId, 'こんにちは', 'user');
        })
        .then(() => {
          // システムプロンプトと新しいメッセージだけが含まれる
          const call = axios.post.mock.calls[1]; // 2回目の呼び出し
          expect(call[1].messages.length).toBe(2);
        });
    });
    
    test('getConfigが適切な設定情報を返すこと', () => {
      const config = anthropicService.getConfig();
      
      expect(config.model).toBe('claude-3-5-sonnet-20240620');
      expect(config.endpoint).toBeDefined();
      expect(config.apiVersion).toBeDefined();
      expect(config.userCount).toBeDefined();
      expect(config.healthStatus).toBeDefined();
    });
    
    test('isConfiguredがAPI設定状態を正しく返すこと', () => {
      expect(anthropicService.isConfigured()).toBe(true);
      
      delete process.env.ANTHROPIC_API_KEY;
      
      expect(anthropicService.isConfigured()).toBe(false);
    });
  });
});
