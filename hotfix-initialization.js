// ボッチー初期化ホットフィックス

/**
 * このスクリプトは、ボットを起動する前に
 * コンテキスト管理モジュールとAIサービスを
 * 事前に初期化するためのものです。
 * 
 * 使用方法: node hotfix-initialization.js
 * 初期化が成功したら、ボットを通常通り起動してください。
 * 
 * 問題: AIサービスの初期化が完了する前にメッセージ処理が始まると
 * ボットが応答しなくなる可能性があります。
 */

const dotenv = require('dotenv');
dotenv.config();

// タイムアウト設定
const TIMEOUT = 30000; // 30秒

console.log('🔧 ボッチー初期化ホットフィックスを開始します...');

// コンテキストマネージャーをロード
console.log('📦 コンテキストマネージャーをロード中...');
try {
  const contextManager = require('./context-manager');
  
  // AIサービスをロード
  console.log('📦 AIサービスをロード中...');
  const aiProvider = process.env.AI_PROVIDER || 'openai';
  let aiService;
  
  if (aiProvider === 'openai') {
    aiService = require('./openai-service');
  } else {
    aiService = require('./gemini-service');
  }
  
  console.log(`🔍 ${aiProvider.toUpperCase()} APIの初期化を実行します...`);
  
  // 初期化処理
  const initPromise = (async () => {
    try {
      console.log('🔄 コンテキストマネージャーの初期化中...');
      const contextResult = await contextManager.initialize();
      console.log('✅ コンテキストマネージャーの初期化完了:', contextResult);
      
      console.log(`🔄 ${aiProvider.toUpperCase()} サービスの初期化中...`);
      await aiService.initialize();
      console.log(`✅ ${aiProvider.toUpperCase()} サービスの初期化完了`);
      
      console.log('🔍 AIサービスのヘルスチェック中...');
      const health = await aiService.checkHealth();
      console.log('✅ ヘルスチェック完了:', health);
      
      console.log('\n🎉 すべての初期化が正常に完了しました!');
      console.log('🚀 ボットを通常通り起動できます: npm start');
      
      return true;
    } catch (error) {
      console.error('❌ 初期化中にエラーが発生しました:', error);
      console.log('\n🔧 修正のヒント:');
      console.log('1. .env ファイルの設定を確認してください');
      console.log('2. API_KEYが正しく設定されているか確認してください');
      console.log('3. Supabase設定を使用している場合は接続情報を確認してください');
      console.log('4. それでも問題が解決しない場合は、Supabase設定を無効にしてください');
      return false;
    }
  })();
  
  // タイムアウト処理
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('初期化がタイムアウトしました')), TIMEOUT);
  });
  
  // 結果待ち
  Promise.race([initPromise, timeoutPromise])
    .catch(error => {
      console.error('❌ 処理に失敗しました:', error.message);
      process.exit(1);
    });
  
} catch (error) {
  console.error('❌ モジュールのロード中にエラーが発生しました:', error);
  console.log('\n🔧 修正のヒント:');
  console.log('1. 依存関係が正しくインストールされているか確認してください: npm install');
  console.log('2. ファイルが欠けていないか確認してください');
  console.log('3. プロジェクトを再度クローンして試してください');
  process.exit(1);
}