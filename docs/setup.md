# 初期構築・環境再現ガイド

更新日：2026-09-06。対象：開発中のlongrun-app-dev 0.1.0。

ステータス：実装に合わせて更新済み。環境再構築試験は実行できた範囲で暫定完了とし、実利用での確認事項を[検証記録](reviews/provisional-validation.md)へ記載しています。

この文書は、Marketplace追加とPluginインストール以外に必要な作業を記録する正本です。追加手順がある場合は、実行場所、必要になるタイミング、変更先、成功の確認方法をここへ追記します。会話の記憶や特定PCの設定だけに依存しない運用とします。

## 1. 現在使える範囲

| 項目 | 状況 |
| --- | --- |
| Marketplace登録・Pluginインストール | ローカル開発環境で確認済み。GitHub公開と新しい環境での最終検証は未完了 |
| `init`／`start` | initで設定生成、startで統合Runを実行。依存導入は自動化未完了 |
| Planner／Generator | 個別のruntime部品を実装。Generatorの小規模実モデル試験は成功 |
| Evaluator | 評価・証拠検証・保存を実装。実MCP操作と小規模実モデル試験済み。人間校正は未完了 |
| `doctor`／`status` | CLI実装済み。依存の存在・保存状態を確認。認証とブラウザ起動は別確認 |
| 再開・停止・clean | 未実装 |
| 配布先へのMCP・ブラウザ導入 | 手順と配置方式の確定、実装、検証が必要 |

現時点で、以下の2コマンドの後に本番利用まで完了する手順は確立していません。未実装のコマンドを初期構築の必須手順として実行しないでください。

## 2. PC・実行環境ごとの準備

既に導入済みなら再インストールは不要です。新しいPC、CI、コンテナではそれぞれ確認します。

| 前提 | 用途・準備 | 確認方法 |
| --- | --- | --- |
| Claude Code | PluginのホストとAgent SDKの実行先。公式手順で導入する | ターミナルで`claude --version` |
| Claude認証 | 実モデル呼び出し用。Claude Codeのログインを完了する | `claude auth status`の`loggedIn`を確認。出力にはアカウント情報があるため、そのまま公開しない |
| Node.js 24以上 | PluginのNode runtimeを起動するために必要 | `node --version` |
| Git | Marketplace取得と対象プロジェクトの履歴管理 | `git --version` |
| POSIX互換シェル | 現在のPluginのbinラッパーとBashツール経路で使用。Windowsの基準環境はGit for WindowsのGit Bash | Git Bash内で`sh --version`、`node --version` |
| 対象アプリのパッケージ管理ツール | Web adapterがpackage.json／lockfileに応じて使うnpm、pnpm等 | 対象ツールの`--version` |
| パッケージ取得・モデル接続先へのネットワーク | 初期導入と実モデル実行に必要。プロキシ等がある環境では接続確認 | パッケージ導入結果と、明示的な上限を設定した試験結果で確認 |

