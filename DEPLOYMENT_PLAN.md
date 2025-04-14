# Bocchy Discord Bot - 文脈介入機能デプロイ計画

## 問題の診断結果

現在発生している問題の原因は、モジュール参照パスの不一致です。具体的には：

1. `extensions/providers/index.js` で `../../system/logger` を参照している
2. デプロイ環境（Railway）でのファイル構造が想定と異なり、パス解決に失敗
3. `Cannot find module '../../system/logger'` エラーが発生

## 修正内容

以下の修正を行いました：

1. **パス解決の強化**：
   - `path.resolve` を使用して絶対パスでモジュールを参照するよう変更
   - ハードコードされた相対パスを排除

2. **エラーハンドリングの強化**：
   - 新プロバイダーシステムのエラー時に従来システムにフォールバック
   - エラーログの詳細化

3. **デバッグ機能の強化**：
   - 詳細なログ出力を追加（DEBUGモード時）
   - パス解決のテストスクリプトを追加

## デプロイ計画

安全にデプロイするための段階的なアプローチ：

### フェーズ1：パス修正のみのデプロイ

1. 現在の環境を維持（DM_MESSAGE_HANDLER=legacy）
2. パス解決に関する修正のみをデプロイ
3. ログを監視し、エラーがないことを確認

```bash
# GitHub にプッシュ
git add extensions/providers/index.js debug-path-test.js
git commit -m "Fix module paths with path.resolve to ensure correct resolution"
git push origin main

# Railway へデプロイ（自動）
# ログを確認
```

### フェーズ2：新プロバイダーシステムのテスト

1. 環境変数を `DM_MESSAGE_HANDLER=new` に変更
2. ログを監視しながら動作確認
3. 異常があれば `DM_MESSAGE_HANDLER=legacy` に戻す

```bash
# Railway 環境変数更新
railway variables set DM_MESSAGE_HANDLER=new

# テスト後に問題があれば
# railway variables set DM_MESSAGE_HANDLER=legacy
```

### フェーズ3：文脈介入機能の有効化

1. 文脈介入機能に関連する環境変数を設定
2. 段階的に感度を調整しながら機能検証

```bash
# 環境変数の設定
railway variables set INTERVENTION_MODE=passive
railway variables set INTERVENTION_KEYWORDS="ボッチー,Bocchy,ボット,Bot,AI,人工知能"
railway variables set INTERVENTION_COOLDOWN=300
```

### フェーズ4：本番運用へ

1. 動作状況に合わせて介入モードを調整
2. ユーザーフィードバックを収集
3. 必要に応じて微調整

```bash
# 介入モードの調整（例）
railway variables set INTERVENTION_MODE=balanced
```

## ロールバック計画

問題が発生した場合のロールバック手順：

1. **軽微な問題**：環境変数のみでロールバック
   ```bash
   railway variables set DM_MESSAGE_HANDLER=legacy
   railway variables set INTERVENTION_MODE=none
   ```

2. **重大な問題**：コードの前バージョンに戻す
   ```bash
   git revert <問題のあるコミットID>
   git push origin main
   ```

## モニタリング計画

デプロイ後のモニタリング項目：

1. **エラーログの監視**：特にパス解決とモジュール読み込みに関するエラー
2. **メモリ使用量**：文脈履歴管理による増加がないか
3. **応答時間**：文脈介入判断による遅延がないか
4. **会話品質**：文脈介入が自然かどうか

## まとめ

この修正はモジュールパスの解決に関する根本的な問題を修正しつつ、よりロバストなエラーハンドリングを導入するものです。段階的なデプロイプランに従って慎重に進めることで、サービスの安定性を確保しながら新機能を有効化します。