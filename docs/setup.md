---
layout: default
title: クイックスタート
---

[機能の概要](index.md) ｜ [クイックスタート](setup.md) ｜ [各機能の使い方](usage.md)

# クイックスタート

用意済みのWebアプリのプロジェクトで、実装と評価を実行する手順です。以下はWindows・Microsoft Edgeを使う例です。

## 前提

Claude Code（ログイン済み）、Node.js 24以上とnpm、Git・Git Bash、Microsoft Edge、対象アプリのパッケージ管理ツールを用意してください。対象プロジェクトは、初回コミットのあるGitブランチ上で作業することを前提とします。

## 1. Pluginをインストールする

Claude Code内で実行します。

```text
/plugin marketplace add satoshi-yamamoto-dev/harness-longrun-app-dev
/plugin install longrun-app-dev@harness-tools
```

## 2. .gitignoreに追加する

対象プロジェクトの `.gitignore` に次の行を追加し、コミットします。開始時は未コミット変更がない状態にしてください。

```gitignore
.longrun-app-dev/
```

## 3. 初期設定する

対象プロジェクトでClaude Codeを開き、実行します。

```text
/longrun-app-dev:init
```

設定ファイルとブラウザ評価用の依存が自動で準備されます。初回はネットワーク接続が必要です。

生成された `.longrun-app-dev/config.yaml` を編集します。

- `models`：3つの `<model-id>` を利用するモデルIDに置き換えます。
- `limits`：費用・時間・評価回数の上限を設定します。

例えば、小さな試行には次のように設定します。

```yaml
limits:
  maxQaRounds: 1
  maxDurationMinutes: 15
  maxCostUsd: 5
  maxConsecutiveErrors: 3
```

## 4. 実装を依頼する

Claude Code内で、対象アプリへの要求を渡します。

```text
/longrun-app-dev:start タスク一覧にキーワード検索を追加してください。入力に応じてタイトルが一致するタスクを表示し、検索欄を空にすると全件表示に戻してください。
```

仕様作成 → 実装 → ブラウザ評価の順に進みます。評価を通過すれば完了し、問題があれば上限内で修正します。

## 5. 結果を見る

実行結果に表示された `runRoot` の `final-report.md` を開き、評価結果と未解決の問題を確認します。変更したコードは対象プロジェクトの作業ブランチに残ります。

環境確認、停止・再開などの操作は[各機能の使い方](usage.md)を参照してください。
