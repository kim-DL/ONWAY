import path from "node:path";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";

// Read-only diagnosis: never print credentials, log messages, request headers, bodies or identities.
const projectId = "onnuriway";
const root = path.resolve(import.meta.dirname, "..");
const firebaseToolsRoot = path.join(root, "node_modules", "firebase-tools", "lib");
const start = process.argv.find((value) => value.startsWith("--from="))?.slice(7) ?? "2026-09-04T23:05:00Z";
const end = process.argv.find((value) => value.startsWith("--to="))?.slice(5) ?? "2026-09-04T23:15:00Z";
const requestedHosts = process.argv.filter((value) => value.startsWith("--host=")).map((value) => value.slice(7).toLowerCase());
const safeHostname = (value) => typeof value === "string" && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]+$/i.test(value);
const validTime = (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && Number.isFinite(Date.parse(value));
if (!validTime(start) || !validTime(end) || Date.parse(end) <= Date.parse(start) || Date.parse(end) - Date.parse(start) > 86_400_000 || requestedHosts.some((host) => !safeHostname(host))) {
  process.stdout.write(`${JSON.stringify({ status: "INVALID_AUDIT_SCOPE" })}\n`);
  process.exit(1);
}
if (process.argv.includes("--apply")) {
  process.stdout.write(`${JSON.stringify({ status: "READ_ONLY_ONLY" })}\n`);
  process.exit(1);
}

const emit = (entry) => process.stdout.write(`${JSON.stringify(entry)}\n`);
const load = async (file) => {
  const importedModule = await import(pathToFileURL(path.join(firebaseToolsRoot, file)).href);
  return importedModule.default ?? importedModule;
};
const options = { skipLog: { body: true, resBody: true, queryParams: true }, resolveOnHTTPError: true };
const hostname = (value) => {
  try { return new URL(value).hostname.toLowerCase(); } catch { return null; }
};
const verification = (value) => ["VALID", "INVALID", "MISSING"].includes(value) ? value : "UNAVAILABLE";

try {
  const { logger } = await load("logger.js");
  logger.silent = true;
  try { loadEnvFile(path.join(root, ".env.local")); } catch { /* Site key can be supplied by the existing environment. */ }
  const configuredSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;
  const auth = await load("auth.js");
  const { requireAuth } = await load("requireAuth.js");
  const { Client } = await load("apiv2.js");
  const account = auth.getGlobalDefaultAccount();
  if (!account) { emit({ status: "CLI_AUTH_UNAVAILABLE" }); process.exit(1); }
  const authOptions = { project: projectId };
  auth.setActiveAccount(authOptions, account);
  await requireAuth(authOptions);

  const recaptcha = new Client({ urlPrefix: "https://recaptchaenterprise.googleapis.com", apiVersion: "v1" });
  const keys = await recaptcha.get(`/projects/${projectId}/keys`, { ...options, queryParams: { pageSize: 1000 } });
  emit({ status: keys.status, hostname: "recaptchaenterprise.googleapis.com" });
  if (keys.status === 200) {
    const configured = keys.body.keys?.find((key) => key.name?.split("/").at(-1) === configuredSiteKey);
    emit({ status: configured ? "CONFIGURED_APP_CHECK_KEY_FOUND" : "CONFIGURED_APP_CHECK_KEY_NOT_FOUND" });
    if (configured) {
      const web = configured.webSettings;
      emit({ status: web?.allowAllDomains ? "DOMAIN_ENFORCEMENT_DISABLED" : "DOMAIN_ENFORCEMENT_ENABLED" });
      const domains = (web?.allowedDomains ?? []).filter(safeHostname).map((value) => value.toLowerCase());
      for (const domain of domains) emit({ status: "RECAPTCHA_REGISTERED_DOMAIN", hostname: domain });
      for (const host of requestedHosts) {
        const allowed = web?.allowAllDomains === true || domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
        emit({ status: allowed ? "RECAPTCHA_HOST_ALLOWED" : "RECAPTCHA_HOST_DENIED", hostname: host });
      }
    }
  }

  const identity = new Client({ urlPrefix: "https://identitytoolkit.googleapis.com", apiVersion: "admin/v2" });
  const authConfig = await identity.get(`/projects/${projectId}/config`, options);
  emit({ status: authConfig.status, hostname: "identitytoolkit.googleapis.com" });
  if (authConfig.status === 200) {
    for (const domain of authConfig.body.authorizedDomains ?? []) {
      if (safeHostname(domain)) emit({ status: "FIREBASE_AUTH_REGISTERED_DOMAIN", hostname: domain.toLowerCase() });
    }
  }

  const logging = new Client({ urlPrefix: "https://logging.googleapis.com", apiVersion: "v2" });
  let pageToken;
  for (let page = 0; page < 5; page += 1) {
    const response = await logging.post("/entries:list", {
      resourceNames: [`projects/${projectId}`],
      filter: `timestamp >= "${start}" AND timestamp < "${end}" AND ((resource.type="cloud_run_revision" AND resource.labels.service_name="employeelogin") OR (resource.type="cloud_function" AND resource.labels.function_name="employeeLogin"))`,
      orderBy: "timestamp asc", pageSize: 100,
      ...(pageToken ? { pageToken } : {}),
    }, options);
    emit({ status: response.status, hostname: "logging.googleapis.com" });
    if (response.status !== 200) break;
    for (const entry of response.body.entries ?? []) {
      const requestHostname = hostname(entry.httpRequest?.requestUrl);
      const refererHostname = hostname(entry.httpRequest?.referer);
      const verifications = entry.jsonPayload?.verifications;
      if (!entry.httpRequest && !verifications) continue;
      emit({
        timestamp: entry.timestamp,
        severity: ["DEFAULT", "DEBUG", "INFO", "NOTICE", "WARNING", "ERROR", "CRITICAL", "ALERT", "EMERGENCY"].includes(entry.severity) ? entry.severity : "UNAVAILABLE",
        status: Number.isInteger(entry.httpRequest?.status) ? entry.httpRequest.status : "VERIFICATION",
        ...(requestHostname ? { requestHostname } : {}),
        ...(refererHostname ? { refererHostname } : {}),
        ...(verifications ? { appVerification: verification(verifications.app), authVerification: verification(verifications.auth) } : {}),
      });
    }
    pageToken = response.body.nextPageToken;
    if (!pageToken) break;
    if (page === 4) emit({ status: "LOG_PAGE_LIMIT_REACHED" });
  }
} catch (error) {
  emit({ status: Number.isInteger(error?.status) ? error.status : "AUDIT_READ_FAILED" });
  process.exitCode = 1;
}
