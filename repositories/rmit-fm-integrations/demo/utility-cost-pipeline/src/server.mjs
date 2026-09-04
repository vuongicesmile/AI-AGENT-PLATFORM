import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDemo } from "./pipeline.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_ROOT = path.join(ROOT, "public");
const port = Number(process.env.DEMO_PORT || 4173);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

function respondJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function serveStatic(requestPath, response) {
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\//, "");
  const absolutePath = path.resolve(PUBLIC_ROOT, relativePath);
  if (!absolutePath.startsWith(`${PUBLIC_ROOT}${path.sep}`) && absolutePath !== path.join(PUBLIC_ROOT, "index.html")) {
    respondJson(response, 403, { error: "Path is outside the public demo directory" });
    return;
  }

  try {
    const content = await readFile(absolutePath);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(absolutePath)) ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(content);
  } catch (error) {
    respondJson(response, error.code === "ENOENT" ? 404 : 500, { error: "Resource could not be loaded" });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    respondJson(response, 200, { status: "ok", mode: "local-mock", dataverseWrites: false });
    return;
  }

  if ((request.method === "GET" && url.pathname === "/api/demo")
      || (request.method === "POST" && url.pathname === "/api/replay")) {
    try {
      respondJson(response, 200, await runDemo());
    } catch (error) {
      respondJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method !== "GET") {
    respondJson(response, 405, { error: "Method not allowed" });
    return;
  }

  await serveStatic(url.pathname, response);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`RMIT FM utility cost demo: http://127.0.0.1:${port}\n`);
});
