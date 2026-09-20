import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Fixed-scope, projection-only read. No customer identifiers, field values,
// coordinates, addresses, phone numbers, credentials or API bodies are output.
const projectId = "onnuriway";
const database = `projects/${projectId}/databases/(default)`;
const parent = `${database}/documents/companies/onnuri`;
const root = path.resolve(import.meta.dirname, "..");
const options = { skipLog: { body: true, resBody: true, queryParams: true }, resolveOnHTTPError: true };
const emit = (entry) => process.stdout.write(`${JSON.stringify(entry)}\n`);
const load = async (file) => {
  const imported = await import(pathToFileURL(path.join(root, "node_modules/firebase-tools/lib", file)).href);
  return imported.default ?? imported;
};
const numeric = (field) => {
  const value = field?.doubleValue ?? field?.integerValue;
  return value === undefined ? Number.NaN : Number(value);
};
try {
  assert.equal(process.argv.length, 2);
  const { logger } = await load("logger.js"); logger.silent = true;
  const auth = await load("auth.js"); const { requireAuth } = await load("requireAuth.js"); const { Client } = await load("apiv2.js");
  const account = auth.getGlobalDefaultAccount(); assert(account);
  const authOptions = { project: projectId }; auth.setActiveAccount(authOptions, account); await requireAuth(authOptions);
  const firestore = new Client({ urlPrefix: "https://firestore.googleapis.com", apiVersion: "v1" });
  const metadata = await firestore.get(`/${database}`, options);
  assert.equal(metadata.status, 200);
  assert.equal(metadata.body.name, database);
  assert.equal(metadata.body.type, "FIRESTORE_NATIVE");
  assert.equal(metadata.body.databaseEdition, "STANDARD");
  const counts = { total: 0, districtMissing: 0, administrativeDongMissing: 0, bothRegionFieldsMissing: 0,
    coordinatesValid: 0, coordinatesMissingOrInvalid: 0, districtMissingWithCoordinates: 0,
    administrativeDongMissingWithCoordinates: 0, bothRegionFieldsMissingWithCoordinates: 0 };
  let after;
  for (let page = 0; page < 20; page++) {
    const response = await firestore.post(`/${parent}:runQuery`, {
      structuredQuery: {
        from: [{ collectionId: "customers" }],
        select: { fields: ["district", "administrativeDong", "deliveryPoint"].map((fieldPath) => ({ fieldPath })) },
        orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }], limit: 250,
        ...(after ? { startAt: { values: [{ referenceValue: after }], before: false } } : {}),
      },
    }, options);
    assert.equal(response.status, 200);
    assert(Array.isArray(response.body));
    const documents = response.body.flatMap((row) => row.document ? [row.document] : []);
    for (const document of documents) {
      assert(document.name.startsWith(`${parent}/customers/`));
      const fields = document.fields ?? {};
      const districtMissing = !fields.district?.stringValue?.trim();
      const dongMissing = !fields.administrativeDong?.stringValue?.trim();
      const point = fields.deliveryPoint?.mapValue?.fields;
      const latitude = numeric(point?.latitude); const longitude = numeric(point?.longitude);
      const coordinatesValid = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
      counts.total++;
      if (districtMissing) counts.districtMissing++;
      if (dongMissing) counts.administrativeDongMissing++;
      if (districtMissing && dongMissing) counts.bothRegionFieldsMissing++;
      if (coordinatesValid) counts.coordinatesValid++; else counts.coordinatesMissingOrInvalid++;
      if (districtMissing && coordinatesValid) counts.districtMissingWithCoordinates++;
      if (dongMissing && coordinatesValid) counts.administrativeDongMissingWithCoordinates++;
      if (districtMissing && dongMissing && coordinatesValid) counts.bothRegionFieldsMissingWithCoordinates++;
    }
    if (documents.length < 250) { emit({ projectId, collection: "companies/onnuri/customers", complete: true, counts }); process.exit(0); }
    after = documents.at(-1).name;
  }
  emit({ projectId, collection: "companies/onnuri/customers", complete: false, counts });
  process.exitCode = 1;
} catch (error) {
  emit({ status: Number.isInteger(error?.status) ? error.status : "REGION_AUDIT_STOPPED" }); process.exitCode = 1;
}
