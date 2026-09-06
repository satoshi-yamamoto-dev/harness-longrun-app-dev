import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);

// runtime/src/state/transition.ts
var StateTransitionError = class extends Error {
  constructor(phase, eventType) {
    super(`Event ${eventType} is not allowed in phase ${phase}`);
    this.phase = phase;
    this.eventType = eventType;
    this.name = "StateTransitionError";
  }
  phase;
  eventType;
};
function transitionRunState(state, event) {
  switch (event.type) {
    case "INITIALIZATION_COMPLETED":
      assertPhase(state, event, "INITIALIZING");
      return update(state, "PLANNING", event.at);
    case "PLANNING_COMPLETED":
      assertPhase(state, event, "PLANNING");
      return { ...update(state, "BUILDING", event.at), buildRound: state.buildRound + 1 };
    case "BUILD_COMPLETED":
      assertPhase(state, event, "BUILDING");
      return { ...update(state, "EVALUATING", event.at), qaRound: state.qaRound + 1 };
    case "QA_FAILED":
      assertPhase(state, event, "EVALUATING");
      return { ...update(state, "BUILDING", event.at), buildRound: state.buildRound + 1 };
    case "QA_PASSED":
      assertPhase(state, event, "EVALUATING");
      return terminate(state, "COMPLETED", "quality-passed", event.at);
    case "PAUSE_REQUESTED":
      if (state.phase !== "BUILDING" && state.phase !== "EVALUATING") {
        throw new StateTransitionError(state.phase, event.type);
      }
      return { ...update(state, "PAUSED", event.at), resumeTarget: state.phase };
    case "RESUME_REQUESTED":
      assertPhase(state, event, "PAUSED");
      if (state.resumeTarget === void 0) {
        throw new StateTransitionError(state.phase, event.type);
      }
      return clearResumeTarget(update(state, state.resumeTarget, event.at));
    case "STOP_REQUESTED":
      assertActive(state, event);
      return terminate(state, "STOPPED", "manual-stop", event.at);
    case "LIMIT_REACHED":
      assertActive(state, event);
      return terminate(state, "STOPPED", event.reason, event.at);
    case "UNRECOVERABLE_ERROR":
      assertActive(state, event);
      return { ...terminate(state, "FAILED", "unrecoverable-error", event.at), error: event.error };
  }
}
function update(state, phase, updatedAt) {
  return { ...state, phase, updatedAt };
}
function terminate(state, phase, terminationReason, at) {
  return clearResumeTarget({ ...state, phase, updatedAt: at, completedAt: at, terminationReason });
}
function clearResumeTarget(state) {
  const { resumeTarget: _resumeTarget, ...rest } = state;
  return rest;
}
function assertPhase(state, event, expected) {
  if (state.phase !== expected) {
    throw new StateTransitionError(state.phase, event.type);
  }
}
function assertActive(state, event) {
  if (state.phase === "COMPLETED" || state.phase === "STOPPED" || state.phase === "FAILED") {
    throw new StateTransitionError(state.phase, event.type);
  }
}

export {
  StateTransitionError,
  transitionRunState
};
//# sourceMappingURL=chunk-EBCTSJ3O.js.map
