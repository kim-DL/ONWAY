import { spawnSync } from "node:child_process";
import { uiAreas } from "./ui-change-scope.mjs";

const areas = JSON.parse(process.env.UI_AREAS || "[]");
if (!Array.isArray(areas) || !areas.length || areas.some(area => !Object.hasOwn(uiAreas, area))) {
  throw new Error("Missing or unknown UI test areas");
}
const files = kind => [...new Set(areas.flatMap(area => uiAreas[area][kind]))];
for (const args of [
  ["node_modules/vitest/vitest.mjs", "run", ...files("unit")],
  ["node_modules/@playwright/test/cli.js", "test", ...files("browser")],
]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
