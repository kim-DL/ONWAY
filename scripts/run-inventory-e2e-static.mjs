import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

export function assertStaticInventoryEnvironment(environment) {
  assert.equal(environment.INVENTORY_E2E, "true");
  assert.equal(environment.INVENTORY_E2E_STATIC, "true");
  assert.equal(environment.NEXT_PUBLIC_FIREBASE_PROJECT_ID, "demo-inventory-e2e");
  assert.equal(environment.NEXT_PUBLIC_FIREBASE_API_KEY, "demo-api-key");
  assert.equal(environment.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, "demo-inventory-e2e.firebaseapp.com");
  assert.equal(environment.NEXT_PUBLIC_USE_FIREBASE_EMULATORS, "true");
  assert.equal(environment.NEXT_PUBLIC_ENABLE_INVENTORY, "true");
  assert.equal(environment.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY, "");
  assert.equal(environment.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY, "");
  assert.ok(!environment.GOOGLE_APPLICATION_CREDENTIALS && !environment.FIREBASE_TOKEN);
}

export function assertStaticInventoryClientBundle(source) {
  assert.match(source, /projectId:["']demo-inventory-e2e["']/);
  assert.match(source, /apiKey:["']demo-api-key["']/);
  assert.match(source, /authDomain:["']demo-inventory-e2e\.firebaseapp\.com["']/);
  assert.doesNotMatch(source, /projectId:["']onnuriway["']|authDomain:["']onnuriway\.firebaseapp\.com["']|AIza[\w-]{35}/);
}

function files(directory, prefix = "") {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    assert.ok(!entry.isSymbolicLink(), "Inventory test artifacts must not contain links.");
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path, join(prefix, entry.name)) : [join(prefix, entry.name)];
  });
}

// Preserve evidence that a test build did not touch any production artifact.
function productionArtifacts(root) {
  const result = {};
  for (const directory of [".next", "out"]) {
    for (const name of files(join(root, directory))) {
      const path = join(root, directory, name);
      const stat = statSync(path);
      result[join(directory, name)] = [stat.size, stat.mtimeMs];
    }
  }
  for (const path of ["public/sw.js", "public/sw.js.map", "next-env.d.ts"]) {
    result[path] = existsSync(join(root, path)) ? createHash("sha256").update(readFileSync(join(root, path))).digest("hex") : null;
  }
  return result;
}

export function prepareStaticInventoryApp(root, runtime, environment) {
  assertStaticInventoryEnvironment(environment);
  const expectedRuntime = resolve(root, "output/playwright/inventory-runtime");
  assert.equal(resolve(runtime), expectedRuntime);
  const before = productionArtifacts(root);
  const appRoot = mkdtempSync(join(expectedRuntime, "static-app-"));
  assert.ok(appRoot.startsWith(`${expectedRuntime}${sep}static-app-`));
  // Explicit source allowlist: no .env, .firebase, .vercel, existing build or
  // credential files are copied. Next and Serwist retain their original config.
  for (const name of ["src", "public", "functions/src"]) {
    cpSync(join(root, name), join(appRoot, name), { recursive: true,
      filter: (path) => !/^sw\.js(?:\.map)?$|^swe-worker-/.test(basename(path)) });
  }
  for (const name of ["next.config.ts", "postcss.config.mjs", "package.json", "firebase.json"]) cpSync(join(root, name), join(appRoot, name));
  const tsconfig = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8"));
  writeFileSync(join(appRoot, "tsconfig.json"), JSON.stringify({ ...tsconfig,
    include: ["next-env.d.ts", ".next/types/**/*.ts", "src/**/*.ts", "src/**/*.tsx"],
    exclude: ["node_modules", "functions", "public/sw.js", "src/**/*.test.ts", "src/**/*.test.tsx"],
  }, null, 2));
  mkdirSync(join(appRoot, "scripts"));
  cpSync(join(root, "scripts/serve-hosting-local.mjs"), join(appRoot, "scripts/serve-hosting-local.mjs"));
  const buildEnvironment = { ...environment, NODE_ENV: "production" };
  try {
    const result = spawnSync(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"], {
      cwd: appRoot, env: buildEnvironment, stdio: "inherit", windowsHide: true,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, "Isolated inventory production build failed.");
    const output = join(appRoot, "out");
    const shipped = files(output);
    const client = shipped.filter((name) => name.endsWith(".js") && name.startsWith(`_next${sep}`))
      .map((name) => readFileSync(join(output, name), "utf8")).join("\n");
    assertStaticInventoryClientBundle(client);
    assert.ok(existsSync(join(output, "index.html")) && existsSync(join(output, "sw.js")) && existsSync(join(output, "manifest.webmanifest")));
    writeFileSync(join(runtime, "static-build-verification.json"), JSON.stringify({
      appRoot: relative(root, appRoot), project: "demo-inventory-e2e", productionMode: true,
      originalNextConfig: true, originalSerwistConfig: true, shippedFiles: shipped.length,
      sourceEnvironmentFilesCopied: 0, originalProductionArtifactsUnchanged: true,
      serviceWorkerHash: createHash("sha256").update(readFileSync(join(output, "sw.js"))).digest("hex"),
    }, null, 2));
    return appRoot;
  } finally {
    assert.deepEqual(productionArtifacts(root), before, "The isolated test changed original production artifacts.");
  }
}
