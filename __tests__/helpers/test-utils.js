/**
 * テスト用ユーティリティ関数
 */

const fs = require('fs');
const path = require('path');

// 一時ディレクトリの作成
const createTempDirectory = (dirName) => {
  const tempDir = path.join(__dirname, '..', '..', 'tmp', dirName);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
};

// テスト用のリクエストコンテキスト生成
const createTestContext = (overrides = {}) => {
  const userId = overrides.userId || `user-${Date.now()}`;
  
  return {
    userId,
    username: overrides.username || 'testuser',
    message: overrides.message || 'こんにちは',
    contextType: overrides.contextType || 'direct_message',
    channel: overrides.channel || { id: 'test-channel', send: jest.fn() },
    guild: overrides.guild || { id: 'test-guild', name: 'Test Server' },
    author: overrides.author || { 
      id: userId, 
      username: overrides.username || 'testuser',
      bot: false
    },
    mentions: overrides.mentions || { users: new Map() },
    content: overrides.message || 'こんにちは',
    ...overrides
  };
};

// テスト用メッセージの生成
const createTestMessage = (content, options = {}) => {
  const userId = options.userId || `user-${Date.now()}`;
  
  return {
    content,
    author: {
      id: userId,
      username: options.username || 'testuser',
      bot: options.isBot || false,
      ...options.author
    },
    channel: {
      id: options.channelId || 'test-channel',
      type: options.channelType || 'DM',
      send: jest.fn().mockResolvedValue({ id: 'response-message' }),
      ...options.channel
    },
    guild: options.guild || { 
      id: options.guildId || 'test-guild',
      name: options.guildName || 'Test Server' 
    },
    mentions: {
      users: new Map(options.mentions || []),
      ...options.mentionsOverride
    },
    attachments: new Map(options.attachments || []),
    reply: jest.fn().mockResolvedValue({ id: 'reply-message' }),
    ...options.messageOverrides
  };
};

// 環境変数のモック
const mockEnvironment = (variables) => {
  const originalEnv = { ...process.env };
  
  // 環境変数のリセット
  Object.keys(variables).forEach(key => {
    if (variables[key] === null || variables[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = variables[key];
    }
  });
  
  return () => {
    // 元の環境変数に戻す
    Object.keys(process.env).forEach(key => {
      delete process.env[key];
    });
    
    Object.keys(originalEnv).forEach(key => {
      process.env[key] = originalEnv[key];
    });
  };
};

// タイマーのモック
const mockTimers = () => {
  jest.useFakeTimers();
  
  return {
    advanceTime: (ms) => {
      jest.advanceTimersByTime(ms);
    },
    restore: () => {
      jest.useRealTimers();
    }
  };
};

module.exports = {
  createTempDirectory,
  createTestContext,
  createTestMessage,
  mockEnvironment,
  mockTimers
}; 