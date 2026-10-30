import { allChecks, profiles } from "./ci-scope.mjs";

try {
  const results = JSON.parse(process.env.CI_RESULTS ?? "null");
  const expectedIds = ["plan", ...allChecks];
  if (
    !results || typeof results !== "object" || Array.isArray(results) ||
    Object.keys(results).length !== expectedIds.length ||
    Object.keys(results).some((id) => !expectedIds.includes(id))
  ) {
    throw new Error("The complete set of required CI results is missing or invalid.");
  }
  const profile = results.plan?.outputs?.profile;
  if (results.plan?.result !== "success" || !Object.hasOwn(profiles, profile)) {
    throw new Error("CI scope planning did not succeed or returned an unknown profile.");
  }
  const requiredChecks = profiles[profile];
  if (JSON.stringify(JSON.parse(results.plan.outputs.required ?? "null")) !== JSON.stringify(requiredChecks)) {
    throw new Error("CI scope does not match the canonical required checks.");
  }
  const rejected = allChecks.filter((id) =>
    results[id]?.result !== (requiredChecks.includes(id) ? "success" : "skipped"));
  if (rejected.length) {
    throw new Error(`Required checks did not succeed: ${rejected.join(", ")}`);
  }
  console.log(`All ${requiredChecks.length} required CI checks succeeded (${profile}); only planned exclusions were skipped.`);
} catch (error) {
  console.error(
    error instanceof SyntaxError ? "CI results are not valid JSON." :
      error instanceof Error ? error.message : "CI result verification failed.",
  );
  process.exitCode = 1;
}
