import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../website/", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/" || url.pathname === "/voyager") {
      response.writeHead(302, { Location: "/voyager/" });
      response.end();
      return;
    }
    if (!url.pathname.startsWith("/voyager/")) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    const relative =
      decodeURIComponent(url.pathname.slice("/voyager/".length)) ||
      "index.html";
    const file = path.resolve(root, relative);
    if (!file.startsWith(root) || !mime[path.extname(file)]) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, {
      "Content-Type": mime[path.extname(file)],
      "Cache-Control": "no-store",
    });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
server.listen(4173, "127.0.0.1", () =>
  console.log("Voyager website: http://127.0.0.1:4173/voyager/"),
);
process.on("SIGINT", () => server.close());
