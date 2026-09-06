import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.FIXTURE_START_FAILURE === "1") {
  process.stderr.write("fixture startup failure\n");
  process.exit(21);
}

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, "dist");
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "3000");
const items = [{ id: 1, title: "Adapter fixture", completed: false }];

const server = createServer(async (request, response) => {
  if (request.url === "/api/health") {
    const ready = process.env.FIXTURE_NEVER_READY !== "1";
    response.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
    response.end(JSON.stringify({ ready }));
    return;
  }
  if (request.url === "/api/items") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(items));
    return;
  }
  try {
    const filename = request.url === "/app.js" ? "app.js" : "index.html";
    const content = await readFile(path.join(publicRoot, filename));
    response.writeHead(200, { "content-type": filename.endsWith(".js") ? "text/javascript" : "text/html" });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("not built");
  }
});

server.listen(port, host, () => process.stdout.write(`ready http://${host}:${port}\n`));

const exitAfter = Number(process.env.FIXTURE_EXIT_AFTER_MS ?? "0");
if (exitAfter > 0) setTimeout(() => process.exit(22), exitAfter).unref();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
