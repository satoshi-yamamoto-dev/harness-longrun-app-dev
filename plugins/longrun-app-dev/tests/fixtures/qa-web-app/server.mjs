import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
export async function startQaFixture(broken = false) {
  const html = (await readFile(new URL("index.html", import.meta.url), "utf8")).replace("__BROKEN__", JSON.stringify(broken));
  const server = createServer((request, response) => {
    if (request.url === "/api/health") { response.writeHead(200, { "content-type": "application/json" }); response.end('{"ready":true}'); }
    else { response.writeHead(200, { "content-type": "text/html" }); response.end(html); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}
