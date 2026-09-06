> 履歴記録です。最新状況は [開発計画](../development-plan.md)、[暫定検証記録](provisional-validation.md)、[公開前レビュー](release-0.1.0.md) を参照してください。

# M9/M10続行記録

2026-09-06。ユーザの確認なしで進める指示に従い、人間採点・長時間予算の決定に依存しない実装を進めた。

## 追加した実装

- Solo比較runner：Harnessの保存仕様・設定・原要求・Planner計測を読み、1 Buildと独立した最終QAを実行する。品質FAILでも修正Buildへ戻さない。既定のCLIはdry-runで、実モデル呼び出しは未実施。
- 計測：HarnessログとSolo集計へSDK観測のcompactionCount/eventCount/turnsを保存。共有Planner費・SDK所要時間をSoloの上限に含める。
- Run lock：Harness/Solo共通でprojectごとに排他的取得。終了時に所有者を確認して解放する。残存ロックの自動削除は行わない。
- Git開始条件：CLIが未コミット変更・detached HEADを拒否。stashや既存ファイルの削除は行わない。
- status：保存stateをSchema検証して一覧表示する。プロセスの生存判定とは区別する。
- doctor：モデルを呼ばず設定・Git・MCP・Windows Edgeの存在を確認。認証とブラウザ起動はnot-testedと明示する。

## 検証範囲

`pnpm check`成功。関連試験の後、全64テストを一括実行して成功（約48秒）。競合6件でロック所有者が一つになること、所有者変更後の解除拒否、成功・失敗後のロック解放、dirty/detached拒否、ユーザファイル保全、SoloへのQA非還流、QA失敗後のアプリ停止、既定CLIの非実行を確認した。

変更したruntimeはビルド済み。初期構築ガイドへコマンド、保存先、実行頻度、ignore設定、成功判定を追記した。Git未追跡の作業ファイルであり、commit・リモートへのバックアップはしていない。

## 残る制約

Run lockは協調するHarnessプロセス間の競合防止で、任意の外部プログラムによるファイル改変を隔離する仕組みではない。強制終了後の安全な復旧とRun途中のGit保護は未完成。stop/resume/clean、専用ブランチとチェックポイント、シークレットマスク、外部操作の強制制限、配布先の依存セットアップも残る。status/doctorのslash Skillは未追加。

M10全体や長時間無人運転を完成扱いにしない。M7の人間採点校正、M9の実測比較、クリーン環境の再構築、公開手続きも未完了。
