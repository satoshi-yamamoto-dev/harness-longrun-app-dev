import type { IsoDateTime, RunError, RunState, TerminationReason } from "../contracts/index.js";

export type RunEvent =
  | { readonly type: "INITIALIZATION_COMPLETED"; readonly at: IsoDateTime }
  | { readonly type: "PLANNING_COMPLETED"; readonly at: IsoDateTime }
  | { readonly type: "BUILD_COMPLETED"; readonly at: IsoDateTime }
  | { readonly type: "QA_FAILED"; readonly at: IsoDateTime }
  | { readonly type: "QA_PASSED"; readonly at: IsoDateTime }
  | { readonly type: "PAUSE_REQUESTED"; readonly at: IsoDateTime }
  | { readonly type: "RESUME_REQUESTED"; readonly at: IsoDateTime }
  | { readonly type: "STOP_REQUESTED"; readonly at: IsoDateTime }
  | { readonly type: "LIMIT_REACHED"; readonly at: IsoDateTime; readonly reason: LimitTerminationReason }
  | { readonly type: "UNRECOVERABLE_ERROR"; readonly at: IsoDateTime; readonly error: RunError };

export type LimitTerminationReason =
  | "quality-not-met"
  | "cost-limit"
  | "duration-limit"
  | "qa-round-limit"
  | "api-failure-limit";

export class StateTransitionError extends Error {
  public constructor(
    public readonly phase: RunState["phase"],
    public readonly eventType: RunEvent["type"],
  ) {
    super(`Event ${eventType} is not allowed in phase ${phase}`);
    this.name = "StateTransitionError";
  }
}

export function transitionRunState(state: RunState, event: RunEvent): RunState {
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
      if (state.resumeTarget === undefined) {
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

function update(state: RunState, phase: RunState["phase"], updatedAt: IsoDateTime): RunState {
  return { ...state, phase, updatedAt };
}

function terminate(
  state: RunState,
  phase: "COMPLETED" | "STOPPED" | "FAILED",
  terminationReason: TerminationReason,
  at: IsoDateTime,
): RunState {
  return clearResumeTarget({ ...state, phase, updatedAt: at, completedAt: at, terminationReason });
}

function clearResumeTarget(state: RunState): RunState {
  const { resumeTarget: _resumeTarget, ...rest } = state;
  return rest;
}

function assertPhase(state: RunState, event: RunEvent, expected: RunState["phase"]): void {
  if (state.phase !== expected) {
    throw new StateTransitionError(state.phase, event.type);
  }
}

function assertActive(state: RunState, event: RunEvent): void {
  if (state.phase === "COMPLETED" || state.phase === "STOPPED" || state.phase === "FAILED") {
    throw new StateTransitionError(state.phase, event.type);
  }
}
