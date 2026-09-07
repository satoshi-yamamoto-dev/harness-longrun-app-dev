---
layout: default
title: クイックスタート
---

[機能の概要](index.md) ｜ [クイックスタート](setup.md) ｜ [各機能の使い方](usage.md)

# クイックスタート

WindowsとMicrosoft Edgeを使い、最初のRunを実行する手順です。ターミナルの例はPowerShellです。Claude Code内で実行するコマンドは、その都度明記します。

## 1. 必要なツールを用意する

- Claude Code：インストールとログインを済ませます。
- Node.js 24以上とnpm。
- GitとGit Bash：Windowsでのシェル実行に使用します。
- Microsoft Edge：ブラウザ評価に使用します。
- 対象アプリが使うパッケージ管理ツール：pnpmなどを使う場合は別途用意します。

ターミナルで確認します。

```powershell
claude --version
node --version
npm --version
git --version
```

Claude Codeを初めて使う場合は、[公式の導入ガイド](https://code.claude.com/docs/en/quickstart)に従ってください。

## 2. Pluginをインストールする

Claude Code内で実行します。

```text
/plugin marketplace add satoshi-yamamoto-dev/harness-longrun-app-dev
/plugin install longrun-app-dev@harness-tools
```

Plugin一覧で `longrun-app-dev` がインストール・有効化されていることを確認します。

## 3. ブラウザ評価の依存を用意する

PowerShellで実行します。`C:\tools\longrun-deps` は自分が書き込める保存先に変更できます。対象アプリやPluginのキャッシュとは別のフォルダを使います。

```powershell
npm install --prefix C:\tools\longrun-deps --save-exact @playwright/mcp@0.0.80
$env:LONGRUN_PLAYWRIGHT_ROOT = 'C:\tools\longrun-deps'
```

この環境変数は現在のターミナルだけに設定されます。以降のClaude Codeはこのターミナルから起動してください。別のターミナルを開いた場合は環境変数を再設定します。

MCPのインストールは初回だけで構いません。Windowsでは既存のEdgeを使用します。macOS/LinuxではChromiumの別途準備が必要で、以下の手順の対象外です。

## 4. 対象プロジェクトを準備する

開発したいアプリのルートへ移動します。既存アプリでは、`package.json` と対応するlockfile、`build` と `start` または `dev` のスクリプトを確認します。

```powershell
cd C:\work\my-app
```

新規フォルダでGitをまだ使っていない場合だけ、初期化します。

```powershell
git init -b main
```

`.gitignore` に次の行を追加します。この例では設定と実行記録をローカルだけに保存します。

```gitignore
.longrun-app-dev/
```

プロジェクトのファイルと `.gitignore` をレビューしてコミットしてください。初回コミットがあり、次のコマンドでブランチ名が表示され、未コミット変更がない状態にします。

```powershell
git branch --show-current
git status --short
```

## 5. 初期設定を作る

同じPowerShellから対象プロジェクトでClaude Codeを起動します。

```powershell
claude
```

Claude Code内で実行します。

```text
/longrun-app-dev:init
```

`.longrun-app-dev/config.yaml` が生成されます。`models` の3つの `<model-id>` を、自分の環境で利用できるモデルIDに置き換えます。次に `limits` を編集します。初回の小さな試行では、例えば次の上限を設定できます。

```yaml
limits:
  maxQaRounds: 1
  maxDurationMinutes: 15
  maxCostUsd: 5
  maxConsecutiveErrors: 3
```

これは設定例です。この予算で完成することを保証するものではありません。雛形の上限を確認し、自分が使ってよい値を設定してください。他の設定項目は残します。

## 6. 開始前に確認する

ターミナルからの操作にはPlugin内のCLIを使います。以下の `<plugin-dir>` は、インストールされた `longrun-app-dev` のフォルダに置き換えます。Claude CodeでPluginのインストール先を確認し、その中に `runtime/dist/cli.js` があるフォルダを指定してください。

```powershell
node "<plugin-dir>/runtime/dist/cli.js" doctor
```

`inventory-available` なら必要な設定・依存の存在を確認できています。`incomplete` の場合は `missing-or-invalid` の項目を直します。認証やブラウザの実起動はこのコマンドでは確認しません。

## 7. 最初の開発を実行する

Claude Code内で、小さく具体的な要求を渡します。

```text
/longrun-app-dev:start タスクの追加・完了切替・削除ができるWebアプリを作ってください。データはブラウザに保存し、再読み込みしても残るようにしてください。
```

実行するとモデルを呼び出し、対象プロジェクトのコードを変更します。評価を通過すると `completed` が返ります。停止・失敗の場合は、返された `terminationReason` と保存されたレポートを確認します。

## 8. 結果を見る

返された `runRoot` の中にある `final-report.md` を開きます。実装・評価の回数、使用量、確認結果を読めます。アプリのコードは対象プロジェクトの作業ブランチに残ります。

[次へ：各機能の使い方 →](usage.md)
