# Botchi Discord Bot - プロジェクト現状報告 🤖

## 🌟 プロジェクト概要
- **プロジェクト名**: Botchi Discord Bot
- **バージョン**: v1.3.6
- **目的**: OpenAI APIを活用した高機能なDiscordボットの開発
- **最終更新**: 2025年4月18日 12:06

## ✨ 実装済み機能

### 🔄 コア機能
- Discord.js v14.13.0による基本機能
- OpenAI API（v4.28.0）との統合
  - GPT-4o-miniモデルの使用
  - テキスト埋め込み（text-embedding-3-small）
- メッセージ履歴システム（新DMハンドラー実装）
- ヘルスチェックサーバー
- 環境依存しないパス解決システム

### 💾 データ管理
- Supabase（v2.39.2）を使用した永続的な会話履歴管理
- ユーザーごとのコンテキスト保持
- セッションをまたいだ会話の連続性
- Railway環境での安定した動作
- 自動マイグレーション制御

### 🔍 検索・RAG機能
- Brave Search API統合
- RAG（検索拡張生成）システムの実装
  - 類似度閾値による精度制御
  - コンテキスト長の最適化
  - 検索結果数の制限
- ベクトル検索機能
- ナレッジベース管理システム

### 👥 インタラクション制御
- バランス型介入モード
- キーワードベースの応答トリガー
- クールダウン制御
- 全サーバー対応

## 🛠 技術スタック
- **ホスティング**: Railway
  - 本番環境: botchi-discord-bot-production.up.railway.app
- **データベース**: Supabase
- **言語**: Node.js (>=16.9.0)
- **主要パッケージ**:
  - discord.js (v14.13.0)
  - @supabase/supabase-js (v2.39.2)
  - openai (v4.28.0)
  - axios (^1.6.2)
  - luxon (^3.4.4)

## 🔍 現在の状態
- 基本的なボット機能が安定して動作
- メッセージ履歴システムが正常に機能
- RAGシステムが本番環境で稼働中
- Web検索機能が統合済み
- Railway環境でのパス解決問題を修正
- デバッグモードが有効

## 🔑 主要な環境変数

### 認証・接続設定
- DISCORD_TOKEN: Discordボットトークン
- CLIENT_ID: Discordクライアントの識別子
- GUILD_ID: 開発用サーバーID
- OPENAI_API_KEY: OpenAI APIキー
- SUPABASE_URL: Supabase接続URL
- SUPABASE_KEY: Supabase APIキー
- BRAVE_API_KEY: Brave Search APIキー

### 機能制御
- AI_PROVIDER: AIプロバイダー設定（現在: openai）
- AI_TYPE: AIタイプ設定（現在: openai）
- OPENAI_MODEL: 使用モデル（現在: gpt-4o-mini）
- EMBEDDING_MODEL: 埋め込みモデル（現在: text-embedding-3-small）
- PREFIX: コマンドプレフィックス（現在: !）

### システム設定
- MEMORY_ENABLED: メモリシステム（現在: true）
- RAG_ENABLED: RAGシステム（現在: true）
- BRAVE_SEARCH_ENABLED: Web検索機能（現在: true）
- DEBUG: デバッグモード（現在: true）
- DM_MESSAGE_HANDLER: メッセージ処理方式（現在: new）

### RAG設定
- RAG_INITIALIZE_ON_START: 起動時の初期化（現在: true）
- RAG_MAX_RESULTS: 最大検索結果数（現在: 5）
- RAG_MAX_CONTEXT_LENGTH: コンテキスト長（現在: 2000）
- RAG_SIMILARITY_THRESHOLD: 類似度閾値（現在: 0.75）

### インタラクション設定
- INTERVENTION_MODE: 介入モード（現在: balanced）
- INTERVENTION_COOLDOWN: クールダウン時間（現在: 60秒）
- INTERVENTION_KEYWORDS: 応答トリガーキーワード
- ALLOW_ALL_SERVERS: 全サーバー対応（現在: true）

## 📋 次のステップ
1. RAGシステムの最適化
   - 類似度閾値の調整（現在0.75）
   - コンテキスト長の最適化（現在2000）
   - 検索結果数の調整（現在5）
2. エラーハンドリングの強化
   - 各APIとの連携における例外処理
   - フォールバックメカニズムの改善
3. パフォーマンス最適化
   - メモリ使用量の最適化
   - 応答速度の改善

## 🚧 今後の課題
- RAGシステムのパラメータチューニング
- エラーハンドリングの包括的な改善
- パフォーマンスチューニング
- ユーザー体験の向上
- 介入モードの効果検証

## 📝 最近の変更
- v1.3.6 (2025-04-18 12:06): 
  - Railway環境でのパス解決システムを改善
  - RAGシステムのパラメータを最適化
  - 介入モードを実装
- v1.3.5: 日付ハルシネーション修正機能のシンプル化
- v1.3.4: Web検索機能のデバッグとエラーハンドリング強化
- v1.3.3: discord-init.jsのエンコーディング問題を解決
