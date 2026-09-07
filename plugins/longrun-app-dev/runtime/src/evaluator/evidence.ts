import { mkdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { atomicWriteFile } from "../artifacts/atomic-write.js";
import { redactArtifact } from "../logging/redaction.js";
import type { ArtifactReference } from "../contracts/index.js";

export interface BrowserToolResult {
  readonly isError?: boolean;
  readonly content?: readonly { readonly type: string; readonly text?: string }[];
}
export interface BrowserTools {
  call(name: string, args: Readonly<Record<string, unknown>>): Promise<BrowserToolResult>;
}
export function toolText(result: BrowserToolResult): string {
  if (result.isError) throw new Error(`Browser tool failed: ${JSON.stringify(result.content)}`);
  return (result.content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n");
}

export class PlaywrightEvidence {
  constructor(private readonly tools: BrowserTools, readonly runRoot: string, readonly evidenceRoot: string) {
    const relation = relative(resolve(runRoot), resolve(evidenceRoot));
    if (!relation || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new TypeError("Evidence directory must be inside Run root");
  }
  private async location(filename: string): Promise<string> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(filename) || filename === "." || filename === "..") throw new TypeError("Evidence filename must be a simple basename");
    await mkdir(this.evidenceRoot, { recursive: true });
    const root = await realpath(this.runRoot);
    const directory = await realpath(this.evidenceRoot);
    const relation = relative(root, directory);
    if (!relation || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new TypeError("Evidence directory resolves outside Run root");
    const result = resolve(directory, filename);
    try { if (await realpath(result) !== result) throw new TypeError("Evidence target must not be a symlink"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return result;
  }
  private async reference(kind: string, absolute: string): Promise<ArtifactReference> {
    return { kind, path: relative(await realpath(this.runRoot), absolute).split(sep).join("/") };
  }
  async saveText(kind: string, filename: string, text: string): Promise<ArtifactReference> {
    const target = await this.location(filename);
    await atomicWriteFile(target, redactArtifact(text));
    return this.reference(kind, target);
  }
  async navigate(url: string, filename: string): Promise<ArtifactReference> {
    return this.saveText("navigation", filename, toolText(await this.tools.call("browser_navigate", { url })));
  }
  async snapshot(filename: string): Promise<{ text: string; evidence: ArtifactReference }> {
    const text = toolText(await this.tools.call("browser_snapshot", {}));
    return { text, evidence: await this.saveText("snapshot", filename, text) };
  }
  async click(target: string, filename: string): Promise<ArtifactReference> {
    return this.saveText("interaction", filename, toolText(await this.tools.call("browser_click", { target })));
  }
  async type(target: string, text: string, filename: string): Promise<ArtifactReference> {
    return this.saveText("interaction", filename, toolText(await this.tools.call("browser_type", { target, text })));
  }
  async screenshot(filename: string): Promise<ArtifactReference> {
    if (!filename.endsWith(".png")) throw new TypeError("Screenshot must be PNG");
    const target = await this.location(filename);
    toolText(await this.tools.call("browser_take_screenshot", { type: "png", filename: target, scale: "css", fullPage: true }));
    const info = await stat(target);
    if (!info.isFile() || info.size === 0 || await realpath(target) !== target) throw new Error("Screenshot was not saved as a regular evidence file");
    return this.reference("screenshot", target);
  }
  async readApi(appUrl: string, apiPath: string, filename: string): Promise<{ status: number; body: string; evidence: ArtifactReference }> {
    const base = new URL(appUrl);
    const url = new URL(apiPath, base);
    if (!["http:", "https:"].includes(base.protocol) || url.origin !== base.origin || url.username || url.password) throw new TypeError("API observation must use the application origin");
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000) });
    const body = await response.text();
    const evidence = await this.saveText("api", filename, JSON.stringify({ url: url.href, status: response.status, body }, null, 2));
    return { status: response.status, body, evidence };
  }
  async readLocalStorage(appUrl: string, keys: readonly string[], filename: string): Promise<ArtifactReference> {
    const origin = new URL(appUrl).origin;
    const expression = `() => { if (location.origin !== ${JSON.stringify(origin)}) throw new Error('Wrong application origin'); return Object.fromEntries(${JSON.stringify(keys)}.map(key => [key, localStorage.getItem(key)])); }`;
    return this.saveText("storage", filename, toolText(await this.tools.call("browser_evaluate", { function: expression })));
  }
}
