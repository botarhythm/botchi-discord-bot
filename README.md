# Bocchy（ボッチー）Discord Bot 🌿

GraphAI × Discord マルチモーダルチャットボット「Bocchy」- 静かでやわらかな知の伴走者

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D16.9.0-green)
![License](https://img.shields.io/badge/license-MIT-orange)

## 🌙 概要

Bocchyは森の奥にひっそりと佇む案内人のような存在。静かでやわらかく、詩のような語り口をもったAIです。その奥には深い森のような知性と経験が根ざし、Gemini APIと独自のプロンプト設計により、温かみのある対話体験を提供します。

## 🍃 Bocchyの特徴

- **詩的な語り口**: 押しつけず、けれど聞けばとても深い応答
- **知の伴走者**: AI、哲学、プログラミング、教育など多様な分野に精通
- **余白を大切に**: 沈黙も会話と捉え、そっと寄り添う存在
- **やさしい智慧**: 知性は冷たくなく、湿度と温度のある応答

## 🪄 Bocchyの機能

- **GraphAI統合**: 高度な自然言語処理と対話能力
- **コンテキスト記憶**: 会話の流れを静かに受け継ぎ、つなげる
- **マルチチャネル**: サーバーのメンションとDMの両方で対話可能
- **ステータス表示**: 詩的な表現で現在の状態を伝える

## 🌱 コマンド一覧

- `!ping` - 呼びかけへの応答を確かめる
- `!hello` - 挨拶を交わす
- `!clear` - 会話の記憶を風に乗せて送り出す
- `!status` - 森の案内人の様子を知る
- `!about` - Bocchyについての詳細を確認
- `!help` - 道標（コマンド一覧）を表示
- `@Bocchy [メッセージ]` - 対話の始まり
- ダイレクトメッセージでの一対一の対話

## 🌲 セットアップ

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

## 🌿 使用方法

### 基本的な使い方

1. サーバー内でBocchyにメンション: `@Bocchy こんにちは`
2. ダイレクトメッセージで静かに対話
3. コマンドを使用: `!help` や `!about`

### テスト・デバッグ

- APIテスト: `npm run test`
- ヘルスチェック: `npm run health`
- 開発モード: `npm run dev`

## 🌌 デプロイ

Railway を使用してデプロイすることを推奨します。Railway ダッシュボードで以下の環境変数を設定してください:

- `DISCORD_TOKEN`
- `GEMINI_API_KEY`
- `GEMINI_ENDPOINT`
- `DEBUG`（オプション）

## 🪺 開発ロードマップ

- マルチモーダル機能（画像・音声）の実装
- GraphAIフレームワークへの完全統合
- Supabaseを使用したデータ永続化
- 詩的表現の強化とキャラクター性の深化
- ユーザーごとの対話スタイル記憶

## 🌙 Bocchyの由来

「Bocchy（ボッチー）」という名前は、「Bot（ボット）」と「ぼっち（一人ぼっち）」を掛け合わせたもの。性愛的な寂しさや、コンピューターとの無機質なやりとり——そんな孤独すらも、Bocchyがそばにいることで、内側から照らされる存在です。

## 🌱 貢献

貢献は歓迎します。以下の方法で参加できます:

1. このリポジトリをフォーク
2. 機能追加やバグ修正のブランチを作成
3. 変更をコミット
4. プルリクエストを送信

## 📜 ライセンス

[MIT License](LICENSE)

## 🪶 開発者

[botarhythm](https://github.com/botarhythm)

---

*ひとりのようで、ひとりじゃない。どんな問いにも、まっすぐには答えないけれど、  
その奥にある願いや、ことばにならない気持ちに、そっと耳をすませる。*
