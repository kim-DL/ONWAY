import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function assertValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function normalizeEmail(value) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 254) {
    throw new Error("A valid Google email is required.");
  }
  return email;
}

function validateEmployeeId(value) {
  if (!/^EMP-[A-Z0-9-]{3,40}$/u.test(value)) {
    throw new Error("Employee ID must match EMP-[A-Z0-9-]{3,40}.");
  }
  return value;
}

async function loadFirebaseToolsModule(firebaseToolsRoot, relativePath) {
  const importedModule = await import(pathToFileURL(path.join(firebaseToolsRoot, relativePath)).href);
  return importedModule.default ?? importedModule;
}

function decodeFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  }
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, child]) => [
        key,
        decodeFirestoreValue(child),
      ]),
    );
  }
  if ("nullValue" in value) return null;
  return null;
}

function decodeFirestoreDocument(document) {
  return {
    data: Object.fromEntries(
      Object.entries(document.fields ?? {}).map(([key, value]) => [
        key,
        decodeFirestoreValue(value),
      ]),
    ),
    updateTime: document.updateTime,
  };
}

async function readFirestoreDocument(client, documentName) {
  try {
    return decodeFirestoreDocument((await client.get(documentName)).body);
  } catch (error) {
    if (error?.status === 404 || error?.original?.status === 404) return null;
    throw error;
  }
}

const stringValue = (value) => ({ stringValue: value });
const booleanValue = (value) => ({ booleanValue: value });
const integerValue = (value) => ({ integerValue: String(value) });
const timestampValue = (value) => ({ timestampValue: value });
const nullValue = () => ({ nullValue: null });
const stringArrayValue = (values) => ({
  arrayValue: { values: values.map(stringValue) },
});

function updateWrite(name, fields, fieldPaths, snapshot) {
  return {
    update: { name, fields },
    ...(snapshot ? { updateMask: { fieldPaths } } : {}),
    currentDocument: snapshot
      ? { updateTime: snapshot.updateTime }
      : { exists: false },
  };
}

const projectId = option("--project") ?? "onnuriway";
const employeeId = validateEmployeeId(option("--employee-id") ?? "EMP-ADMIN-OWNER");
const displayName = option("--display-name") ?? "최초 관리자";
const apply = process.argv.includes("--apply");

if (projectId !== "onnuriway") {
  throw new Error("This repository only permits Google admin provisioning in project onnuriway.");
}
if (!displayName.trim() || displayName.trim().length > 80) {
  throw new Error("Display name must contain 1 to 80 characters.");
}

const projectRoot = path.resolve(import.meta.dirname, "..");
const firebaseToolsRoot = path.join(projectRoot, "node_modules", "firebase-tools", "lib");
const auth = await loadFirebaseToolsModule(firebaseToolsRoot, "auth.js");
const { requireAuth } = await loadFirebaseToolsModule(firebaseToolsRoot, "requireAuth.js");
const { Client } = await loadFirebaseToolsModule(firebaseToolsRoot, "apiv2.js");

const cliAccount = auth.getGlobalDefaultAccount();
if (!cliAccount) throw new Error("Firebase CLI is not authenticated.");
const requestedEmail = option("--email");
const email = normalizeEmail(
  requestedEmail ?? assertValue(cliAccount.user?.email, "The Firebase CLI account has no email."),
);

const options = { project: projectId };
auth.setActiveAccount(options, cliAccount);
await requireAuth(options);

const emailFingerprint = createHash("sha256").update(email).digest("hex").slice(0, 12);
if (!apply) {
  process.stdout.write("MODE=dry-run\n");
  process.stdout.write(`PROJECT=${projectId}\n`);
  process.stdout.write(`EMPLOYEE_ID=${employeeId}\n`);
  process.stdout.write(`EMAIL_FINGERPRINT=${emailFingerprint}\n`);
  process.stdout.write("READY_TO_APPLY=true\n");
  process.exit(0);
}

