# Evaluator実測と未完了の校正

2026-09-05。M7-10までの実装検証であり、M7-11の人間との採点校正は未完了。

## 実ブラウザ試験

固定依存`@playwright/mcp@0.0.80`と既存Edgeをheadless・isolatedで使用。ブラウザの追加取得はしていない。Node v24.20.0、Windows x64。UAはEdge/152.0.0.0であり、正確なパッチ版の記録ではない。

- MCP接続・ツール照合・クリック・snapshot・PNG保存：`.longrun-app-dev/playwright-checks/m7-q0L0fQ/check.json`
- 正常fixture：`.longrun-app-dev/qa-fixture-checks/working-sLHIBS/check.json`
- 故障fixture：`.longrun-app-dev/qa-fixture-checks/broken-vjsvJy/check.json`

正常版では追加、完了、localStorage保存、再読込後の復元を確認。故障版では完了操作の無反応と保存・復元の失敗を確認。両版のAPI healthも実HTTPで観測した。

## 実モデル試験

| 記録ディレクトリ末尾 | SDK結果 | 費用 | 時間 | 解釈 |
| --- | --- | --- | --- | --- |
| m7-JgGe5z | 25 turns、上限終了 | $0.3790942 | 64.814秒 | レポート取得失敗。認証関連エラーも記録され、原因を単一に断定しない |
| m7-qLlML6 | 39 turns、完了 | $0.4136974 | 153.070秒 | 2不具合を検出。保存処理は初回失敗、修正後に記録済み応答で再検証 |

第2試験はJSONタグ前の説明文を旧parserが拒否した。parserを「タグ対がちょうど一つなら許容」に修正し、SDK応答を再利用してSchema・証拠・閾値検証とQA JSON/Markdown保存を成功させた。追加モデル呼び出しではない。元の`evaluation.json`は失敗記録のまま保持し、`revalidation.json`に再検証を区別した。

QAはFAIL。Product depth 2、Functionality 2、Visual design 6、Code qualityはN/A。UI詳細は6/4/5/2。Code qualityを評価対象外と誤解したため、現在のpromptではソースとテストの確認を明示した。この変更後の新規実モデル採点は未実施。

試験時のfew-shotにはfixtureの故障を推測できる記述があり、現在は一般例へ修正した。そのため検出結果を未知不具合への性能や独立した校正の証明には使わない。

## 人間評価の残作業

2026-09-06にタスク順序を見直し、M7-11をM9-08a（比較資料準備）の後へ移動した。現時点では修正済み指示での新規採点と人間用資料が揃っていないため、直ちに採点を依頼できない。後続の実アプリ試験で得た資料を使って校正し、M9-08bで比較結果への影響を確認してからM9-09の最終レポートを確定する。校正前の評価は暫定値として扱う。

修正済みpromptで新規評価し、同じ仕様・画面・操作証拠を人間が独立採点する。8基準の点差、閾値をまたぐ不一致、重大不具合の見逃し・誤検知を記録し、rubric修正後は別fixtureで再確認する。人間採点を推定で補わない。
