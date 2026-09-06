# EvaluatorセッションとPlaywright接続

## 現在の実装範囲

M7-01〜M7-10を実装しました。`EvaluatorSession`はSDK結果を返し、`Evaluator`はSchema、全仕様IDの網羅、指摘と証拠の整合性、証拠パスの実在と閉じ込めを検証してJSON/Markdownを保存します。共通4基準とUI詳細4基準を独立した閾値で判定し、未検証・N/A・未解決issueがあればFAILです。人間との採点校正は未完了です。

初期版は既存の`qa-functional`ロールをEvaluatorに使い、四つの品質観点を一つの独立セッションで扱う予定です。GeneratorのセッションID、会話履歴、Build reportは入力しません。入力オブジェクトにこれらが余分なJavaScriptプロパティとして含まれても、許可した項目だけを投影してpromptを生成します。繰り返し呼び出しても`resume`は指定しません。

## 接続

`AgentDefinition`から`DefaultSessionRunner`、`ClaudeAgentSdkClient`まで`mcpServers`と`strictMcpConfig`を受け渡します。既存Planner/Generatorでは未指定のままとし、従来の動作を維持します。

Evaluatorは明示した`playwright`サーバーだけを使う設定です。採用済みClaude Agent SDK 0.3.258の型定義にある`strictMcpConfig`を使用します。この設定は他のMCP設定の混入を抑えるもので、ファイルシステムの隔離を保証しません。

接続はインストール済みCLIを`process.execPath`で直接起動します。`npx`による暗黙のダウンロードは行いません。Playwrightはheadless・isolatedモードを指定し、証拠出力先を明示します。isolatedモードの仕様は[Microsoftの公式ドキュメント](https://github.com/microsoft/playwright-mcp#user-profile)で確認しました。

許可ツールはnavigate、snapshot、click、type、fill_form、press_key、select_option、wait_for、take_screenshot、evaluate、network_requests、console_messages、resize、closeです。Edit/Write等のコード編集ツールとbrowser_installを禁止リストに含めます。Bashは既存コード・テストの確認用に残るため、promptの編集禁止だけで任意の書き込みを強制拒否する設計ではありません。より強い実行制限はM10で扱います。

## 環境確認

`scripts/check-evaluator-environment.mjs`は、固定版MCPの解決とブラウザ実行ファイルの存在を確認します。インストール、ブラウザ起動、MCP通信、モデル呼び出しは行いません。実行ファイルを発見しても実操作の成功とは見なしません。

M7-03aの導入案と現環境の結果は[導入・確認手順](../reviews/m7-evaluator/environment.md)に記録します。
