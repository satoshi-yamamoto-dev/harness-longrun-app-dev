# Claude Agent SDK adoption

- Package: `@anthropic-ai/claude-agent-sdk`
- Pinned version: `0.3.258`
- Runtime: Node.js 24 or newer
- Primary API: `query({ prompt, options })` returning an async stream of `SDKMessage`

The runtime uses the stable `query()` API. A new turn reads the session ID from the
`system/init` or `result` event. Later turns pass that value as `options.resume`, which
is the supported replacement for the removed v2 session API.

The following SDK options form the adapter boundary:

| Harness concern | SDK option/event |
| --- | --- |
| Model | `options.model` |
| System prompt | `options.systemPrompt` |
| Tool policy | `options.allowedTools`, `options.disallowedTools` |
| Working directory | `options.cwd` |
| Permission policy | `options.permissionMode` |
| Turn cap | `options.maxTurns` |
| Cost cap | `options.maxBudgetUsd` and `result.total_cost_usd` |
| Session continuity | `message.session_id`, `options.resume` |
| Usage | `result.usage` |
| Completion | `result.subtype`, `result.is_error` |
| Compaction | `system/compact_boundary` stream message |

The SDK is kept behind a small local interface so orchestration tests use a deterministic
mock without authentication or model charges. Production construction dynamically loads
the pinned SDK and can point it at the separately installed Claude Code executable.

References:

- <https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk>
- <https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md>
- <https://docs.anthropic.com/en/docs/claude-code/cli-usage>
