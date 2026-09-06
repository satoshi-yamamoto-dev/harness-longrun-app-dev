import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

// Small stdio JSON-RPC client for deterministic local MCP integration tests.
export class McpClient {
  constructor(config) {
    this.pending = new Map();
    this.nextId = 0;
    this.stderr = "";
    this.child = spawn(config.command, config.args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.lines = createInterface({ input: this.child.stdout });
    this.child.stderr.on("data", (data) => { this.stderr = (this.stderr + data).slice(-16000); });
    const fail = (error) => { for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); } this.pending.clear(); };
    this.child.on("error", fail);
    this.child.on("exit", (code) => fail(new Error(`MCP exited (${code}): ${this.stderr}`)));
    this.lines.on("line", (line) => {
      try {
        const message = JSON.parse(line);
        const pending = this.pending.get(message.id);
        if (pending && ("result" in message || "error" in message)) {
          clearTimeout(pending.timer); this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
          else pending.resolve(message.result);
        } else if (message.method && message.id !== undefined) {
          this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: message.method === "roots/list" ? { roots: [] } : {} }) + "\n");
        }
      } catch (error) { fail(error); }
    });
  }
  request(method, params = {}, timeoutMs = 30000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`MCP timeout: ${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n", (error) => {
        if (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
      });
    });
  }
  async initialize() {
    const result = await this.request("initialize", { protocolVersion: "2024-11-05", capabilities: { roots: { listChanged: false } }, clientInfo: { name: "longrun-mcp-check", version: "0.1.0" } });
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    return result;
  }
  async call(name, args = {}) {
    const result = await this.request("tools/call", { name, arguments: args });
    if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`);
    return result;
  }
  async close() {
    try { await this.request("tools/call", { name: "browser_close", arguments: {} }, 5000); } catch { /* still terminate transport */ }
    this.lines.close();
    this.child.stdin.end();
    if (this.child.exitCode === null) {
      const exited = new Promise((resolve) => this.child.once("exit", resolve));
      let timer;
      await Promise.race([exited, new Promise((resolve) => { timer = setTimeout(resolve, 2000); })]);
      clearTimeout(timer);
      if (this.child.exitCode === null) this.child.kill();
    }
  }
}

export const resultText = (result) => (result.content ?? []).filter((item) => item.type === "text").map((item) => item.text).join("\n");
