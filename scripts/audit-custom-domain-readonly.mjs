import path from "node:path";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";

// Only GET requests, scoped to the existing production project. Never emit keys,
// credentials, user records, API response bodies, or unfiltered error messages.
const projectId = "onnuriway";
const root = path.resolve(import.meta.dirname, "..");
const hosts = ["onnuriway.com", "www.onnuriway.com", "onnuriway.vercel.app"];
const emit = (entry) => process.stdout.write(`${JSON.stringify(entry)}\n`);
const load = async (file) => {
  const imported = await import(pathToFileURL(path.join(root, "node_modules/firebase-tools/lib", file)).href);
  return imported.default ?? imported;
};
const options = { skipLog: { body: true, resBody: true, queryParams: true }, resolveOnHTTPError: true };
const safeDomain = (value) => typeof value === "string" && /^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/i.test(value);
const safeReferrer = (value) => typeof value === "string" && /^(?:https?:\/\/)?(?:\*\.)?[a-z0-9.-]+(?::\d+)?(?:\/\*?)?$/i.test(value);

if (process.argv.includes("--apply")) {
  emit({ status: "READ_ONLY_ONLY" });
  process.exit(1);
}

try {
  const { logger } = await load("logger.js");
  logger.silent = true;
  try { loadEnvFile(path.join(root, ".env.local")); } catch { /* Environment may already be configured. */ }
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== projectId) throw new Error("scope");
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!/^1:\d+:web:[a-z0-9]+$/i.test(appId ?? "")) throw new Error("scope");
  const auth = await load("auth.js");
  const { requireAuth } = await load("requireAuth.js");
  const { Client } = await load("apiv2.js");
  const account = auth.getGlobalDefaultAccount();
  if (!account) { emit({ status: "CLI_AUTH_UNAVAILABLE" }); process.exit(1); }
  const authOptions = { project: projectId };
  auth.setActiveAccount(authOptions, account);
  await requireAuth(authOptions);
  emit({ status: "EXISTING_CLI_AUTH_READY", projectId });

  const firebase = new Client({ urlPrefix: "https://firebase.googleapis.com", apiVersion: "v1beta1" });
  const project = await firebase.get(`/projects/${projectId}`, options);
  emit({ check: "project", status: project.status });
  if (project.status !== 200 || project.body.projectId !== projectId) throw new Error("scope");
  const projectNumber = project.body.projectNumber;
  if (appId.split(":")[1] !== projectNumber) throw new Error("scope");
  const config = await firebase.get(`/projects/${projectId}/webApps/${appId}/config`, options);
  emit({ check: "webAppConfig", status: config.status });
  if (config.status !== 200 || config.body.projectId !== projectId) throw new Error("scope");
  emit({ check: "localWebConfig", apiKeyMatches: config.body.apiKey === process.env.NEXT_PUBLIC_FIREBASE_API_KEY });

  const identity = new Client({ urlPrefix: "https://identitytoolkit.googleapis.com", apiVersion: "admin/v2" });
  const authConfig = await identity.get(`/projects/${projectId}/config`, options);
  emit({ check: "authorizedDomains", status: authConfig.status });
  if (authConfig.status === 200) {
    const domains = (authConfig.body.authorizedDomains ?? []).filter(safeDomain).map((v) => v.toLowerCase());
    emit({ check: "authorizedDomains", domains, hosts: Object.fromEntries(hosts.map((host) => [host, domains.includes(host)])) });
  }

  const appCheck = new Client({ urlPrefix: "https://firebaseappcheck.googleapis.com", apiVersion: "v1" });
  const provider = await appCheck.get(`/projects/${projectNumber}/apps/${appId}/recaptchaEnterpriseConfig`, options);
  emit({ check: "appCheckProvider", status: provider.status });
  if (provider.status === 200 && /^[a-z0-9_-]+$/i.test(provider.body.siteKey ?? "")) {
    emit({ check: "localAppCheckConfig", siteKeyMatches: provider.body.siteKey === process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY });
    const recaptcha = new Client({ urlPrefix: "https://recaptchaenterprise.googleapis.com", apiVersion: "v1" });
    const key = await recaptcha.get(`/projects/${projectId}/keys/${provider.body.siteKey}`, options);
    emit({ check: "recaptchaKey", status: key.status });
    if (key.status === 200) {
      const web = key.body.webSettings;
      const domains = (web?.allowedDomains ?? []).filter(safeDomain).map((v) => v.toLowerCase());
      emit({ check: "recaptchaAllowedDomains", enforcementEnabled: !web?.allowAllDomains, domains,
        hosts: Object.fromEntries(hosts.map((host) => [host, web?.allowAllDomains === true || domains.some((d) => host === d || host.endsWith(`.${d}`))])) });
    }
  }

  const apiKeys = new Client({ urlPrefix: "https://apikeys.googleapis.com", apiVersion: "v2" });
  const lookup = await apiKeys.get("/keys:lookupKey", { ...options, queryParams: { keyString: config.body.apiKey } });
  emit({ check: "webApiKeyLookup", status: lookup.status });
  if (lookup.status === 200) {
    const keyName = lookup.body.name;
    if (typeof keyName !== "string" || !keyName.startsWith(`projects/${projectNumber}/locations/global/keys/`) || !/^[a-z0-9/_-]+$/i.test(keyName)) throw new Error("scope");
    const key = await apiKeys.get(`/${keyName}`, options);
    emit({ check: "webApiKeyRestrictions", status: key.status });
    if (key.status === 200) {
      const restrictions = key.body.restrictions ?? {};
      const referrers = restrictions.browserKeyRestrictions?.allowedReferrers ?? [];
      emit({ check: "webApiKeyRestrictions", browserRestrictionPresent: !!restrictions.browserKeyRestrictions,
        allowedReferrers: referrers.filter(safeReferrer), unprintedReferrerCount: referrers.filter((v) => !safeReferrer(v)).length,
        otherClientRestrictionPresent: !!(restrictions.serverKeyRestrictions || restrictions.androidKeyRestrictions || restrictions.iosKeyRestrictions),
        apiServices: (restrictions.apiTargets ?? []).map((target) => target.service).filter(safeDomain) });
    }
  }
} catch (error) {
  emit({ status: Number.isInteger(error?.status) ? error.status : "READ_ONLY_DOMAIN_AUDIT_FAILED" });
  process.exitCode = 1;
}
