# Botchi Discord Bot - デプロイメント計画

## 現在の環境

### プロダクション環境（Railway）
- Node.js Runtime
- Supabase連携
- 継続的デプロイメント（GitHub連携）

### 使用中のサービス
1. Railway
   - メインアプリケーションホスティング
   - 環境変数管理
   - ヘルスチェック

2. Supabase
   - 永続的データストレージ
   - ユーザーコンテキスト管理
   - ベクトルデータベース（RAG用）

3. OpenAI API
   - テキスト生成
   - コンテキスト処理

4. Google Custom Search API
   - Web検索機能
   - ※ API制限時のフォールバック処理を強化 (v1.3.6)

## デプロイメントプロセス

### 1. 開発環境での準備
```bash
# 依存関係の更新
npm install

# テストの実行
npm run test

# リンター実行
npm run lint
```

### 2. ステージング確認
- ローカル環境での動作確認
- テストスイートの実行
- 環境変数の確認

### 3. プロダクションデプロイ
```bash
# GitHubにプッシュ
git add .
git commit -m "feat: 機能の説明"
git push origin main

# Railway自動デプロイ待機
# デプロイログの確認
```

## 環境変数設定

### 必須環境変数
```bash
# Discord設定
DISCORD_TOKEN=

# OpenAI設定
OPENAI_API_KEY=

# Supabase設定
SUPABASE_URL=
SUPABASE_KEY=

# Google Search設定
GOOGLE_API_KEY=
GOOGLE_CSE_ID=
```

### オプション環境変数
```bash
# 機能フラグ
MEMORY_ENABLED=true
RAG_ENABLED=true

# デバッグ設定
DEBUG=false

# パフォーマンス設定
MESSAGE_HISTORY_LIMIT=100
CONTEXT_WINDOW_SIZE=4000
```

## モニタリング計画