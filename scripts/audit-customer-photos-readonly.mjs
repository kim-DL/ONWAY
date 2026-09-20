import path from "node:path";
import { pathToFileURL } from "node:url";

// Production diagnostics only. No user records, raw logs, image content,
// credentials, object names or complete API responses are printed or stored.
const projectId = "onnuriway";
const root = path.resolve(import.meta.dirname, "..");
const options = { skipLog: { body: true, resBody: true, queryParams: true }, resolveOnHTTPError: true };
const emit = (entry) => process.stdout.write(`${JSON.stringify(entry)}\n`);
const load = async (file) => {
  const imported = await import(pathToFileURL(path.join(root, "node_modules/firebase-tools/lib", file)).href);
  return imported.default ?? imported;
};
try {
  if (process.argv.length > 2) throw new Error("Read-only fixed scope");
  const { logger } = await load("logger.js"); logger.silent = true;
  const auth = await load("auth.js");
  const { requireAuth } = await load("requireAuth.js");
  const { Client } = await load("apiv2.js");
  const account = auth.getGlobalDefaultAccount();
  if (!account) throw new Error("CLI authentication unavailable");
  const authOptions = { project: projectId }; auth.setActiveAccount(authOptions, account); await requireAuth(authOptions);
  const functions = new Client({ urlPrefix: "https://cloudfunctions.googleapis.com", apiVersion: "v2" });
  const runtimeAccounts = new Set(); const buckets = new Set(); const services = new Set();
  for (const functionId of ["uploadCustomerPhoto", "getCustomerPhoto", "expireCustomerPhotos"]) {
    const response = await functions.get(`/projects/${projectId}/locations/asia-northeast3/functions/${functionId}`, options);
    emit({ check: "function", functionId, httpStatus: response.status, active: response.body.state === "ACTIVE", updateTime: response.body.updateTime });
    if (response.status !== 200) continue;
    const config = response.body.serviceConfig ?? {};
    const serviceId = config.service?.split("/").at(-1);
    if (typeof serviceId === "string" && /^[a-z0-9-]+$/i.test(serviceId)) services.add(serviceId);
    runtimeAccounts.add(config.serviceAccountEmail);
    let bucket; try { bucket = JSON.parse(config.environmentVariables?.FIREBASE_CONFIG ?? "{}").storageBucket; } catch { /* safe diagnostics only */ }
    emit({ check: "runtime", functionId, serviceId, memory: config.availableMemory, timeoutSeconds: config.timeoutSeconds, configuredBucketPresent: !!bucket,
      projectEnvironmentMatches: [config.environmentVariables?.GCLOUD_PROJECT, config.environmentVariables?.GOOGLE_CLOUD_PROJECT].some((v) => v === projectId) });
    const target = bucket ?? `${projectId}.appspot.com`;
    if (/^onnuriway\.(?:appspot\.com|firebasestorage\.app)$/.test(target)) buckets.add(target);
    else emit({ check: "bucket", unexpectedTarget: true });
  }
  const storage = new Client({ urlPrefix: "https://storage.googleapis.com", apiVersion: "storage/v1" });
  for (const bucket of buckets) {
    const response = await storage.get(`/b/${bucket}`, { ...options, queryParams: { fields: "name,location,iamConfiguration" } });
    emit({ check: "bucket", httpStatus: response.status, suffix: bucket.endsWith(".appspot.com") ? "appspot.com" : "firebasestorage.app",
      location: response.body.location, uniformAccess: response.body.iamConfiguration?.uniformBucketLevelAccess?.enabled,
      publicAccessPrevention: response.body.iamConfiguration?.publicAccessPrevention });
    const policy = await storage.get(`/b/${bucket}/iam`, options);
    emit({ check: "bucketRuntimeRoles", httpStatus: policy.status, roles: (policy.body.bindings ?? []).filter((binding) => binding.members?.some((member) => [...runtimeAccounts].some((account) => member === `serviceAccount:${account}`))).map((binding) => binding.role) });
  }
  const crm = new Client({ urlPrefix: "https://cloudresourcemanager.googleapis.com", apiVersion: "v1" });
  const policy = await crm.post(`/projects/${projectId}:getIamPolicy`, {}, options);
  emit({ check: "projectRuntimeRoles", httpStatus: policy.status, roles: (policy.body.bindings ?? []).filter((binding) => binding.members?.some((member) => [...runtimeAccounts].some((account) => member === `serviceAccount:${account}`))).map((binding) => binding.role) });
  const logging = new Client({ urlPrefix: "https://logging.googleapis.com", apiVersion: "v2" });
  const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const counts = {}; const recentErrors = []; let pageToken;
  for (let page = 0; page < 6; page++) {
    const response = await logging.post("/entries:list", {
      resourceNames: [`projects/${projectId}`],
      filter: `timestamp >= "${start}" AND resource.type="cloud_run_revision" AND (${[...services].map((service) => `resource.labels.service_name="${service}"`).join(" OR ")})`,
      orderBy: "timestamp desc", pageSize: 100, ...(pageToken ? { pageToken } : {}),
    }, options);
    emit({ check: "logs", httpStatus: response.status, page });
    if (response.status !== 200) break;
    for (const entry of response.body.entries ?? []) {
      const service = entry.resource?.labels?.service_name;
      const status = entry.httpRequest?.status;
      const rawText = `${entry.textPayload ?? ""} ${entry.jsonPayload?.message ?? ""}`;
      const categories = [];
      if (/Customer photo operation failed/.test(rawText)) categories.push("customer-photo-internal");
      if (/bucket.*(?:exist|not found)|No such bucket/i.test(rawText)) categories.push("bucket-missing");
      if (/permission.denied|forbidden|storage\.objects/i.test(rawText)) categories.push("permission");
      if (/sharp|unsupported image|Input buffer|image.*format|decode/i.test(rawText)) categories.push("image-processing");
      if (/memory|heap|OOMKilled/i.test(rawText)) categories.push("memory");
      if (/too large|payload|request.*size/i.test(rawText)) categories.push("payload-size");
      if (entry.jsonPayload?.verifications) for (const [key, value] of Object.entries(entry.jsonPayload.verifications)) {
        if (["app", "auth"].includes(key) && ["VALID", "INVALID", "MISSING"].includes(value)) categories.push(`${key}-${value}`);
      }
      if (status) counts[`${service}:HTTP${status}`] = (counts[`${service}:HTTP${status}`] ?? 0) + 1;
      for (const category of categories) counts[`${service}:${category}`] = (counts[`${service}:${category}`] ?? 0) + 1;
      if (recentErrors.length < 20 && ((Number.isInteger(status) && status >= 400) || entry.severity === "ERROR")) {
        recentErrors.push({ timestamp: entry.timestamp, service, httpStatus: status, categories });
      }
    }
    pageToken = response.body.nextPageToken;
    if (!pageToken) break;
  }
  emit({ check: "photoLogs24h", counts, recentErrors, truncated: !!pageToken });
  if (Object.keys(counts).length === 0) {
    const history = await logging.post("/entries:list", {
      resourceNames: [`projects/${projectId}`],
      filter: `resource.type="cloud_run_revision" AND (${[...services].map((service) => `resource.labels.service_name="${service}"`).join(" OR ")})`,
      orderBy: "timestamp desc", pageSize: 30,
    }, options);
    emit({ check: "boundedPhotoHistory", httpStatus: history.status, rows: (history.body.entries ?? []).map((entry) => ({
      timestamp: entry.timestamp, service: entry.resource?.labels?.service_name, severity: entry.severity,
      httpStatus: entry.httpRequest?.status, knownInternal: /Customer photo operation failed/.test(entry.jsonPayload?.message ?? ""),
    })) });
  }
} catch (error) {
  emit({ status: Number.isInteger(error?.status) ? error.status : "PHOTO_AUDIT_FAILED" }); process.exitCode = 1;
}
