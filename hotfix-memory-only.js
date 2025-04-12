// ボッチー メモリのみモードホットフィックス

/**
 * このスクリプトは、Supabase統合をバイパスして
 * メモリ内キャッシュのみを使用するようにコンテキスト管理を設定します。
 * Supabase設定に問題がある場合はこれを使用してください。
 * 
 * 使用方法: node hotfix-memory-only.js
 * 修正後、ボットを通常通り起動してください。
 * 
 * 注意: このモードではボットを再起動すると会話履歴がリセットされます。
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 環境変数を読み込み
dotenv.config();

console.log('🔧 メモリのみモードホットフィックスを開始します...');

// 既存の.envファイルのパス
const envPath = path.resolve(process.cwd(), '.env');

// .envファイルが存在するか確認
if (!fs.existsSync(envPath)) {
  console.error('❌ .envファイルが見つかりません。新規作成します。');
  
  // 最小限の.envファイルを作成
  const minimalEnv = `
# Discord Bot設定
DISCORD_TOKEN=${process.env.DISCORD_TOKEN || 'your_discord_bot_token'}

# API Provider設定
AI_PROVIDER=${process.env.AI_PROVIDER || 'openai'}

# OpenAI API設定
OPENAI_API_KEY=${process.env.OPENAI_API_KEY || 'your_openai_api_key'}
OPENAI_MODEL=${process.env.OPENAI_MODEL || 'gpt-4o-mini'}

# Supabaseをバイパス（メモリのみモード）
BYPASS_SUPABASE=true

# デバッグモード
DEBUG=${process.env.DEBUG || 'false'}
`;
  
  try {
    fs.writeFileSync(envPath, minimalEnv.trim());
    console.log('✅ 新しい.envファイルを作成しました');
  } catch (error) {
    console.error('❌ .envファイルの作成に失敗しました:', error.message);
    process.exit(1);
  }
} else {
  console.log('📄 既存の.envファイルを編集します...');
  
  // 既存の.envファイルを読み込み
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // BYPASS_SUPABASEが既に設定されているか確認
  if (envContent.includes('BYPASS_SUPABASE=')) {
    // 値を更新
    envContent = envContent.replace(/BYPASS_SUPABASE=.*$/m, 'BYPASS_SUPABASE=true');
    console.log('🔄 既存のBYPASS_SUPABASE設定を更新しました');
  } else {
    // 新しく設定を追加
    envContent += '\n\n# Supabaseをバイパス（メモリのみモード）\nBYPASS_SUPABASE=true\n';
    console.log('➕ BYPASS_SUPABASE設定を追加しました');
  }
  
  // 変更を保存
  try {
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .envファイルを更新しました');
  } catch (error) {
    console.error('❌ .envファイルの更新に失敗しました:', error.message);
    process.exit(1);
  }
}

// context-manager.jsを修正
console.log('📄 context-manager.jsを修正します...');

const contextManagerPath = path.resolve(process.cwd(), 'context-manager.js');

if (!fs.existsSync(contextManagerPath)) {
  console.error('❌ context-manager.jsが見つかりません');
  process.exit(1);
}

try {
  let contextManagerContent = fs.readFileSync(contextManagerPath, 'utf8');
  
  // 初期化関数にバイパス設定を追加
  const initFunctionRegex = /async function initialize\(\) \{[\s\S]*?isInitialized = true;/;
  
  const newInitFunction = `async function initialize() {
  if (isInitialized) return;
  
  // Supabaseバイパス設定を確認
  if (process.env.BYPASS_SUPABASE === 'true') {
    console.log('[ContextManager] Supabaseをバイパスし、メモリ内キャッシュのみを使用します');
    useSupabase = false;
    isInitialized = true;
    return { initialized: true, useSupabase: false, bypassReason: 'explicit' };
  }
  
  // Supabase設定が有効かチェック
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      // 接続テスト
      await axios.get(\`\${SUPABASE_URL}/rest/v1/\${CONVERSATION_TABLE}?limit=1\`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': \`Bearer \${SUPABASE_KEY}\`
        }
      });
      
      console.log('[ContextManager] Supabaseに接続しました');
      useSupabase = true;
    } catch (error) {
      console.error('[ContextManager] Supabase接続エラー:', error.message);
      console.log('[ContextManager] メモリ内キャッシュのみを使用します');
      useSupabase = false;
    }
  } else {
    console.log('[ContextManager] Supabase設定がありません。メモリ内キャッシュのみを使用します');
    useSupabase = false;
  }
  
  isInitialized = true;`;
  
  // 関数を置換
  contextManagerContent = contextManagerContent.replace(initFunctionRegex, newInitFunction);
  
  // 変更を保存
  fs.writeFileSync(contextManagerPath, contextManagerContent);
  console.log('✅ context-manager.jsを更新しました');
} catch (error) {
  console.error('❌ context-manager.jsの修正に失敗しました:', error.message);
  process.exit(1);
}

console.log('\n🎉 メモリのみモードホットフィックスが完了しました!');
console.log('🚀 ボットを通常通り起動できます: npm start');
console.log('\n注意: このモードではボットを再起動すると会話履歴がリセットされます。');
console.log('Supabase設定が修正できたら、BYPASS_SUPABASE=falseに設定することで永続ストレージを有効化できます。');