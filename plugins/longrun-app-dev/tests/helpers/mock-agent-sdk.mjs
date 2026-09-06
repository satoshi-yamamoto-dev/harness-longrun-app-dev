export class MockAgentSdkClient {
  constructor(scenarios) {
    this.scenarios = [...scenarios];
    this.requests = [];
    this.queries = [];
  }

  query(request) {
    this.requests.push(request);
    const scenario = this.scenarios.shift();
    if (!scenario) throw new Error("No mock SDK scenario remains");
    const control = { closed: false, interrupted: false };
    this.queries.push(control);
    return {
      async interrupt() { control.interrupted = true; },
      close() { control.closed = true; },
      async *[Symbol.asyncIterator]() {
        if (scenario.throwError) throw new Error(scenario.throwError);
        for (const event of scenario.events ?? []) {
          if (control.closed) return;
          yield event;
        }
        if (scenario.hang) {
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 60_000);
            timer.unref();
          });
        }
      },
    };
  }
}

export const initEvent = (sessionId = "session-1") => ({ type: "system", subtype: "init", session_id: sessionId });

export const successEvent = (overrides = {}) => ({
  type: "result",
  subtype: "success",
  session_id: "session-1",
  is_error: false,
  result: "done",
  duration_ms: 120,
  num_turns: 2,
  total_cost_usd: 0.04,
  modelUsage: {
    sonnet: { inputTokens: 100, outputTokens: 30, cacheReadInputTokens: 20, cacheCreationInputTokens: 5 },
    haiku: { inputTokens: 10, outputTokens: 3, cacheReadInputTokens: 2, cacheCreationInputTokens: 1 },
  },
  errors: [],
  ...overrides,
});
