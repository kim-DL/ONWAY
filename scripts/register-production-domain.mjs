import assert from "node:assert/strict";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";

// Explicitly scoped, additive only. Dry-run is the default. Credentials and full
// API payloads remain in memory and are never printed or written to disk.
const projectId = "onnuriway";
const domain = "onnuriway.com";
const apply = process.argv.includes("--apply");
const root = path.resolve(import.meta.dirname, "..");
const emit = (entry) => process.stdout.write(`${JSON.stringify(entry)}\n`);
const load = async (file) => {
  const imported = await import(pathToFileURL(path.join(root, "node_modules/firebase-tools/lib", file)).href);
  return imported.default ?? imported;
};
const options = { skipLog: { body: true, resBody: true, queryParams: true }, resolveOnHTTPError: true };
const domainUnion = (values) => {
  assert(Array.isArray(values) && values.every((value) => typeof value === "string"));
  return [...new Set([...values, domain])];
};
const withoutDomains = (body, field) => {
  const result = structuredClone(body);
  delete result.updateTime;
  if (field === "authorizedDomains") delete result.authorizedDomains;
  else delete result.webSettings.allowedDomains;
  return result;
};
const verify = (before, after, field) => {
  const previous = field === "authorizedDomains" ? before.authorizedDomains : before.webSettings.allowedDomains;
  const current = field === "authorizedDomains" ? after.authorizedDomains : after.webSettings.allowedDomains;
  assert(current.includes(domain) && previous.every((value) => current.includes(value)));
  assert.deepEqual(new Set(current), new Set(domainUnion(previous)));
  assert.deepEqual(withoutDomains(after, field), withoutDomains(before, field));
  if (field !== "authorizedDomains") assert.notEqual(after.webSettings.allowAllDomains, true);
  emit({ check: field, verified: true, newDomainPresent: true, existingDomainsPreserved: true, otherConfigurationUnchanged: true,
    ...(field !== "authorizedDomains" ? { domainEnforcementEnabled: true } : {}) });
};

try {
  assert(process.argv.slice(2).every((arg) => ["--apply", "--dry-run"].includes(arg)));
  assert(!(apply && process.argv.includes("--dry-run")));
  const { logger } = await load("logger.js");
  logger.silent = true;
  try { loadEnvFile(path.join(root, ".env.local")); } catch { /* Already configured environment is allowed. */ }
  assert.equal(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, projectId);
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  assert(/^1:\d+:web:[a-z0-9]+$/i.test(appId ?? ""));
  const auth = await load("auth.js");
  const { requireAuth } = await load("requireAuth.js");
  const { Client } = await load("apiv2.js");
  const account = auth.getGlobalDefaultAccount();
  assert(account);
  const authOptions = { project: projectId };
  auth.setActiveAccount(authOptions, account);
  await requireAuth(authOptions);
  const firebase = new Client({ urlPrefix: "https://firebase.googleapis.com", apiVersion: "v1beta1" });
  const project = await firebase.get(`/projects/${projectId}`, options);
  assert.equal(project.status, 200);
  assert.equal(project.body.projectId, projectId);
  assert.equal(appId.split(":")[1], project.body.projectNumber);
  const appCheck = new Client({ urlPrefix: "https://firebaseappcheck.googleapis.com", apiVersion: "v1" });
  const providerPath = `/projects/${project.body.projectNumber}/apps/${appId}/recaptchaEnterpriseConfig`;
  const provider = await appCheck.get(providerPath, options);
  assert.equal(provider.status, 200);
  assert(/^[a-z0-9_-]+$/i.test(provider.body.siteKey ?? ""));
  assert.equal(provider.body.siteKey, process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY);
  const identity = new Client({ urlPrefix: "https://identitytoolkit.googleapis.com", apiVersion: "admin/v2" });
  const recaptcha = new Client({ urlPrefix: "https://recaptchaenterprise.googleapis.com", apiVersion: "v1" });
  const authPath = `/projects/${projectId}/config`;
  const keyPath = `/projects/${projectId}/keys/${provider.body.siteKey}`;
  emit({ mode: apply ? "apply" : "dry-run", projectId, domain });

  // Read immediately before the masked patch; never replace an earlier snapshot.
  const authBefore = await identity.get(authPath, options);
  assert.equal(authBefore.status, 200);
  const authorizedDomains = domainUnion(authBefore.body.authorizedDomains);
  emit({ check: "authorizedDomains", additionNeeded: !authBefore.body.authorizedDomains.includes(domain) });
  if (apply) {
    if (!authBefore.body.authorizedDomains.includes(domain)) {
      const updated = await identity.patch(authPath, { authorizedDomains }, { ...options, queryParams: { updateMask: "authorizedDomains" } });
      assert.equal(updated.status, 200);
    }
    const authAfter = await identity.get(authPath, options);
    assert.equal(authAfter.status, 200);
    verify(authBefore.body, authAfter.body, "authorizedDomains");
  }

  const providerCurrent = await appCheck.get(providerPath, options);
  assert.equal(providerCurrent.status, 200);
  assert.deepEqual(providerCurrent.body, provider.body);
  const keyBefore = await recaptcha.get(keyPath, options);
  assert.equal(keyBefore.status, 200);
  assert.notEqual(keyBefore.body.webSettings?.allowAllDomains, true);
  const allowedDomains = domainUnion(keyBefore.body.webSettings.allowedDomains);
  emit({ check: "webSettings.allowedDomains", additionNeeded: !keyBefore.body.webSettings.allowedDomains.includes(domain) });
  if (apply) {
    if (!keyBefore.body.webSettings.allowedDomains.includes(domain)) {
      const updated = await recaptcha.patch(keyPath, { webSettings: { allowedDomains } }, { ...options, queryParams: { updateMask: "webSettings.allowedDomains" } });
      assert.equal(updated.status, 200);
    }
    const keyAfter = await recaptcha.get(keyPath, options);
    assert.equal(keyAfter.status, 200);
    verify(keyBefore.body, keyAfter.body, "webSettings.allowedDomains");
    const providerAfter = await appCheck.get(providerPath, options);
    assert.equal(providerAfter.status, 200);
    assert.deepEqual(providerAfter.body, provider.body);
    emit({ check: "appCheckProvider", keyAndSecurityConfigurationUnchanged: true });
  }
  emit({ status: apply ? "VERIFIED" : "DRY_RUN_COMPLETE" });
} catch (error) {
  emit({ status: Number.isInteger(error?.status) ? error.status : "DOMAIN_REGISTRATION_STOPPED", mode: apply ? "apply" : "dry-run" });
  process.exitCode = 1;
}
