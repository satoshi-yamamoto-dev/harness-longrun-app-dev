# M6 Generator試験結果

2026-09-05、Generatorの初回Buildと修正Buildを実モデルで確認しました。M6-01〜M6-09は完了です。

## 実装と検証

仕様全体、Web adapterの検出結果と設定、プロジェクト規約、Git安全方針をGeneratorへ渡す実行部品を追加しました。修正Buildには直前のBuild/QA成果物を渡します。報告書はSchema、全requirement IDとQA issue IDの網羅、証拠の有無、パス、日時、コマンド結果の整合性を検証し、不適合時は同一セッションで修正します。

`pnpm check`と全35テスト（M6の9件を含む）が成功しました。最初のsandbox内試験では既存Web adapterの5件がVoltaディレクトリへのアクセス制限で失敗しましたが、通常環境で再実行し全件成功しています。

## 実モデル試験

モデル指定は`sonnet`。Run IDは`m6-eEMnPt`です。元の`examples/web-app`を専用ディレクトリへコピーし、コピーに対してのみモデル編集と不具合注入を行いました。

| 段階 | 結果 | SDK記録費用 | SDK runner計測時間 |
| --- | --- | --- | --- |
| 初回Build | ページのtitleとh1を変更。外部からbuild/test/lint、ページとhealthのHTTP応答を確認 | $0.2732034 | 67.792秒 |
| 修正Build・最初の応答 | 注入したhealthの常時falseを修正。報告書は検証に不適合 | $0.2312458 | 86.727秒 |
| 修正Build・報告書修正 | 同じセッションを再開して報告書を修正。外部検証も成功 | $0.0854458 | 44.829秒 |
| 合計 | 成功 | $0.589895 | 199.348秒 |

初回と修正Buildには異なるSDKセッションを使用し、修正Build内の報告書修正ではセッションを維持しました。各roundの上限は0.5ドル・180秒で、報告書修正時には残予算を適用しています。表の時間にはadapter検証などSDK呼び出し外の処理を含みません。

不具合注入後はGET `/api/health`が503・`ready:false`になることを実際に確認し、QA成果物を作成しました。修正後は通常環境で200・`ready:true`へ戻り、ページtitleとh1も維持されました。QA指摘`health-regression`は証拠付きの`resolved`として保存されています。

## 成果物

ローカルの実行記録は以下にあります。このディレクトリはGit管理対象外です。

- `.longrun-app-dev/generator-evaluations/m6-eEMnPt/evaluation.json`：成否、応答、セッションID、費用と時間
- 同ディレクトリの`build/round-1.json`、`build/round-2.json`と対応Markdown：検証済み報告書
- 同ディレクトリの`qa/round-1.json`、`qa/evidence/health.json`：注入した不具合の再現結果
- 同ディレクトリの`verification-1.json`、`verification-2.json`：独立したbuild/test/lintの記録
- 同ディレクトリの`project/`：試験対象のアプリ

再実行用スクリプトは`plugins/longrun-app-dev/scripts/run-generator-evaluation.mjs`です。実モデルを呼び出すためClaude利用枠を消費します。

## 確認範囲

これは既存の小規模Web fixtureへの変更と修正の試験です。複雑なアプリの新規構築、長時間自動コンパクション、ブラウザ実操作、独立Evaluatorの品質採点を実証するものではありません。QA JSONは試験スクリプトが作成しています。CLI／Orchestratorへの接続はM8、操作の強制拒否など安全性強化はM10の範囲です。M5のPlanner実モデル生成成功も引き続き未確認です。
