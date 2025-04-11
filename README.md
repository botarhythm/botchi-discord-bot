# ボッチー Discord Bot

GraphAI × Discord マルチモーダルチャットボット「ボッチー」

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D16.9.0-green)
![License](https://img.shields.io/badge/license-MIT-orange)

## 概要

ボッチーは高度なAI機能を備えたDiscordボットで、Gemini APIとGraphAI技術を活用した自然な会話体験を提供します。ダイレクトメッセージやメンションを通じて、ユーザーとインテラクティブなコミュニケーションが可能です。

## 主な機能

- **インテリジェントな会話**: Gemini APIを活用した自然な対話体験
- **高い信頼性**: リトライメカニズムと堅牢なエラーハンドリング
- **会話コンテキスト**: ユーザーごとの会話履歴管理
- **マルチチャネル対応**: サーバーチャットとDMの両方に対応
- **ヘルスモニタリング**: APIとボットの状態監視機能
- **ユーザーフレンドリー**: 直感的なコマンドとリッチな情報表示

## コマンド一覧

- `!ping` - 応答時間を確認
- `!hello` - 挨拶
- `!clear` - 会話履歴をクリア
- `!status` - ボットとAPIの状態表示
- `!help` - コマンド一覧を表示
- `@ボッチー [メッセージ]` - ボットにメンションして会話
- DMでの直接会話

## セットアップ

### 前提条件
- Node.js 16.9.0以上
- Discord Bot Token
- Gemini API Key

### インストール手順

1. リポジトリをクローン
   ```bash
   git clone https://github.com/botarhythm/botchi-discord-bot.git
   cd botchi-discord-bot
   ```

2. 依存関係のインストール
   ```bash
   npm install
   ```

3. 環境変数の設定
   - `.env.example`を`.env`にコピーして編集
   ```
   DISCORD_TOKEN=your_discord_bot_token
   GEMINI_API_KEY=your_gemini_api_key
   GEMINI_ENDPOINT=https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent
   DEBUG=false
   ```

4. ボットを起動
   ```bash
   npm start
   ```

### Discord Botの設定

1. [Discord Developer Portal](https://discord.com/developers/applications)でボットを作成
2. 必要なインテントの有効化:
   - MESSAGE CONTENT INTENT
   - SERVER MEMBERS INTENT 
   - DIRECT MESSAGES INTENT
3. ボットをサーバーに招待

## 使用方法

### 基本的な使い方

1. サーバー内でボットにメンション: `@ボッチー こんにちは`
2. ダイレクトメッセージで直接会話
3. コマンドを使用: `!help`

### テスト・デバッグ

- APIテスト: `npm run test`
- ヘルスチェック: `npm run health`
- 開発モード: `npm run dev`

## デプロイ

Railway を使用してデプロイすることを推奨します。Railway ダッシュボードで以下の環境変数を設定してください:

- `DISCORD_TOKEN`
- `GEMINI_API_KEY`
- `GEMINI_ENDPOINT`
- `DEBUG`（オプション）

## 開発ロードマップ

- マルチモーダル機能（画像・音声）の実装
- GraphAIフレームワークへの完全統合
- Supabaseを使用したデータ永続化
- カスタムプロンプト対応
- ユーザープリファレンス設定

## 安定性向上機能

v1.1.0では以下の安定性向上機能が追加されました:

- **リトライメカニズム**: 一時的なAPI障害に対する指数バックオフリトライ
- **エラーハンドリング強化**: 詳細なエラー分類と対処
- **応答検証**: 無効または不完全な応答の検出と修正
- **健全性モニタリング**: APIの状態を継続的に監視
- **詳細ステータス**: ボットとAPI接続の現在の状態を可視化

## 貢献

貢献は歓迎します！以下の方法で参加できます:

1. このリポジトリをフォーク
2. 機能追加やバグ修正のブランチを作成
3. 変更をコミット
4. プルリクエストを送信

## ライセンス

[MIT License](LICENSE)

## 作者

[botarhythm](https://github.com/botarhythm)
