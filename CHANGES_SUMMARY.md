# Bocchy Discord Bot - 修正内容まとめ

## 1. ファイル修正

### extensions/providers/index.js

```javascript
// 修正前
const logger = require('../../system/logger');

// プロバイダー登録
const PROVIDERS = {
  // 標準プロバイダー
  'openai': '../../openai-service.js',
  'gemini': '../../gemini-service.js',
  // 拡張プロバイダー
  'openai-memory': './openai-memory-provider.js'
};
```

```javascript
// 修正後
// Using path.resolve for more reliable path resolution
const path = require('path');
const logger = require(path.resolve(__dirname, '../../system/logger'));

// プロバイダー登録 - 絶対パスに変換
const PROVIDERS = {
  // 標準プロバイダー
  'openai': path.resolve(__dirname, '../../openai-service.js'),
  'gemini': path.resolve(__dirname, '../../gemini-service.js'),
  // 拡張プロバイダー
  'openai-memory': path.resolve(__dirname, './openai-memory-provider.js')
};
```

## 2. 新規ファイル作成

### debug-path-test.js

パス解決に関する問題を診断するためのテストスクリプトを作成しました:

```javascript
/**
 * Bocchy Discord Bot - パス解決デバッグテスト
 * モジュールパスの解決問題を診断するテストスクリプト
 */

const path = require('path');
const fs = require('fs');

// 基本情報の表示
console.log('=== 環境情報 ===');
console.log(`現在の作業ディレクトリ: ${process.cwd()}`);
console.log(`このファイルの場所: ${__dirname}`);
console.log(`Node.jsバージョン: ${process.version}`);
// ... 以下省略 ...
```

### DEPLOYMENT_PLAN.md

段階的なデプロイ計画を文書化したファイルを作成しました。主な内容：

1. 問題の診断結果
2. 修正内容の概要
3. フェーズ分けされたデプロイ計画
4. ロールバック手順
5. モニタリング計画

## 3. 修正の効果

1. **モジュール解決の信頼性向上**:
   - 相対パスではなく絶対パスを使用することで環境間の差異に強くなる
   - `path.resolve` と `__dirname` を使って一貫したパス解決を実現

2. **エラー耐性の向上**:
   - 新プロバイダーシステムでのエラー発生時にレガシーシステムへ自動フォールバック
   - 詳細なエラーログで原因特定を容易に
   - トラブルシューティングに役立つデバッグ情報の強化

3. **ユーザー体験の向上**:
   - エラー時でも可能な限りサービスを継続
   - 段階的デプロイによる安定性確保
   - 機能の段階的有効化によるリスク軽減

## 4. 今後の展望

この修正により、文脈介入機能を安全に導入する基盤が整いました。今後は以下の領域でさらなる改善が可能です：

1. **文脈理解の精度向上**:
   - より高度な会話分析アルゴリズムの導入
   - ユーザー嗜好に基づく介入調整

2. **プラットフォーム拡張**:
   - 同じ文脈理解機能を他のプラットフォーム（LINE、Slack等）へ展開
   - プラットフォーム固有の特性に合わせた最適化

3. **パフォーマンス最適化**:
   - メモリ使用量と応答時間のさらなる改善
   - 大規模サーバーでのスケーラビリティ強化

## 5. まとめ

今回の修正は、単なるバグ修正にとどまらず、Bocchy Discord Botの全体的な安定性とレジリエンスを向上させるものです。特に、異なる環境での一貫した動作を保証するパス解決の改善と、エラー発生時の優雅な劣化（グレースフルデグラデーション）の実現は、ユーザー体験を損なわずに新機能を導入するために不可欠なステップでした。

段階的デプロイ計画に従い、慎重にこれらの変更を本番環境に適用することで、サービスの安定性を維持しながら機能拡張を実現します。

# 変更概要 (v1.3.6)

## 主な変更点

1.  **Web検索エンジンをGoogle Custom Search APIに一本化:**
    *   従来併用していたBrave Search APIを廃止しました。
    *   関連ファイル (`brave_search.py`, `test_brave_search.py`) を削除しました。
    *   設定ファイル (`config/env.js`, `.env`) からBrave Search関連の記述を削除しました。
    *   ドキュメント (`README.md`, `DEPLOYMENT_PLAN.md`) を更新し、Google Search APIに統一しました。

2.  **検索APIエラー時のフォールバック処理強化:**
    *   **背景:** Web検索API (Google Search) がレート制限等で利用不可になった際に、ボットが固定のエラーメッセージしか返せず、応答品質が低下する問題がありました。
    *   **改善:**
        *   `search-service.js` でAPIエラーの種類 (特にレート制限 `RATE_LIMITED`) を識別できるように修正しました。
        *   `ai-service.js` で検索結果を受け取る際に、エラータイプを確認するように修正しました。
        *   検索失敗時（特にレート制限時）に、AIへの指示（システムプロンプト）を動的に変更し、「検索結果は利用できないが、自身の知識で応答する」ように指示するロジックを追加しました。
    *   **効果:** API制限時でも、ボットは状況を説明しつつ自身の知識に基づいた応答を試みるようになり、応答の途絶を防ぎます。

## 実装詳細

*   `search-service.js` (`performSearch` / `provideSearchForAI`):
    *   `catch` ブロックで `error.response.status === 429` を検知し、結果オブジェクトに `errorType: 'RATE_LIMITED'` を追加。
    *   その他のHTTPエラーやタイムアウトなども識別し、適切な `errorType` を付与。
*   `ai-service.js` (`getResponseWithSearch`, `getResponse`):
    *   `searchService` からの結果オブジェクトで `errorType` を確認。
    *   `errorType` に応じて `searchContext` (AIへの追加指示) とシステムプロンプトの内容を動的に変更。
        *   成功時: 「検索結果を最優先で参照」
        *   レート制限時: 「検索は制限中。知識のみで回答」
        *   その他エラー時: 「検索は失敗。知識のみで回答」
        *   検索未実行時: 「検索は利用不可。知識のみで回答」

## 今後の課題

*   検索トリガー条件のさらなる精査（不要な検索を減らす）。
*   キャッシュ戦略の最適化（API負荷軽減）。

## 運用プロセスに関する注記

*   **デプロイ手順:** 開発や修正が完了した後、変更内容をGitHubにプッシュすることでRailwayへの自動デプロイがトリガーされます。ただし、本番環境への反映となるため、**プッシュ実行前には必ずユーザーに最終確認を求め、承認を得てから実行する**こととします。