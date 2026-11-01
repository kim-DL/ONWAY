import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { classifyChanges, allChecks } from "./ci-scope.mjs";

const path = "src/features/customers/customer-home.tsx";
const before = 'export function Home(){return <button onClick={save}><img className={styles.icon} />검색</button>}';
const change = after => ({path, status: "M", before, after});
test("literal UI attributes and text select the customer suite", () => {
  const plan = classifyChanges([change(before.replace("className={styles.icon}", 'className="small" width={48} height={48} style={{margin:12}}').replace("검색", "찾기"))]);
  assert.equal(plan.profile, "ui");
  assert.deepEqual(plan.areas, ["customer"]);
  assert.deepEqual(plan.required, ["lint", "typecheck", "production-build", "ui"]);
});
test("real icon regression selects UI rather than full", () => {
  const oldSource = execFileSync("git", ["show", "23649dc:src/features/customers/customer-home.tsx"], {encoding:"utf8"});
  assert.equal(classifyChanges([{path, status:"M", before:oldSource, after:oldSource.replace('data-icon={name}', 'width={48} height={48} data-icon={name}')}]).profile, "ui");
});
test("handlers, dynamic expressions, custom props and code hidden in strings stay full", () => {
  for (const after of [before.replace("save", "erase"), before + ";writeData()", before.replace("<img", "<Image"),
    before.replace("<img", "<img width={getWidth()}"), before.replace("return", 'const s="width={48}";return'),
    before.replace("<img", "<img src=\"/other.webp\""), before.replace("<img", "<img {...props}"),
    before.replace("styles.icon", "permissions.icon")]) {
    assert.equal(classifyChanges([change(after)]).profile, "full", after);
  }
});
test("feature styles and paired tests select only affected areas", () => {
  assert.deepEqual(classifyChanges([{path:"src/features/inventory/inventory.module.css",status:"M"}]).areas,["inventory"]);
  assert.equal(classifyChanges([change(before.replace("검색", "찾기")), {path:"tests/e2e/customer-ceramic-navigation.spec.ts",status:"M"}]).profile,"ui");
  assert.equal(classifyChanges([change(before),{path:"functions/src/index.ts",status:"M"}]).profile,"full");
});
test("policy-only changes test CI policy; mixed product or dependency changes remain full", () => {
  assert.equal(classifyChanges([{path:"scripts/ci-scope.mjs",status:"M"}]).profile,"policy");
  assert.equal(classifyChanges([{path:"scripts/ci-scope.mjs",status:"M"},change(before)]).profile,"full");
  assert.equal(classifyChanges([{path:"scripts/ci-scope.mjs",status:"M"},{path:"package.json",status:"M"}]).profile,"full");
});
test("workflow has exactly the canonical jobs and enforces every result", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const jobs = [...workflow.slice(workflow.indexOf("jobs:")).matchAll(/^  ([\w-]+):\r?$/gm)].map(m => m[1]);
  assert.deepEqual(jobs.sort(), ["plan", "verify", ...allChecks].sort());
  const final = workflow.slice(workflow.indexOf("  verify:"));
  for (const name of ["plan", ...allChecks]) assert.ok(final.includes(`      - ${name}\n`) || final.includes(`      - ${name}\r\n`), name);
  assert.ok(final.includes("${{ always() }}"));
});