Claude Codeの導入とログインは[公式Quickstart](https://code.claude.com/docs/en/quickstart)を参照してください。ログインは`claude`を起動して案内に従います。資格情報はローカルの認証機構で管理し、リポジトリや設定例にコピーしません。

このリポジトリの開発・ビルドにはpnpm **11.19.0**を使います。配布済みruntimeを使う一般利用者に、開発リポジトリの依存導入を必須とはしていません。ただし配布先のMCP導入はまだ完成していません。

## 3. Marketplace追加とPluginインストール

公開後はClaude Code内で実行します。ターミナル用のコマンドではありません。

```text
/plugin marketplace add <github-owner>/harness-longrun-app-dev
/plugin install longrun-app-dev@harness-tools
```

`<github-owner>`は公開先の所有者名です。`harness-tools`はMarketplace定義の名前です。チーム共有／個人利用など、選択したインストールスコープも環境記録へ残してください。スコープとPlugin管理の操作は[Claude Code公式ガイド](https://code.claude.com/docs/en/discover-plugins)を参照してください。

Claude CodeのPlugin一覧で名前とバージョンを確認します。現在のソースではinitは`initialized`または`already-initialized`を返し、startは実モデルを呼び出します。旧キャッシュの`accepted`応答は新runtimeの動作確認にはなりません。

## 4. Playwright MCPとブラウザ

### 4.1 現在の導入方針

Web UIの評価にはMCPサーバーと対応ブラウザが別途必要です。現在のPluginインストールはこれらを自動導入しません。毎回のRunで入れ直す必要はありませんが、新環境やバージョン変更時には確認が必要です。

- MCPは`@playwright/mcp@0.0.80`を導入済みで、依存宣言・lockfileに固定しています。開発環境での導入です。
- 初回接続確認は既存Edgeで成功しました。既存のログインプロファイルを共有せず、headless・isolatedモードで起動します。
- 現在のEdge利用はブラウザのバージョンまで固定しません。厳密な再現性を要求する評価用環境では、Playwright対応ブラウザの版・取得方法も固定して検証する必要があります。これは未実装です。

版、変更内容、導入後の確認項目は[Playwright MCP導入・確認手順](reviews/m7-evaluator/environment.md)に記録しています。

### 4.2 開発リポジトリでの導入記録

以下はM7の開発作業として依存を追加するコマンドです。**対象アプリのディレクトリやPluginキャッシュ内では実行しません。** 2026-09-05に開発リポジトリのルートで実行済みです。再構築時は後述のfrozen-lockfileを使います。

```powershell
pnpm --filter @harness-tools/longrun-app-dev add --save-exact @playwright/mcp@0.0.80
```

Pluginの`package.json`、ルートの`pnpm-lock.yaml`、ローカルの依存パッケージが更新されます。以後、同じ依存構成を復元する開発者は`pnpm install --frozen-lockfile`を使います。

配布済みPluginの利用者向けには、インストール先でMCPを利用可能にする配置・セットアップ手順がまだありません。この開発用コマンドを利用者向けの完成手順として読み替えないでください。自動化または手動手順を実装した際に、本節へ具体的な操作を追記します。

### 4.3 現在の事前確認

開発リポジトリで依存導入とruntimeビルド後に実行します。

```powershell
pnpm build
node plugins/longrun-app-dev/scripts/check-evaluator-environment.mjs
```

このスクリプトは固定版MCPの解決とWindowsのEdge実行ファイルの存在を確認します。MCP不足などでは終了コード2となります。`executable-found`はブラウザ起動成功を意味せず、`protocolAndLaunch: not-tested`なら通信・操作は未確認です。macOS／Linuxのブラウザ検出は現スクリプトの対象外です。

初期構築の確認を完了とするには、実MCP初期化、ツール一覧取得、ローカルアプリへの遷移、操作、snapshot、スクリーンショット保存、プロセス終了まで確認する必要があります。モデルを呼び出さずに`node plugins/longrun-app-dev/scripts/check-playwright-connection.mjs`を実行すると、ローカルfixtureの起動・MCP通信・操作・証拠保存・終了まで確認できます。証拠は`.longrun-app-dev/playwright-checks/`以下です。

## 5. 対象プロジェクトごとの準備

| 項目 | 設定内容 | 現状 |
| --- | --- | --- |
| 作業場所 | 対象アプリのプロジェクトルート。既存の変更を把握する | Git保護の完全な実装はM10 |
| 設定ファイル | `.longrun-app-dev/config.yaml`。雛形は`plugins/longrun-app-dev/templates/project-config.yaml` | `init`が雛形を生成。既存設定は上書きしない。`start`が自動読込・検証する |
| モデル | planner／generator／evaluatorのモデル指定。雛形の`<model-id>`を利用可能な値に置換 | モデル利用権限は環境で確認が必要 |
| 上限 | 最大費用、最大時間、最大QA回数など | 雛形の150ドル・240分を利用者の承認済み上限と見なさない |
| Webコマンド | package.jsonのbuild、test、lint、startまたはdevと対応lockfile | Web adapterとOrchestratorを統合済み。現在はpackage scriptsの検出経路を使用 |
| 外部サービス | アプリが実際に必要とする認証、DB、サービス、テストデータ | アプリごとに設定・確認する。不要なサービスは導入しない |

対象アプリのルートで`/longrun-app-dev:init`を実行し、生成された設定のモデルIDと費用・時間上限を編集します。初回commitのあるGitリポジトリとMCPが必要です。`/longrun-app-dev:start 要求文`は実モデルを呼び出し、費用が発生し得ます。Git保護は未完成のため、現段階の実験は専用の使い捨てプロジェクトで行います。`doctor`と`status`の確認方法は第9節を参照してください。

## 6. 開発環境を再構築する手順

同じソースとlockfileがGit等で保管されていることを前提に、作業コピーのルートで実行します。GitHub公開前は、取得できるローカルのソースを使ってください。

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm check
pnpm --filter @harness-tools/longrun-app-dev test:unit
```

成功条件は、依存導入・検証・ビルド・テストが終了コード0で完了することです。これらのテストは実モデル評価やMCPブラウザ起動をすべて代替するものではありません。実モデル試験スクリプトはClaude利用枠を消費するため、通常の初期構築では自動実行しません。

現Windows環境ではVoltaを使用していますが、Volta自体を必須とはしません。Volta経由で管理ディレクトリへのアクセスエラーが出る場合は、そのPCの権限・設定を確認します。別Nodeでの検証成功を、Volta経由の成功として記録しないでください。

## 7. 保存先と環境記録

| 内容 | 保存先・管理方法 |
| --- | --- |
| 依存の版 | package.jsonとpnpm-lock.yaml。Gitで保管する |
| MCPの起動設定 | 現在はruntimeのevaluator接続コード。CLIは実行環境で解決する |
| インストールした実体 | node_modules／pnpmストア。Git管理対象外、lockfileから再取得する |
| ブラウザ | PCにインストールされたEdge。版は別途記録する |
| プロジェクト共有設定 | config.yamlを共有する設計。ただし現在の開発リポジトリは`.longrun-app-dev/`全体をignoreしている。設定の共有とRun成果物の除外を両立する処理は未整備 |
| 認証情報 | 認証ツールまたは環境固有の安全な保存先。Gitや試験レポートに含めない |
| 証拠・Run結果 | `.longrun-app-dev/`以下。Git管理対象外。必要な試験結果は要約してdocsへ残す |
| 導入手順・検証結果 | この文書、開発計画、docs/reviews。Gitに登録して履歴を残す |

再現用の記録には、OS／CPUアーキテクチャ、ソースのcommitまたは版、Plugin版、インストールスコープ、Node・pnpm・Claude Codeの実測版、MCP版、ブラウザの実測版、導入コマンド、確認日、成否、ログの保存場所を含めます。環境変数は必要な名前だけを記録し、シークレットの値は残しません。

この文書の作成時点ではリポジトリのファイルはGit未追跡です。ファイルに保存しただけでGit履歴やリモートのバックアップができた状態にはなりません。

## 8. 更新時と公開前の確認

Plugin、MCP、ブラウザを更新したら、固定版・lockfile・本書を同時に更新し、環境確認と操作試験を再実行します。キャッシュを手動編集して動いた状態を正式な導入手順にしません。

公開前にはクリーン環境で第3節の2コマンドから始め、追加手順をこの文書だけで辿れることを確認します。MCP／ブラウザの導入、CLI到達、認証、プロジェクト設定、操作検証までの未確定箇所を解消し、結果を開発計画M10-09・M10-10・M10-12へ反映します。


## 9. 追加した状態・環境確認（2026-09-06）

対象アプリのルートを作業ディレクトリにし、導入済みPluginのruntimeを指定する。`<plugin-dir>`は実際のPlugin配置先に置換する。開発時はこのリポジトリの`plugins/longrun-app-dev`。この2操作用のslash Skillはまだない。

```text
node <plugin-dir>/runtime/dist/cli.js doctor
node <plugin-dir>/runtime/dist/cli.js status
node <plugin-dir>/runtime/dist/cli.js status <run-id>
```

`doctor`はNode、Git、設定のSchemaとモデル未設定、MCPの解決、WindowsのEdge実行ファイルを確認する。モデル・ブラウザを起動せず、認証は変更しない。必要項目が見つかればinventory-available・終了コード0、不足ならincomplete・終了コード2。ただしauthenticationとbrowserLaunchはnot-testedであり、実行可能性を保証しない。macOS/Linuxのブラウザ検出は未対応。MCP不足なら第4節の開発環境復元手順を使い、配布先での正式セットアップはM10の残作業とする。

`status`は保存済みRun stateを読み、phase、round、使用量、更新時刻を返す。生存プロセスの確認は行わず、古いBUILDING等を実行中と断定しない。Solo比較Runはbenchmark-summary.jsonを別途確認する。

### Gitと同時実行

startは初回commitのある名前付きブランチと、未コミット変更のない状態を要求する。変更をstash・削除・自動commitして通すことはしない。必要な編集を保存・レビューしてcommitしたうえで実行する。initで生成したconfigも共有する場合は秘密情報を入れずcommitし、ローカル専用ならignoreする。

対象プロジェクトの.gitignoreへ、Runの生成物とロックを除外する設定を追加してcommitする。これはプロジェクトごとに初回だけ必要。

```gitignore
.longrun-app-dev/runs/
.longrun-app-dev/run.lock
```

HarnessとSolo比較runnerは`.longrun-app-dev/run.lock`を排他的に作成し、通常終了・例外処理後に削除する。ロックにはランダムな所有者token、PID、ホスト名、開始時刻が保存される。競合時は開始せず、Runごとの再インストールや設定変更は不要。

強制終了後はロックが残ることがある。現在は自動復旧しない。別プロセスが動いている可能性があるため、存在するだけで手動削除する手順にはしない。stop/resume/recover-lockを利用できます。Run途中もbranchとHEADの変更を検出して停止します。ファイルの外部書込を隔離する仕組みではありません。

### シークレットマスクの実装範囲（2026-09-06）

追加設定は不要です。Runのイベントログ、ArtifactStoreが保存するJSON／テキスト、ブラウザのテキスト証拠、CLIの結果・エラー表示に自動適用します。秘密情報を示す環境変数の値（4文字以上）、既知のキー形式、認証ヘッダー、秘密値の代入と認証情報コンテナ内の文字列が対象です。数値の使用量カウンターは保持します。

開発時の確認は、リポジトリルートでビルド後に `node --test plugins/longrun-app-dev/tests/m10-redaction.test.mjs` を実行し、3件の成功を確認します。保存済みファイルは遡って書き換えません。主要な補助評価スクリプトのテキスト出力にもマスクを適用しました。画像と任意の個人情報の検査は未対応であり、秘密情報の完全な検出は保証しません。実利用での追加確認を残し、テキスト経路の試験を暫定完了としています。

## 10. 配布済みPluginのMCP依存を別フォルダに配置する

Pluginのキャッシュを書き換えずに、ユーザーが管理する専用フォルダへMCPを導入できます。新しいPCで初回、または固定版を更新するときだけ行います。以下のパスは利用者が選ぶ実在の保存先へ置き換えてください。

```powershell
npm install --prefix C:\tools\longrun-deps --save-exact @playwright/mcp@0.0.80
$env:LONGRUN_PLAYWRIGHT_ROOT = 'C:\tools\longrun-deps'
```

変更先はそのフォルダのpackage.json、package-lock.json、node_modulesです。作成されたlockfileを復元用に保管し、次回は `npm ci --prefix C:\tools\longrun-deps` で復元します。環境変数は同じターミナルから起動するClaude Codeにも引き継がせてください。別ターミナルでは再設定が必要です。恒久設定はOSの環境変数設定から利用者が行えます。

対象アプリのルートで `node <plugin-dir>/runtime/dist/cli.js doctor` を実行し、playwrightのavailableを確認します。設定・Git・ブラウザの不足は別項目です。この導入自体は認証やブラウザ取得を行いません。環境変数を指定した場合はその場所を優先し、版違いや不足を開発用の依存へ黙ってフォールバックさせません。

## 11. 停止・再開・終了データの削除

以下は対象アプリのルートで必要なときだけ実行します。

| 操作 | コマンド | 変更と確認 |
| --- | --- | --- |
| 停止要求 | `node <plugin-dir>/runtime/dist/cli.js stop` | stop.requestへ要求を保存。statusでSTOPPEDを確認するまで停止完了とはしない |
| 再開 | `node <plugin-dir>/runtime/dist/cli.js resume <run-id>` | 保存済み安全境界と残予算を使う。Git不一致や未保存境界は拒否 |
| 残存ロック回収 | `node <plugin-dir>/runtime/dist/cli.js recover-lock` | 同じホストの終了済み所有者だけ記録を退避。生存PID・不明状態は拒否 |
| 終了Run削除 | `node <plugin-dir>/runtime/dist/cli.js clean <run-id>` | 指定した終了Runの成果物だけ削除。必要な証拠を先に保管する |

.gitignoreでは `.longrun-app-dev/` 全体を除外する方法が簡単です。config.yamlを共有する場合はruns/、run.lock、stop.request、回収済みロックの保存先を個別に除外してください。Runは専用ブランチを作成し、Buildごとにチェックポイントを記録します。自動で元ブランチへ戻したり、生成コードを削除したりはしません。

## 12. 実行環境で検証が進まない場合

`node --version` が成功しても、子プロセスが使う `npm --version` が成功するとは限りません。Windowsでは `Get-Command node,npm,pnpm -All` で参照先を確認します。Voltaのディレクトリ作成エラーの場合は管理先へのアクセス権を確認し、管理者実行や権限変更を自動で行わず環境管理者へ相談してください。別のNodeだけで型チェックできた場合も、アプリ起動試験の成功とは区別します。

開発段階の試験は実行可能なところまで行い、環境依存の未確認を明記して暫定完了とします。本番利用の安全性や品質が確認済みという意味にはしません。

## 13. ローカル配布候補を作成する（開発者向け）

リポジトリルートでruntimeをビルドした後、既存の親フォルダの下に新しい保存先を指定します。

```text
pnpm build
node plugins/longrun-app-dev/scripts/prepare-release.mjs <new-local-directory>
```

ビルドはruntime/dist内の生成JS・source mapを更新し、不要になった生成物を削除します。distに手編集を保存せず、runtime/srcを変更してください。ライセンス表示とbuild-manifest.jsonを生成します。配布候補では現在のビルドのハッシュを検証し、package.jsonのfilesとビルド一覧にあるファイルだけを採用します。

成功時はlocal-candidate・published:falseを返し、候補内にrelease-manifest.jsonを保存します。既存の保存先は上書きしません。失敗した候補は公開せず、新しい保存先でやり直してください。この処理はGitHubへ送信せず、commit・tag・Releaseも作成しません。[公開前レビュー](reviews/release-0.1.0.md)で残る公開条件を確認します。
