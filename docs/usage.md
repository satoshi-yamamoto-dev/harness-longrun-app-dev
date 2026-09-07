---
layout: default
title: 各機能の使い方
---

[機能の概要](index.md) ｜ [クイックスタート](setup.md) ｜ [各機能の使い方](usage.md)

# 各機能の使い方

すべての操作は、開発対象アプリのプロジェクトルートで行います。`<plugin-dir>` はインストールされたPluginのフォルダ、`<run-id>` は `status` で確認した実行IDに置き換えてください。

Claude Code内の `/longrun-app-dev:...` コマンドは `init` と `start` の2つです。それ以外はPowerShellなどのターミナルからCLIで実行します。

## 1. 初期設定する：init

Claude Code内で実行します。

```text
/longrun-app-dev:init
```

`.longrun-app-dev/config.yaml` を作成します。初回は `initialized`、既にある場合は `already-initialized` が返り、既存の設定は上書きしません。

| 設定 | 用途 |
| --- | --- |
| `models.planner` | 仕様を作るモデル |
| `models.generator` | 実装するモデル |
| `models.evaluator` | 評価するモデル |
| `limits.maxCostUsd` | Runの費用上限（米ドル） |
| `limits.maxDurationMinutes` | Runの時間上限（分） |
| `limits.maxQaRounds` | 評価の最大回数 |
| `limits.maxConsecutiveErrors` | 連続APIエラーの上限 |
| `quality.thresholds` | 品質評価の合格点 |

評価は必須です。`evaluation.mode` は `required` のまま使います。設定を編集したら、次の `doctor` で確認します。

## 2. 環境を確認する：doctor

```powershell
node "<plugin-dir>/runtime/dist/cli.js" doctor
```

設定、Git、固定版Playwright MCP、WindowsのEdgeの存在を確認します。`incomplete` なら不足する項目を修正してください。モデルやブラウザは起動しません。macOS/Linuxではブラウザ検出が未対応のため、ブラウザは `not-tested` になります。

## 3. 開発を開始する：start

Claude Code内で実行します。

```text
/longrun-app-dev:start メモの追加・編集・削除とキーワード検索ができるWebアプリを作ってください。
```

要求には「誰が使うか」「必要な操作」「データの保存方法」「完成時に確認したいこと」を含めると、意図を伝えやすくなります。

初回コミットのあるGitリポジトリで、名前付きブランチと未コミット変更がない状態が必要です。実行すると専用ブランチを作り、仕様作成・実装・評価へ進みます。評価で不合格になった場合は、残りの予算内で修正します。

ターミナルから開始する場合も、同じ機能を使えます。

```powershell
node "<plugin-dir>/runtime/dist/cli.js" start "メモの追加・編集・削除とキーワード検索ができるWebアプリを作ってください。"
```

## 4. 状況を確認する：status

実行中は別のターミナルを対象アプリのルートで開きます。

```powershell
node "<plugin-dir>/runtime/dist/cli.js" status
node "<plugin-dir>/runtime/dist/cli.js" status "<run-id>"
```

一覧または指定したRunについて、実行ID、状態、実装・評価の回数、使用量、更新時刻が返ります。

| 状態 | 意味 |
| --- | --- |
| `COMPLETED` | 評価を通過して完了 |
| `STOPPED` | 手動停止、または上限到達によって停止 |
| `FAILED` | エラーで終了 |

`status` が示すのは保存済みの状態です。実行中の状態が表示されていても、プロセスの生存を確認した結果ではありません。

## 5. レポートとアプリを確認する

実行記録は `.longrun-app-dev/runs/<run-id>/` に保存されます。

| ファイル・フォルダ | 確認できる内容 |
| --- | --- |
| `final-report.md` | 全体の結果、使用量、未解決の問題 |
| `product-spec.md` | 作成された仕様 |
| `build/round-N.md` | 各実装回の報告 |
| `qa/round-N.md` | 各評価回の結果 |
| `qa/evidence/` | スクリーンショットなどの証跡 |
| `logs/` | 実行ログ |

`N` は回数です。最初に `final-report.md` を読み、必要に応じて個別のレポートを開きます。

アプリのコードは作業ブランチに保存されます。`git status` と `git log` で変更を確認し、アプリの `package.json` のスクリプトで起動してください。例えばnpmの `start` スクリプトを持つアプリなら `npm run start` を使います。Run終了時には評価用に起動したアプリは停止します。

## 6. 実行を止める：stop

別のターミナルから実行します。

```powershell
node "<plugin-dir>/runtime/dist/cli.js" stop
```

`stop-requested` は停止要求を受け付けたことを示します。`status` で `STOPPED` を確認してから次の操作に進みます。

## 7. 保存した実行を再開する：resume

```powershell
node "<plugin-dir>/runtime/dist/cli.js" resume "<run-id>"
```

保存された処理の区切りから再開します。前回までに使った費用と時間を引き継ぎ、残りの予算を使います。中断した会話の任意の位置から続ける機能ではありません。

完了済みのRun、再開に必要な保存情報がないRun、Gitの履歴・ブランチ・作業状態が一致しないRunは再開できません。再開時はRunに保存された設定を使うため、現在の `config.yaml` を編集しても、そのRunの予算は増えません。

## 8. 強制終了後のロックを回収する：recover-lock

ロックが残っていて開始できない場合に使います。

```powershell
node "<plugin-dir>/runtime/dist/cli.js" recover-lock
```

同じPC上で所有プロセスが終了していることを確認できたロックだけを退避します。成功すると `lock-recovered` が返ります。プロセスが生存している場合や確認できない場合は拒否されます。

## 9. 不要な実行記録を削除する：clean

必要なレポート・証跡を保管した後で実行します。

```powershell
node "<plugin-dir>/runtime/dist/cli.js" clean "<run-id>"
```

指定した終了済みRunの記録を削除し、`cleaned` を返します。アプリのコードやGitブランチは残ります。実行中のRunや、プロジェクトのロックがある場合は削除できません。

## 困ったとき

| 症状 | 確認すること |
| --- | --- |
| モデルの未設定エラー | `models` の3つのプレースホルダーを置き換えたか |
| 未コミット変更のエラー | `git status --short` で差分を確認し、保存・レビュー・コミットしたか |
| MCPが見つからない／版が違う | `LONGRUN_PLAYWRIGHT_ROOT` と `@playwright/mcp@0.0.80` の導入先が一致しているか |
| 別ターミナルでだけ動かない | 環境変数を設定し直したか、Nodeとnpmの参照先が同じか |
| 評価前のアプリ起動に失敗 | アプリの依存、`build`、`start` または `dev` スクリプトと `logs/` を確認 |
| 上限に達して停止 | レポートを確認し、要求を小さくするか、次のRunの上限を見直す |

[← クイックスタート](setup.md) ｜ [機能の概要に戻る](index.md)
