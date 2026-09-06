# M7-03a Playwright MCP導入・確認記録

確認日：2026-09-05。利用者向け追加手順は[初期構築ガイド](../../setup.md)。

ユーザの文書化方針と続行指示に基づき、開発リポジトリのルートで実行済み：

```powershell
pnpm --filter @harness-tools/longrun-app-dev add --save-exact @playwright/mcp@0.0.80
```

package.json、pnpm-lock.yaml、node_modulesを更新した。以後の復元は`pnpm install --frozen-lockfile`。毎Runの再インストールは不要。配布キャッシュへの配置はM10で別途検証する。

| 対象 | 実測 |
| --- | --- |
| MCP | 0.0.80、PluginからCLI解決成功 |
| Playwright / core | 1.63.0-alpha-2026-08-31、lockfileに記録 |
| Node / OS | v24.20.0 / Windows x64 |
| ブラウザ | 既存Edge、UA Edge/152.0.0.0。パッチ版はUAから確定できない |
| 起動 | headless・isolated、msedge、追加ダウンロードなし |
| 通信・操作 | initialize、tools/list、navigate、snapshot、click、PNG保存成功 |

```powershell
pnpm build
node plugins/longrun-app-dev/scripts/check-evaluator-environment.mjs
node plugins/longrun-app-dev/scripts/check-playwright-connection.mjs
node plugins/longrun-app-dev/scripts/check-qa-fixture.mjs
```

実行場所はリポジトリルート。モデル利用費は発生しない。最初の確認は実行ファイル検出のみ、後二つはローカルHTTP fixtureと実ブラウザを起動する。証拠は`.longrun-app-dev/`下に残す。

接続成功記録は`playwright-checks/m7-q0L0fQ/check.json`。先行試験でclick/typeには`ref`ではなく`target`が必要と判明し修正。画像保存は`scale: css`と絶対filenameを指定する。相対filenameではoutput-dir指定だけで意図した保存先にならなかった。

正常・故障fixtureおよび実モデルの詳細は[評価記録](review.md)。ブラウザ版固定による別PC再現と、配布済みPluginだけからの構築は未検証。
