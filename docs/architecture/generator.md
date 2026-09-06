# Generator実行契約

`createGeneratorAgent`と`Generator`はM6の独立した実行部品です。CLIからの自動起動やPLAN→BUILD→QAの接続はM8で行います。

## 入力と継続

`Generator.build`へrunId、round、ProductSpec、Web adapterの検出結果と設定を渡します。必要に応じてプロジェクト規約を補足します。adapterのprojectRootとAgentのcwdは一致する必要があります。

初回はround=1、前回成果物なしです。修正Buildは直前roundのBuildReportとFAILのQaResultが必須です。runId、specId、roundの不一致、重複QA ID、不明なQA requirement IDはモデル呼び出し前に拒否します。

各Build roundは新しい`BuildRoundSession`で開始します。報告書のSchema・参照検証に失敗した場合は同じSDKセッションを再開し、具体的な検証エラーを渡します。既定の修正回数は2回で、修正応答にも同じroundの残り時間・残り費用を適用します。結果とエラーはSDKセッションの計測値を保持します。

## 報告書

`buildAndSave`は検証後に`build/round-N.json`と`build/round-N.md`を保存します。各ファイルの書き込みは原子的ですが、2ファイル一括のトランザクションではありません。次フェーズの正規入力はJSONです。

requirementResultsにはProductSpecのfeatures、nonFunctionalRequirements、acceptanceCriteriaの各IDを一度ずつ含めます。qaIssueResultsには入力QAの全issueIdを一度ずつ含めます。implementedには証拠、partial/blockedには説明が必要です。QAのresolved以外の状態には説明を要求し、unaddressed以外には証拠も要求します。

検証は報告書の構造・ID・パス・時系列・コマンド終了状態の整合性を確認します。自己申告された証拠の真偽や製品の合格を保証しません。独立したEvaluatorが仕様全体を評価する設計は変わりません。

## 権限と安全方針

Generatorは既存のacceptEdits設定を使います。ユーザ変更の保護、破壊的Git操作・push・deployの禁止、ブランチとチェックポイントをharnessへ任せる方針をpromptに含めます。これらはM6では指示としての制約であり、Bashの実行を隔離するsandboxやGit操作の強制拒否を実装するものではありません。M10の安全性強化とは区別します。

## 検証

M6のmockテスト9件は、初回・修正Build、同一セッションでの報告書修正、予算の共有、入力不整合、検証エラー、失敗時の保存抑止を確認します。既存テストを含む全35件と`pnpm check`は2026-09-05に成功しました。

`scripts/run-generator-evaluation.mjs`は明示的な実モデル試験用です。`.longrun-app-dev/generator-evaluations`にWeb fixtureの新しいコピーを作り、初回Buildを外部からbuild/test/lint/HTTP検証します。その後、コピーにhealth応答の不具合を注入し、再現結果をQA JSONとして修正Buildへ渡します。修正後にも同じ検証を行います。

試験は各round最大0.5ドル・180秒、2round合計最大1ドルです。`evaluation.json`に成否・セッション計測値・失敗理由を残します。QA入力は試験スクリプトによるもので、M7 Evaluatorの実評価ではありません。ブラウザの実操作もこの試験には含みません。
