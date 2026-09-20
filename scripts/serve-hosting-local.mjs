import { createRequire } from "node:module";
import { readFile, stat } from "node:fs/promises";
import { posix, resolve } from "node:path";

// Local-only static server using the same engine as Firebase's Hosting emulator.
// No CLI authentication, credentials, deployment, or production data access.
const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
let port = 3000;
let hostname = "127.0.0.1";
try {
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (option === "--port" && value && /^\d+$/.test(value)) port = Number(value);
    else if (option === "--hostname" && value === "127.0.0.1") hostname = value;
    else throw new Error("Usage: npm start -- [--port 3000] [--hostname 127.0.0.1]");
  }
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error("Use a local port between 1024 and 65535.");
  const { hosting } = JSON.parse(await readFile(resolve(root, "firebase.json"), "utf8"));
  if (hosting?.site !== "onnuriway" || hosting.public !== "out") throw new Error("Expected the onnuriway static Hosting configuration.");
  if (!(await stat(resolve(root, "out/index.html"))).isFile()) throw new Error("Run npm run build first.");
  // Resolve through our pinned firebase-tools dependency instead of introducing
  // a second server implementation or an independently versioned dependency.
  const require = createRequire(import.meta.url);
  const firebaseRequire = createRequire(require.resolve("firebase-tools/package.json"));
  const { server: createServer } = firebaseRequire("superstatic");
  const onHeaders = firebaseRequire("on-headers");
  const { headers = [], ...staticConfig } = hosting;
  // Superstatic's legacy glob-slasher converts URL slashes to backslashes on
  // Windows. Apply Hosting header globs with URL/POSIX semantics on every OS.
  const headerMiddleware = (request, response, next) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    onHeaders(response, () => {
      for (const rule of headers) {
        if (!posix.matchesGlob(pathname, rule.source)) continue;
        for (const header of rule.headers) response.setHeader(header.key, header.value);
      }
    });
    next();
  };
  const server = createServer({
    config: { ...staticConfig, headers: [] }, cwd: root, port, hostname,
    compression: true, stack: "strict", before: { headers: headerMiddleware },
  }).listen(() => {
    console.log(`Local Firebase Hosting assets: http://${hostname}:${port}`);
  });
  server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  const stop = () => { server.close(() => process.exit(0)); server.closeAllConnections(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not start the local Hosting server.");
  process.exitCode = 1;
}
