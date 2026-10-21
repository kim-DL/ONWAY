const requiredChecks = [
  "audit", "lint", "typecheck", "unit", "search-performance", "functions-build",
  "production-build", "browser", "deferred-tools", "phase17", "inventory-photos", "delivery-photos",
];

try {
  const results = JSON.parse(process.env.CI_RESULTS ?? "null");
  if (
    !results || typeof results !== "object" || Array.isArray(results) ||
    Object.keys(results).length !== requiredChecks.length ||
    Object.keys(results).some((id) => !requiredChecks.includes(id))
  ) {
    throw new Error("The complete set of required CI results is missing or invalid.");
  }
  const rejected = requiredChecks.filter((id) => results[id]?.result !== "success");
  if (rejected.length) {
    throw new Error(`Required checks did not succeed: ${rejected.join(", ")}`);
  }
  console.log(`All ${requiredChecks.length} required CI checks succeeded.`);
} catch (error) {
  console.error(
    error instanceof SyntaxError ? "CI results are not valid JSON." :
      error instanceof Error ? error.message : "CI result verification failed.",
  );
  process.exitCode = 1;
}
