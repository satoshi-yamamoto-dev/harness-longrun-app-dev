import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  ArtifactStore,
  ArtifactValidationError,
  atomicWriteFile,
  initializeRunDirectory,
} from "../runtime/dist/artifacts/index.js";
import { ConfigValidationError, loadConfig } from "../runtime/dist/config/index.js";
import { EventLog } from "../runtime/dist/logging/index.js";
import { StateTransitionError, transitionRunState } from "../runtime/dist/state/index.js";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test("normal PLAN, BUILD, QA transitions end only after QA passes", () => {
  const initial = createInitialState();
  const planning = transitionRunState(initial, event("INITIALIZATION_COMPLETED", 1));
  const building = transitionRunState(planning, event("PLANNING_COMPLETED", 2));
  const evaluating = transitionRunState(building, event("BUILD_COMPLETED", 3));
  const rebuilding = transitionRunState(evaluating, event("QA_FAILED", 4));
  const reevaluating = transitionRunState(rebuilding, event("BUILD_COMPLETED", 5));
  const completed = transitionRunState(reevaluating, event("QA_PASSED", 6));

  assert.equal(initial.phase, "INITIALIZING");
  assert.equal(rebuilding.buildRound, 2);
  assert.equal(reevaluating.qaRound, 2);
  assert.equal(completed.phase, "COMPLETED");
  assert.equal(completed.terminationReason, "quality-passed");
  assert.equal(completed.completedAt, timestamp(6));
});

test("invalid and terminal transitions are rejected", () => {
  const initial = createInitialState();
  assert.throws(() => transitionRunState(initial, event("QA_PASSED", 1)), StateTransitionError);
  const failed = transitionRunState(initial, {
    type: "UNRECOVERABLE_ERROR",
    at: timestamp(2),
    error: { code: "fatal", message: "fatal test error", retryable: false },
  });
  assert.throws(() => transitionRunState(failed, event("INITIALIZATION_COMPLETED", 3)), StateTransitionError);
});

test("Artifact store validates, saves, reads, and lists state", async () => {
  const projectRoot = await createTemporaryRoot();
  const layout = await initializeRunDirectory(projectRoot, "20260903T000000Z-artifacts");
  const store = new ArtifactStore(layout.runRoot);
  const state = createInitialState("20260903T000000Z-artifacts", projectRoot);

  await store.saveJson("state.json", "state", state);
  assert.deepEqual(await store.readJson("state.json", "state"), state);
  assert.deepEqual(await store.list(), ["state.json"]);

  await assert.rejects(
    store.saveJson("invalid.json", "state", { ...state, phase: "UNKNOWN" }),
    ArtifactValidationError,
  );
  await assert.rejects(store.saveJson("../escape.json", "state", state), /escapes Run root/u);
});

test("corrupt JSON artifact is rejected on read", async () => {
  const projectRoot = await createTemporaryRoot();
  const layout = await initializeRunDirectory(projectRoot, "20260903T000000Z-corrupt");
  const store = new ArtifactStore(layout.runRoot);
  await writeFile(join(layout.runRoot, "state.json"), "{not-json", "utf8");
  await assert.rejects(store.readJson("state.json", "state"), SyntaxError);
});

test("atomic writes replace the file and leave no temporary file", async () => {
  const root = await createTemporaryRoot();
  const path = join(root, "atomic", "state.json");
  await atomicWriteFile(path, "first");
  await atomicWriteFile(path, "second");
  assert.equal(await readFile(path, "utf8"), "second");
  assert.deepEqual(await readdir(join(root, "atomic")), ["state.json"]);
});

test("config loader applies defaults and rejects non-required evaluation", async () => {
  const root = await createTemporaryRoot();
  const validPath = join(root, "valid.yaml");
  await writeFile(validPath, "models:\n  planner: p\n  generator: g\n  evaluator: e\n", "utf8");
  const config = await loadConfig(validPath);
  assert.equal(config.evaluation.mode, "required");
  assert.equal(config.limits.maxQaRounds, 3);
  assert.equal(config.adapter.type, "auto");

  const invalidPath = join(root, "invalid.yaml");
  await writeFile(invalidPath, "models:\n  planner: p\n  generator: g\n  evaluator: e\nevaluation:\n  mode: adaptive\n", "utf8");
  await assert.rejects(loadConfig(invalidPath), ConfigValidationError);
});

test("event log appends and restores JSON Lines entries", async () => {
  const root = await createTemporaryRoot();
  const log = new EventLog(join(root, "logs", "events.jsonl"));
  await log.append({
    timestamp: timestamp(1),
    runId: "run-event-test",
    phase: "PLANNING",
    agent: "planner",
    event: "agent.started",
    payload: { round: 1 },
  });
  await log.append({
    timestamp: timestamp(2),
    runId: "run-event-test",
    phase: "BUILDING",
    agent: "generator",
    event: "agent.started",
  });
  const entries = await log.readAll();
  assert.equal(entries.length, 2);
  assert.equal(entries[1].phase, "BUILDING");
});

async function createTemporaryRoot() {
  const path = await mkdtemp(join(tmpdir(), "longrun-app-dev-m2-"));
  temporaryRoots.push(path);
  return path;
}

function createInitialState(runId = "run-state-test", projectRoot = "C:/project") {
  return {
    schemaVersion: 1,
    runId,
    phase: "INITIALIZING",
    qaRound: 0,
    buildRound: 0,
    startedAt: timestamp(0),
    updatedAt: timestamp(0),
    projectRoot,
    initialGit: {
      branch: "main",
      headSha: "0123456789abcdef0123456789abcdef01234567",
      hadUncommittedChanges: false,
    },
    usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, elapsedMs: 0 },
    consecutiveApiFailures: 0,
    latestArtifacts: [],
  };
}

function event(type, second) {
  return { type, at: timestamp(second) };
}

function timestamp(second) {
  return `2026-09-03T00:00:${String(second).padStart(2, "0")}.000Z`;
}
