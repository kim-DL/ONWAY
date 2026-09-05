import path from "node:path";
import { pathToFileURL } from "node:url";

// Bounded, read-only production diagnosis. Never emit credentials or employee data.
const projectId = "onnuriway";
const root = path.resolve(import.meta.dirname, "..");
const load = async (file) => {
  const loaded = await import(pathToFileURL(path.join(root, "node_modules/firebase-tools/lib", file)).href);
  return loaded.default ?? loaded;
};
const options = { skipLog: { body: true, resBody: true, queryParams: true }, resolveOnHTTPError: true };
const emit = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const decode = (value) => {
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, decode(item)]));
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(decode);
  for (const key of ["stringValue", "booleanValue", "timestampValue", "doubleValue", "nullValue"]) if (key in value) return value[key];
  if ("integerValue" in value) return Number(value.integerValue);
  return null;
};
try {
  const { logger } = await load("logger.js");
  logger.silent = true;
  const auth = await load("auth.js");
  const { requireAuth } = await load("requireAuth.js");
  const { Client } = await load("apiv2.js");
  const account = auth.getGlobalDefaultAccount();
  if (!account) throw new Error("CLI_AUTH_UNAVAILABLE");
  const authOptions = { project: projectId };
  auth.setActiveAccount(authOptions, account);
  await requireAuth(authOptions);
  const logging = new Client({ urlPrefix: "https://logging.googleapis.com", apiVersion: "v2" });
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const logs = await logging.post("/entries:list", {
    resourceNames: [`projects/${projectId}`],
    filter: `timestamp >= "${since}" AND resource.type="cloud_run_revision" AND resource.labels.service_name="optimizesalesroute" AND severity>=WARNING`,
    orderBy: "timestamp desc", pageSize: 30,
  }, options);
  emit({ logsStatus: logs.status });
  for (const entry of logs.body.entries ?? []) emit({ time: entry.timestamp, severity: entry.severity,
    reason: entry.jsonPayload?.reason, schoolIds: entry.jsonPayload?.unresolvedSchoolIds,
    schoolCount: entry.jsonPayload?.schoolCount, httpStatus: entry.httpRequest?.status });
  const firestore = new Client({ urlPrefix: "https://firestore.googleapis.com", apiVersion: "v1" });
  const base = `/projects/${projectId}/databases/(default)/documents`;
  const schools = await firestore.post(`${base}:runQuery`, { structuredQuery: {
    from: [{ collectionId: "schools" }], where: { fieldFilter: { field: { fieldPath: "name" }, op: "EQUAL", value: { stringValue: "대전괴정중학교" } } }, limit: 3,
  } }, options);
  emit({ schoolQueryStatus: schools.status });
  for (const item of Array.isArray(schools.body) ? schools.body : []) {
    if (!item.document) continue;
    const school = decode({ mapValue: item.document });
    emit({ schoolId: school.schoolId, name: school.name, district: school.district, schoolType: school.schoolType,
      address: school.address, location: school.location ? { ...school.location, confirmedBy: undefined } : null,
      revision: school.schoolBaseRevision, possibleRelocation: school.possibleRelocation });
    const review = await firestore.post(`${base}:runQuery`, { structuredQuery: {
      from: [{ collectionId: "kakaoMatchReviews" }], where: { fieldFilter: { field: { fieldPath: "schoolId" }, op: "EQUAL", value: { stringValue: school.schoolId } } }, limit: 1,
    } }, options);
    const reviewDocument = Array.isArray(review.body) ? review.body.find((entry) => entry.document)?.document : null;
    const data = reviewDocument ? decode({ mapValue: reviewDocument }) : {};
    emit({ reviewStatus: review.status, reason: data.reason, status: data.status, generatedAt: data.generatedAt, candidates: data.candidates });
  }
} catch (error) {
  emit({ status: Number.isInteger(error?.status) ? error.status : "AUDIT_FAILED" });
  process.exitCode = 1;
}
