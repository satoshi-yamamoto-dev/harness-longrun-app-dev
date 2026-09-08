# harness-longrun-app-dev

Planner、Generator、Evaluatorを分離し、アプリの実装と実動作の評価を反復するClaude Code Pluginです。現在は開発中です。

[ユーザーガイド](https://satoshi-yamamoto-dev.github.io/harness-longrun-app-dev/)を公開しています。

## インストールと初期構築

公開されたMarketplaceを使う場合、Claude Code内で次を実行します。`<github-owner>`は実際の公開先の所有者名に置き換えてください。公開・クリーン環境でのインストール検証は開発計画の後続項目です。

```text
/plugin marketplace add <github-owner>/harness-longrun-app-dev
/plugin install longrun-app-dev@harness-tools
```

追加で必要なツール導入、認証、ブラウザ、プロジェクト設定、確認方法は、[初期構築・環境再現ガイド](docs/setup.md)に記載しています。新しいPCへの導入時や更新時もこのガイドを確認してください。

`init`は設定ファイルを生成し、`start`はPlanner → Generator → Web QAの反復を実行します。統合動作はmock SDKで検証済みで、GeneratorとEvaluatorは個別の小規模実モデル試験を実施しています。開発環境ではPlaywright MCPと既存Edgeで操作・証拠保存を確認しました。Gitチェックポイント、停止・再開・残存ロック回収、終了Run削除を実装済みです。配布先のMCP依存は別フォルダから指定できます。テキストの秘密情報マスクと直接ツール操作の拒否を追加しました。長時間実モデル・クリーン環境の試験は実行可能な範囲で暫定完了とし、[観測結果と実利用時の再確認事項](docs/reviews/provisional-validation.md)を記録しています。画像の機密情報検出と任意コードの外部通信隔離は未実装です。

## 開発資料

- [文書の入口](docs/index.md)
- [開発者向けガイド](docs/developer-guide.md)

- [初期構築・環境再現ガイド](docs/setup.md)
- [開発計画と完了状況](docs/development-plan.md)
- [要件定義](docs/requirements.md)
- [Playwright MCP導入案](docs/reviews/m7-evaluator/environment.md)

追加の手動手順を必要とする変更では、実行場所・頻度・変更先・確認方法を初期構築ガイドへ追記する方針です。

