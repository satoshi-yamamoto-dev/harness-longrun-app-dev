# 開発者向けガイド

## 構成

`plugins/longrun-app-dev/runtime/src`が実装、同Pluginの`tests`が単体・統合・配布ファイル試験、`schemas`が保存契約、`prompts`と`rubrics`がモデル指示と評価基準です。`scripts/lib/solo-benchmark.mjs`は同条件の単一Agent比較を担当します。

Planner → Generator → EvaluatorをOrchestratorが接続し、QAが失敗した場合だけ残予算内で修正Buildへ戻ります。保存状態の復元は会話履歴に依存しません。Generatorの自己評価でQAを合格に変更してはいけません。

## 変更と検証

リポジトリルートで `pnpm install --frozen-lockfile`、`pnpm check`、`pnpm --filter @harness-tools/longrun-app-dev test:unit` を実行します。Node 24以上とpnpm 11.19.0を使用します。親のNodeだけでなく、子プロセスが使うnpmの起動も確認してください。

CIはWindows/Linuxで型チェック・ビルド・構成検証・全テストを実行します。配布試験はpackage.jsonのfiles一覧だけを一時ディレクトリに複製してCLIを起動し、開発node_modulesがなくてもinit/status/doctorへ到達することを確認します。Claude Marketplaceへの実登録や認証を伴うE2Eとは別の試験です。

通常のテストは実モデルを呼びません。実評価スクリプトは費用と時間上限を明示して別に実行します。初回pilotの承認済み範囲は[比較手順](reviews/m9-benchmark-protocol.md)と開発計画を参照します。再試行による増額はその範囲に含めません。

## 安全性の境界

SDK PreToolUseで宣言外ツール、明示的な公開・転送・破壊的DBコマンド、保護パス、外部URLへの直接移動を拒否します。ユーザー／プロジェクトのSDK設定は自動読込しません。これはOS隔離ではなく、package scripts、生成コード、ブラウザ内部の通信を網羅しません。秘密情報と本番データを持たない検証環境を用意してください。

テキスト成果物とログは保存前にマスクします。画像や任意の個人情報の完全な検出は未対応です。変更時は保存・表示経路とテストを合わせて更新します。SDKのhook形式は[公式仕様](https://code.claude.com/docs/en/agent-sdk/hooks)に基づきます。

## 文書公開

GitHub Pagesは対象ブランチの `/docs` を公開元にします。公開する利用ガイドは[機能の概要](index.md)、[クイックスタート](setup.md)、[各機能の使い方](usage.md)の順に構成します。要件定義・開発計画・本書・architecture・reviewsは、docs/_config.ymlのexcludeで公開対象から除外しています。リンクを外すだけでなく、生成されるサイトに含めない方針です。

過去の環境構築記録はsetup-history.mdに保管し、公開対象から除外しています。過去時点の記録であり、現在の利用手順はsetup.mdとusage.mdを参照してください。
