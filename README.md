# ボッチー Discord Bot

GraphAI × Discord マルチモーダルチャットボット「ボッチー」

## 機能

- Discord上でのメッセージに応答
- ダイレクトメッセージ（DM）への応答
- シンプルなコマンド処理
- メンション時の自動応答
- GraphAI統合によるインテリジェントな会話
- 会話コンテキストの管理
- HTTPサーバー機能による常時稼働

## セットアップ

1. Discord開発者ポータルでボットを作成
2. 必要なインテント設定:
   - MESSAGE CONTENT INTENT
   - SERVER MEMBERS INTENT
   - PRESENCE INTENT
   - DIRECT MESSAGES INTENT
3. 環境変数の設定
   - `.env.example`を`.env`にコピーして編集
   - `DISCORD_TOKEN`: Discordボットトークン
   - `GRAPHAI_API_KEY`: GraphAI APIキー
   - `GRAPHAI_ENDPOINT`: GraphAI APIエンドポイント
4. 依存関係のインストール: `npm install`
5. ボットの起動: `npm start`
6. 開発モードでの起動: `npm run dev`

## デプロイ

Railway を使用してデプロイされています。Railway ダッシュボードで以下の環境変数を設定してください:
- `DISCORD_TOKEN`
- `GRAPHAI_API_KEY`（または `GRAPH_AI_API_KEY`）
- `GRAPHAI_ENDPOINT`（または `GRAPH_AI_ENDPOINT`）
- `DEBUG`（オプション）

## コマンド一覧

- `!ping` - 接続テスト用コマンド
- `!hello` - 挨拶コマンド
- `!clear` - 会話コンテキストをクリア
- `@ボッチー [メッセージ]` - ボットにメンションして会話
- DM - ダイレクトメッセージで直接会話

## GraphAI統合

ボットはGraphAIフレームワークと統合されており、以下の機能を提供します:
- YAMLやJSONで定義されたデータフローグラフの活用
- ユーザーごとのコンテキスト管理
- 非同期データフロー処理
- エージェントワークフローの実行

## デバッグ

- Railway上のログビューでリアルタイムなデバッグ情報を確認
- 環境変数 `DEBUG=true` を設定して詳細なログを有効化

## 今後の予定

- マルチモーダル機能（画像・音声）の拡張
- GraphAI統合の機能強化
- カスタムコマンドの追加
- ユーザープリファレンス設定の実装
