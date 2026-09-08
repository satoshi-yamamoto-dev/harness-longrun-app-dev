---
layout: default
title: クイックスタート
---

[機能の概要](index.md) ｜ [クイックスタート](setup.md) ｜ [各機能の使い方](usage.md)

# クイックスタート

用意済みのWebアプリのプロジェクトで、実装と評価を実行する手順です。以下はWindows・Microsoft Edgeを使う例です。

## 前提

Claude Code（ログイン済み）、Node.js 24以上とnpm、Git・Git Bash、Microsoft Edge、対象アプリのパッケージ管理ツールを用意してください。対象プロジェクトは、初回コミットのあるGitブランチ上で作業することを前提とします。

## 1. ハーネスをインストールする

Claude Code内で実行します。

```text
/plugin marketplace add satoshi-yamamoto-dev/harness-longrun-app-dev
/plugin install longrun-app-dev@harness-tools
```

続けて、対象プロジェクトでClaude Codeを開いて初期化します。

```text
/longrun-app-dev:init
```

設定ファイルとブラウザ評価用の依存が自動で準備されます。初回はネットワーク接続が必要です。実行前に `.longrun-app-dev/config.yaml` のモデルと上限を設定してください。設定方法は[各機能の使い方](usage.md#1-初期設定するinit)を参照してください。

## 2. .gitignoreに追加する

ハーネスが作成する設定、依存、実行記録がGitの管理対象にならないよう、対象プロジェクトの `.gitignore` に次の行を追加します。

```gitignore
.longrun-app-dev/
```

これにより、`.longrun-app-dev/` 配下はコミットされません。ハーネスの開始時には、`.gitignore` を含むそれ以外の変更が未コミットで残っていない状態にしてください。

## 3. 実装を依頼する

Claude Code内で、対象アプリへの要求を渡します。次はキーワード検索を追加する場合の例です。

```text
/longrun-app-dev:start タスク一覧にキーワード検索を追加してください。入力に応じてタイトルが一致するタスクを表示し、検索欄を空にすると全件表示に戻してください。
```

仕様作成 → 実装 → ブラウザ評価の順に進みます。評価を通過すれば完了し、問題があれば上限内で修正します。

## 4. 実行結果を確認する

実行結果に表示された `runRoot` の `final-report.md` を開きます。完了状態、ブラウザ評価、未解決の問題、費用、実行時間を確認できます。変更したコードは対象プロジェクトの作業ブランチに残ります。

環境確認、停止・再開などの操作は[各機能の使い方](usage.md)を参照してください。
