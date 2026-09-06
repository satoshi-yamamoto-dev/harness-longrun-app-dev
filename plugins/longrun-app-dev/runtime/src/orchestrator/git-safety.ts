import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";
import type { InitialGitState } from "../contracts/index.js";

export interface GitProtection {
  begin(expected: InitialGitState): Promise<void>;
  verify(): Promise<void>;
  prepareRun(runId: string, prefix: string): Promise<string>;
  checkpoint(round: number): Promise<string>;
  snapshot(): Promise<InitialGitState>;
}

/** Detects unexpected Git history changes without resetting or discarding files. */
export class GitSafety implements GitProtection {
  private baseline?: InitialGitState;
  constructor(private readonly root: string) {}
  private async git(...args: string[]): Promise<string> {
    return (await promisify(execFile)("git", args, { cwd: this.root, windowsHide: true, timeout: 10000 })).stdout.trim();
  }
  async begin(expected: InitialGitState): Promise<void> {
    const top = await this.git("rev-parse", "--show-toplevel");
    if (await realpath(top) !== await realpath(this.root)) throw new Error("Run must start at the Git project root");
    const headSha = await this.git("rev-parse", "--verify", "HEAD");
    const branch = await this.git("branch", "--show-current");
    if (!branch) throw new Error("Run requires a named Git branch");
    if (expected.hadUncommittedChanges || expected.headSha !== headSha || expected.branch !== branch) {
      throw new Error("Git state changed since start; refusing to run");
    }
    // Internal Run/lock artifacts are not application edits. Config must be reviewed separately.
    if (await this.git("status", "--porcelain", "--untracked-files=all", "--", ".", ":(exclude).longrun-app-dev")) {
      throw new Error("Run requires a clean Git working tree");
    }
    this.baseline = { branch, headSha, hadUncommittedChanges: false };
  }
  async verify(): Promise<void> {
    if (!this.baseline) throw new Error("Git protection has not been initialized");
    if (await this.git("rev-parse", "--verify", "HEAD") !== this.baseline.headSha ||
        await this.git("branch", "--show-current") !== this.baseline.branch) {
      throw new Error("Git branch or HEAD changed during Run; files retained for inspection");
    }
  }
  async prepareRun(runId: string, prefix: string): Promise<string> {
    await this.verify();
    const branch = `${prefix}${runId}`;
    await this.git("check-ref-format", "--branch", branch);
    await this.git("switch", "-c", branch);
    this.baseline = { ...this.baseline!, branch };
    return branch;
  }
  async snapshot(): Promise<InitialGitState> {
    await this.verify();
    return { ...this.baseline! };
  }
  async checkpoint(round: number): Promise<string> {
    if (!Number.isSafeInteger(round) || round < 1) throw new Error("Invalid checkpoint round");
    await this.verify();
    // Never include harness records, dependencies, or common local credential files.
    const paths = [".", ":(exclude).longrun-app-dev", ":(exclude,glob)**/node_modules/**",
      ":(exclude,glob)**/.env*", ":(exclude,glob)**/*.pem", ":(exclude,glob)**/*.key"];
    await this.git("add", "--all", "--", ...paths);
    const staged = (await this.git("diff", "--cached", "--name-only", "-z")).split("\0");
    if (staged.some((file) => /(^|\/)(\.longrun-app-dev|node_modules)(\/|$)|(^|\/)\.env[^/]*$|\.(pem|key)$/iu.test(file))) {
      throw new Error("Checkpoint contains excluded local files; index and files retained for inspection");
    }
    // A successful no-change Build still has a distinct, traceable checkpoint.
    await this.git("-c", "core.hooksPath=", "-c", "commit.gpgSign=false", "commit", "--allow-empty", "-m", `Harness Build round ${round}`);
    const headSha = await this.git("rev-parse", "HEAD");
    this.baseline = { ...this.baseline!, headSha };
    return headSha;
  }
}
