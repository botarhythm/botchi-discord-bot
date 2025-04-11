# ボッチー Discord Bot

GraphAI × Discord マルチモーダルチャットボット「ボッチー」

## 機能

- Discord上でのメッセージに応答
- ダイレクトメッセージ（DM）への応答
- シンプルなコマンド処理
- メンション時の自動応答
- HTTPサーバー機能による常時稼働

## セットアップ

1. Discord開発者ポータルでボットを作成
2. 必要なインテント設定:
   - MESSAGE CONTENT INTENT
   - SERVER MEMBERS INTENT
   - PRESENCE INTENT
   - DIRECT MESSAGES INTENT
3. 環境変数`DISCORD_TOKEN`にDiscordボットトークンを設定
4. `npm install`で依存関係をインストール
5. `npm start`でボットを起動

## デプロイ

Railwayを使用してデプロイされています。デプロイ後は自動的にHTTPサーバーとBot機能が起動します。

## コマンド一覧

- `!ping` - 接続テスト用コマンド
- `!hello` - 挨拶コマンド
- `@ボッチー` - メンションによる応答
- DM - ダイレクトメッセージによる対話

## デバッグ

ボットのログを確認して、動作状況や問題点を確認できます。Railway上のログビューを使用して、リアルタイムなデバッグ情報を表示します。

## 今後の予定

- マルチモーダル機能（画像・音声）の拡張
- GraphAI統合による高度な対話機能
- カスタムコマンドの追加
