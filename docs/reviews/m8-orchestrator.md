# M8統合検証

2026-09-05。`pnpm check`成功、全56テスト成功。

追加修正後も`pnpm check`とM8関連9テスト成功。新規の実プロセステストでは3秒のBuild期限後にスクリプトのPIDが消えることを確認した。最終Markdownの改行修正も検証済み。追加後の全体一括再実行はしていない。

Plannerの仕様確定 → GeneratorのBuild report確定 → adapter準備・起動 → 独立Evaluator → FAIL時の修正Buildを接続した。各フェーズでSchema検証済みJSONをディスクから読み直し、EvaluatorへGenerator会話は渡さない。QA証拠はround別に保存する。

`tests/m8.test.mjs`でPASS、FAIL後PASS、QA回数上限、費用・時間・API失敗上限、Planner不正出力、準備失敗、QA不正出力を検証した。失敗時のアプリ停止、最終レポート、使用量合計、イベント、仕様網羅、スプリント成果物の非生成を確認した。正常終了はQA PASS時のみ。

`tests/m8-cli.test.mjs`でinitの生成・既存設定保護とstartの未設定拒否を確認した。SDKのinterruptが応答しなくてもtimeout処理が終了するテストも追加した。

これはmock SDKとadapterによる統合試験。実モデルの全フェーズ連続Run、長時間コンパクション、再起動後の再開、配布先への導入の成功を意味しない。SDKの費用記録は推定値であり、強制中断直前の未報告費用までは確定できない。Git保護・lock・再開・外部操作の強制制限はM10で実装する。
