// Bocchy デバッグヘルパー - 問題の診断と修正に役立つツール
const dotenv = require('dotenv');

// 環境変数の読み込み
dotenv.config();

// コンテキストマネージャーをロード
try {
  console.log('コンテキストマネージャーをロード中...');
  const contextManager = require('./context-manager');
  console.log('コンテキストマネージャーの設定を確認中...');
  const contextConfig = {
    supabaseUrl: process.env.SUPABASE_URL ? '設定あり' : '未設定',
    supabaseKey: process.env.SUPABASE_KEY ? '設定あり' : '未設定',
    conversationTable: process.env.SUPABASE_CONVERSATION_TABLE || 'conversations (デフォルト)',
    messageTable: process.env.SUPABASE_MESSAGE_TABLE || 'messages (デフォルト)'
  };
  console.log('コンテキスト管理設定:', contextConfig);
  
  // 初期化をテスト
  console.log('コンテキストマネージャーの初期化をテスト中...');
  (async () => {
    try {
      const initResult = await contextManager.initialize();
      console.log('初期化結果:', initResult);
      
      // テスト会話の追加
      console.log('テスト会話を追加中...');
      await contextManager.addMessage('debug-user', 'system', 'これはシステムメッセージのテストです');
      await contextManager.addMessage('debug-user', 'user', 'これはユーザーメッセージのテストです');
      
      // 会話履歴の取得
      console.log('会話履歴を取得中...');
      const messages = await contextManager.getConversationHistory('debug-user');
      console.log('取得した会話:', messages);
      
      // 会話のクリア
      console.log('会話をクリア中...');
      const cleared = await contextManager.clearConversation('debug-user');
      console.log('会話クリア結果:', cleared);
      
    } catch (error) {
      console.error('コンテキストマネージャーテスト中にエラーが発生しました:', error);
    }
  })();
} catch (error) {
  console.error('コンテキストマネージャーのロード中にエラーが発生しました:', error);
}

// OpenAIサービスをロード
try {
  console.log('\nOpenAIサービスをロード中...');
  const aiService = require('./openai-service');
  console.log('OpenAIサービスの設定を確認中...');
  const openaiConfig = {
    apiKey: process.env.OPENAI_API_KEY ? '設定あり' : '未設定',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini (デフォルト)',
    endpoint: process.env.OPENAI_ENDPOINT || 'https://api.openai.com/v1/chat/completions (デフォルト)'
  };
  console.log('OpenAI設定:', openaiConfig);
  
  // 初期化をテスト
  console.log('OpenAIサービスの初期化をテスト中...');
  (async () => {
    try {
      await aiService.initialize();
      console.log('OpenAIサービスの初期化に成功しました');
      
      // 設定を取得
      const config = aiService.getConfig();
      console.log('現在の設定:', config);
      
      // ヘルスチェック
      console.log('ヘルスチェックを実行中...');
      const health = await aiService.checkHealth();
      console.log('ヘルス状態:', health);
      
    } catch (error) {
      console.error('OpenAIサービステスト中にエラーが発生しました:', error);
    }
  })();
} catch (error) {
  console.error('OpenAIサービスのロード中にエラーが発生しました:', error);
}

// 環境変数のチェック
console.log('\n環境変数のチェック:');
const requiredVars = [
  'DISCORD_TOKEN',
  'OPENAI_API_KEY'
];

const optionalVars = [
  'AI_PROVIDER',
  'OPENAI_MODEL',
  'OPENAI_ENDPOINT',
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'SUPABASE_CONVERSATION_TABLE',
  'SUPABASE_MESSAGE_TABLE',
  'DEBUG',
  'PORT'
];

console.log('必須環境変数:');
for (const varName of requiredVars) {
  console.log(`- ${varName}: ${process.env[varName] ? '設定あり ✓' : '未設定 ✗'}`);
}

console.log('オプション環境変数:');
for (const varName of optionalVars) {
  console.log(`- ${varName}: ${process.env[varName] ? '設定あり ✓' : '未設定'}`);
}

console.log('\nデバッグ情報の収集が完了しました。');
