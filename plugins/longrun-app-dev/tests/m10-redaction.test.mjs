import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { redactText, redactValue, EventLog } from "../runtime/dist/logging/index.js";
import { ArtifactStore } from "../runtime/dist/artifacts/index.js";

test("redaction removes configured secrets and nested credential fields while retaining metrics", () => {
  const secret = "sample-private-value";
  assert.equal(redactText(`error ${secret}`, { TEST_API_KEY: secret }), "error [REDACTED]");
  assert.deepEqual(redactValue({ password: "hidden", inputTokens: 24, nested: [{ api_key: "hidden" }] }, {}),
    { password: "[REDACTED]", inputTokens: 24, nested: [{ api_key: "[REDACTED]" }] });
  const text = redactText("Bearer abc.def https://user:pass@example.test/?token=hidden", {});
  assert.ok(!text.includes("abc.def") && !text.includes("user:pass") && !text.includes("hidden"));
});

test("artifact and event persistence redact before writing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "redaction-"));
  const store = new ArtifactStore(root);
  await store.saveText("observation.json", JSON.stringify({ password: "do-not-save", durationMs: 123 }));
  const saved = await readFile(path.join(root, "observation.json"), "utf8");
  assert.ok(!saved.includes("do-not-save"));
  assert.equal(JSON.parse(saved).durationMs, 123);
  const log = new EventLog(path.join(root, "events.jsonl"));
  await log.append({ runId: "test", timestamp: new Date().toISOString(), phase: "BUILDING", agent: "generator", event: "test", payload: { authorization: "do-not-save" } });
  assert.ok(!(await readFile(path.join(root, "events.jsonl"), "utf8")).includes("do-not-save"));
});

test("plain errors, embedded JSON and credential containers do not leak strings", () => {
  assert.ok(!redactText("Authorization: Bearer unregistered-value", {}).includes("unregistered-value"));
  assert.ok(!redactText("private_key=-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----", {}).includes("private-material"));
  assert.deepEqual(redactValue({ cookie: "session=private" }, {}), { cookie: "[REDACTED]" });
  for (const source of ['password=hidden-value', 'API_KEY="hidden value"', '{"password":"hidden-value"}', 'secret: hidden-value']) {
    assert.ok(!redactText(source, {}).includes("hidden"));
  }
  assert.deepEqual(redactValue({ credentials: { provider: ["hidden"] }, inputTokens: 42 }, {}),
    { credentials: { provider: ["[REDACTED]"] }, inputTokens: 42 });
  const result = redactValue({ body: JSON.stringify({ password: "hidden-value" }) }, {});
  assert.ok(!result.body.includes("hidden-value"));
});
