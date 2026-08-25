import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { assessPhase18PilotReadiness, phase18PilotPlanSchema } from "../src/features/pilot/pilot-plan.ts";

const projectRoot = process.cwd();
const outputPath = resolve(projectRoot, "output", "pilot", "phase18-readiness.json");
const configuredPlanPath = process.env.PHASE18_PILOT_PLAN ?? "pilot/phase-18-plan.local.json";

function withinProject(path: string) {
  const candidate = resolve(projectRoot, path);
  const relation = relative(projectRoot, candidate);
  if (relation.startsWith("..") || isAbsolute(relation)) {
    throw new Error(`Pilot path must stay inside the project: ${path}`);
  }
  return candidate;
}

function writeResult(result: object) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}

const planPath = withinProject(configuredPlanPath);
if (!existsSync(planPath)) {
  const result = {
    status: "blocked",
    checkedAt: new Date().toISOString(),
    issues: [`Create ${configuredPlanPath} from pilot/phase-18-plan.example.json.`],
  };
  writeResult(result);
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

const planInput = JSON.parse(readFileSync(planPath, "utf8")) as unknown;
const parsedPlan = phase18PilotPlanSchema.safeParse(planInput);
let acceptanceReport: unknown = null;
if (parsedPlan.success) {
  const acceptancePath = withinProject(parsedPlan.data.acceptanceReportPath);
  if (existsSync(acceptancePath)) {
    acceptanceReport = JSON.parse(readFileSync(acceptancePath, "utf8")) as unknown;
  }
}

const assessment = assessPhase18PilotReadiness({ plan: planInput, acceptanceReport });
const result = {
  status: assessment.ready ? "ready" : "blocked",
  checkedAt: new Date().toISOString(),
  planPath: configuredPlanPath,
  issues: assessment.issues,
};
writeResult(result);
console.log(JSON.stringify(result, null, 2));
if (!assessment.ready) process.exit(1);