const firestore = new Client({
  urlPrefix: "https://firestore.googleapis.com",
  apiVersion: "v1",
});
const databaseName = `projects/${projectId}/databases/(default)`;
const documentsName = `${databaseName}/documents`;
const accessName = `${documentsName}/secureSettings/adminAccess`;
const employeeName = `${documentsName}/employees/${employeeId}`;
const auditId = randomUUID();
const auditName = `${documentsName}/auditLogs/${auditId}`;
const now = new Date().toISOString();
const pendingUid = `pending-google-${emailFingerprint}`;
const [accessSnapshot, employeeSnapshot] = await Promise.all([
  readFirestoreDocument(firestore, accessName),
  readFirestoreDocument(firestore, employeeName),
]);
const currentEntries = Array.isArray(accessSnapshot?.data.entries)
  ? accessSnapshot.data.entries
  : [];
const entries = currentEntries.filter((entry) => {
  if (!entry || typeof entry.email !== "string" || typeof entry.employeeId !== "string") {
    throw new Error("Existing admin allowlist data is invalid.");
  }
  const sameEmail = entry.email.trim().toLowerCase() === email;
  const sameEmployee = entry.employeeId === employeeId;
  if (sameEmail !== sameEmployee && (sameEmail || sameEmployee)) {
    throw new Error("The requested email or employee ID is already bound to another admin.");
  }
  return !sameEmail;
});
entries.push({ email, employeeId, active: true });
entries.sort((left, right) => left.employeeId.localeCompare(right.employeeId));

const existingEmployee = employeeSnapshot?.data ?? {};
const createdAt = typeof existingEmployee.createdAt === "string"
  ? existingEmployee.createdAt
  : now;
const firebaseUid = typeof existingEmployee.firebaseUid === "string"
  ? existingEmployee.firebaseUid
  : pendingUid;
const sessionVersion = Number.isInteger(existingEmployee.sessionVersion)
  ? existingEmployee.sessionVersion
  : 1;
const accessFields = {
  entries: {
    arrayValue: {
      values: entries.map((entry) => ({
        mapValue: {
          fields: {
            email: stringValue(entry.email),
            employeeId: stringValue(entry.employeeId),
            active: booleanValue(entry.active === true),
          },
        },
      })),
    },
  },
  updatedAt: timestampValue(now),
};
const employeeFields = {
  employeeId: stringValue(employeeId),
  firebaseUid: stringValue(firebaseUid),
  displayName: stringValue(displayName.trim()),
  roleScopes: stringArrayValue(["admin"]),
  permissions: {
    mapValue: { fields: { exportTeam: booleanValue(true) } },
  },
  status: stringValue("active"),
  sessionVersion: integerValue(sessionVersion),
  createdAt: timestampValue(createdAt),
  updatedAt: timestampValue(now),
};
const auditFields = {
  logId: stringValue(auditId),
  eventType: stringValue("ADMIN_BOOTSTRAPPED"),
  actorUid: stringValue("firebase-cli-bootstrap"),
  actorEmployeeId: stringValue(employeeId),
  targetType: stringValue("employee"),
  targetId: stringValue(employeeId),
  schoolId: nullValue(),
  cycleId: nullValue(),
  changedFields: stringArrayValue(["adminAccess", "employee", "roleScopes"]),
  changeReason: stringValue("approved-production-bootstrap"),
  requestId: stringValue(randomUUID()),
  appVersion: nullValue(),
  createdAt: timestampValue(now),
};

await firestore.post(`${databaseName}/documents:commit`, {
  writes: [
    updateWrite(accessName, accessFields, Object.keys(accessFields), accessSnapshot),
    updateWrite(employeeName, employeeFields, Object.keys(employeeFields), employeeSnapshot),
    {
      update: { name: auditName, fields: auditFields },
      currentDocument: { exists: false },
    },
  ],
});

process.stdout.write("MODE=applied\n");
process.stdout.write(`PROJECT=${projectId}\n`);
process.stdout.write(`EMPLOYEE_ID=${employeeId}\n`);
process.stdout.write(`EMAIL_FINGERPRINT=${emailFingerprint}\n`);
process.stdout.write("ALLOWLIST_ACTIVE=true\n");
process.stdout.write("GOOGLE_UID_ACTIVATION=pending-first-login\n");
