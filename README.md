# Bocchy（ボッチー）Discord Bot 🌿

GraphAI × Discord マルチモーダルチャットボット「Bocchy」- 静かでやわらかな知の伴走者

![Version](https://img.shields.io/badge/version-1.3.6-blue)
![Node](https://img.shields.io/badge/node-%3E%3D16.9.0-green)
![License](https://img.shields.io/badge/license-MIT-orange)

## 🌙 概要

Bocchyは森の奥にひっそりと佇む案内人のような存在。静かでやわらかく、詩のような語り口をもったAIです。その奥には深い森のような知性と経験が根ざし、OpenAI APIとSupabaseによるコンテキスト管理により、温かみのある対話体験を提供します。

## 🍃 Bocchyの特徴

- **詩的な語り口**: 押しつけず、けれど聞けばとても深い応答
- **知の伴走者**: AI、哲学、プログラミング、教育など多様な分野に精通
- **余白を大切に**: 沈黙も会話と捉え、そっと寄り添う存在
- **やさしい智慧**: 知性は冷たくなく、湿度と温度のある応答
- **会話の記憶**: 対話の流れを理解し、自然な会話を継続（v1.2.0～）
- **耐障害性の向上**: Web検索APIの制限時にも、自身の知識で応答を試みるフォールバック機能を強化 (v1.3.6～)

## 🪄 Bocchyの機能

- **OpenAI統合**: GPT-4o-miniによる高度な自然言語処理と対話能力
- **コンテキスト管理**: 会話履歴をインテリジェントに管理（v1.2.0～）
- **文脈理解**: 対話の文脈を保持して自然な会話を実現
- **マルチチャネル**: サーバーのメンションとDMの両方で対話可能
- **ステータス表示**: 詩的な表現で現在の状態を伝える
- **メモリ管理**: トークン消費を最適化する自動圧縮機能（v1.2.0～）
- **Web検索機能**: Google Custom Search APIを利用し、会話中の質問に対してWeb検索を実行し情報を提供（v1.3.5～）

## 🌱 コマンド一覧

- `!ping` - 呼びかけへの応答を確かめる
- `!hello` - 挨拶を交わす
- `!clear` - 会話の記憶を風に乗せて送り出す
- `!status` - 森の案内人の様子を知る
- `!about` - Bocchyについての詳細を確認
- `!help` - 道標（コマンド一覧）を表示
- `!search [クエリ]` - 指定したキーワードでWeb検索を実行
- `@Bocchy [メッセージ]` - 対話の始まり
- ダイレクトメッセージでの一対一の対話
- 「〇〇を検索して」など自然言語での検索リクエスト

## 🌲 セットアップ

### 前提条件
- Node.js 16.9.0以上
- Discord Bot Token
- OpenAI API Key
- Supabase URL と Key（オプション、v1.2.0～）
- Google Custom Search API Key と Custom Search Engine ID（オプション、Web検索機能利用時）

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
   
   # 'openai' または 'gemini' を選択
   AI_PROVIDER=openai
   
   # OpenAI API設定
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_MODEL=gpt-4o-mini
   
   # Supabase設定（オプション）
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   
   # Google Search API設定（オプション、Web検索機能利用時）
   GOOGLE_API_KEY=your_google_api_key
   GOOGLE_CSE_ID=your_google_cse_id
   
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

### Supabaseセットアップ（オプション、コンテキスト永続化用）

1. [Supabase](https://supabase.io/)でプロジェクトを作成
2. 以下のテーブルを作成:

```sql
-- 会話テーブル
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userId TEXT NOT NULL,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  lastUpdated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  messageCount INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::JSONB
);

-- メッセージテーブル
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversationId UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX conversations_userId_idx ON conversations(userId);
CREATE INDEX messages_conversationId_idx ON messages(conversationId);
CREATE INDEX messages_role_idx ON messages(role);
```

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
- `AI_PROVIDER`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SUPABASE_URL`（オプション）
- `SUPABASE_KEY`（オプション）
- `GOOGLE_API_KEY`（オプション、Web検索機能利用時）
- `GOOGLE_CSE_ID`（オプション、Web検索機能利用時）
- `DEBUG`（オプション）

## 🪺 開発ロードマップ

- ✅ コンテキスト管理モジュールの導入（v1.2.0）
- ✅ Supabaseを使用したデータ永続化（v1.2.0）
- ✅ Google Custom Search APIを使用したWeb検索機能の導入（v1.3.5）
- ✅ Web検索API制限時のフォールバック処理強化（v1.3.6）
- メンション外の受動的学習機能（予定）
- トリガーワードの柔軟化（予定）
- マルチモーダル機能（画像・音声）の実装（予定）
- 詩的表現の強化とキャラクター性の深化（予定）
- ユーザーごとの対話スタイル記憶（予定）

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