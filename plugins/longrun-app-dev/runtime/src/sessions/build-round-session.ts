import type { AgentDefinition, SessionLimits, SessionRunResult, SessionRunner } from "./types.js";

export class BuildRoundSession {
  private sessionId: string | undefined;
  private readonly results: SessionRunResult[] = [];

  constructor(
    private readonly runner: SessionRunner,
    private readonly agent: AgentDefinition,
    private readonly limits: SessionLimits,
  ) {
    if (agent.role !== "generator") throw new Error("BuildRoundSession requires a generator agent");
  }

  get currentSessionId(): string | null { return this.sessionId ?? null; }
  get history(): readonly SessionRunResult[] { return this.results; }

  async run(prompt: string): Promise<SessionRunResult> {
    const result = await this.runner.run({
      agent: this.agent,
      prompt,
      limits: this.limits,
      ...(this.sessionId === undefined ? {} : { resumeSessionId: this.sessionId }),
    });
    if (result.sessionId !== null) this.sessionId = result.sessionId;
    this.results.push(result);
    return result;
  }
}
