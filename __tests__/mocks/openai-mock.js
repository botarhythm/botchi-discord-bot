/**
 * OpenAI APIのモック
 * テスト環境でのAPIリクエストをシミュレート
 */

// デフォルトのモックレスポンス
const DEFAULT_RESPONSE = {
  choices: [
    {
      message: {
        content: 'こんにちは、ボッチーです。森の中でお待ちしていました。',
        role: 'assistant'
      },
      finish_reason: 'stop'
    }
  ],
  usage: {
    prompt_tokens: 150,
    completion_tokens: 35,
    total_tokens: 185
  },
  id: 'chatcmpl-mock-id',
  created: Date.now(),
  model: 'gpt-4o-mini'
};

// OpenAI APIのモック
const openaiMock = {
  chat: {
    completions: {
      create: jest.fn().mockResolvedValue(DEFAULT_RESPONSE)
    }
  }
};

// 異なるレスポンスを生成するヘルパー関数
const createCustomResponse = (content, options = {}) => {
  return {
    choices: [
      {
        message: {
          content: content,
          role: options.role || 'assistant'
        },
        finish_reason: options.finish_reason || 'stop'
      }
    ],
    usage: options.usage || {
      prompt_tokens: options.prompt_tokens || 150,
      completion_tokens: content.length / 4 || 35,
      total_tokens: (options.prompt_tokens || 150) + (content.length / 4 || 35)
    },
    id: options.id || `chatcmpl-mock-${Date.now()}`,
    created: options.created || Date.now(),
    model: options.model || 'gpt-4o-mini'
  };
};

// エラーレスポンスを生成するヘルパー関数
const createErrorResponse = (status, message) => {
  const error = new Error(message || 'OpenAI API Error');
  error.response = {
    status: status || 500,
    data: {
      error: {
        message: message || 'OpenAI API Error',
        type: 'api_error',
        code: status || 'internal_error'
      }
    }
  };
  return error;
};

// モックをリセットする関数
const resetMock = () => {
  openaiMock.chat.completions.create.mockReset();
  openaiMock.chat.completions.create.mockResolvedValue(DEFAULT_RESPONSE);
};

// 特定のエラーを発生させる設定
const mockError = (status, message) => {
  const error = createErrorResponse(status, message);
  openaiMock.chat.completions.create.mockRejectedValueOnce(error);
  return error;
};

// 特定のレスポンスを返すよう設定
const mockResponse = (content, options = {}) => {
  const response = createCustomResponse(content, options);
  openaiMock.chat.completions.create.mockResolvedValueOnce(response);
  return response;
};

module.exports = {
  openaiMock,
  DEFAULT_RESPONSE,
  resetMock,
  mockError,
  mockResponse,
  createCustomResponse,
  createErrorResponse
}; 