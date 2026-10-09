import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "functions/tests/mcp/browser.test.ts", "functions/tests/mcp/photo-view.browser.test.ts", "functions/tests/mcp/photo-mobile.browser.test.ts", "functions/tests/mcp/inventory-write.browser.test.ts", "functions/tests/mcp/login.browser.test.ts", "functions/tests/mcp/inventory-photo.browser.test.ts", "--maxWorkers=1"], {
  env: { ...process.env, MCP_BROWSER_TEST: "true" }, stdio: "inherit",
});
process.exit(result.status ?? 1);
