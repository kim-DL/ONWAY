import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function loadFirebaseToolsModule(firebaseToolsRoot, relativePath) {
  const importedModule = await import(pathToFileURL(path.join(firebaseToolsRoot, relativePath)).href);
  return importedModule.default ?? importedModule;
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

const projectId = "onnuriway";
const apply = process.argv.includes("--apply");
const projectRoot = path.resolve(import.meta.dirname, "..");
const firebaseToolsRoot = path.join(projectRoot, "node_modules", "firebase-tools", "lib");
const auth = await loadFirebaseToolsModule(firebaseToolsRoot, "auth.js");
const { requireAuth } = await loadFirebaseToolsModule(firebaseToolsRoot, "requireAuth.js");
const { Client } = await loadFirebaseToolsModule(firebaseToolsRoot, "apiv2.js");

const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error("Firebase CLI is not authenticated.");
const options = { project: projectId };
auth.setActiveAccount(options, account);
await requireAuth(options);

const functions = new Client({
  urlPrefix: "https://cloudfunctions.googleapis.com",
  apiVersion: "v2",
});
const employeeLogin = (await functions.get(
  `/projects/${projectId}/locations/asia-northeast3/functions/employeeLogin`,
)).body;
const serviceAccountEmail = employeeLogin.serviceConfig?.serviceAccountEmail;
if (
  employeeLogin.state !== "ACTIVE"
  || typeof serviceAccountEmail !== "string"
  || !serviceAccountEmail.endsWith("@developer.gserviceaccount.com")
) {
  throw new Error("The active employeeLogin runtime service account could not be verified.");
}

const iam = new Client({
  urlPrefix: "https://iam.googleapis.com",
  apiVersion: "v1",
});
const resource = `/projects/${projectId}/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}`;
const policy = (await iam.post(`${resource}:getIamPolicy`, {})).body;
const role = "roles/iam.serviceAccountTokenCreator";
const member = `serviceAccount:${serviceAccountEmail}`;
const currentBindings = Array.isArray(policy.bindings) ? policy.bindings : [];
const currentRoleBinding = currentBindings.find((binding) => binding.role === role);
const alreadyConfigured = currentRoleBinding?.members?.includes(member) === true;

process.stdout.write(`MODE=${apply ? "apply" : "dry-run"}\n`);
process.stdout.write(`PROJECT=${projectId}\n`);
process.stdout.write(`RUNTIME_ACCOUNT_FINGERPRINT=${fingerprint(serviceAccountEmail)}\n`);
process.stdout.write(`TOKEN_SIGNING_ALREADY_CONFIGURED=${alreadyConfigured}\n`);

if (!apply || alreadyConfigured) process.exit(0);

const bindings = currentBindings.map((binding) => ({
  ...binding,
  members: [...(binding.members ?? [])],
}));
const binding = bindings.find((candidate) => candidate.role === role);
if (binding) {
  binding.members = [...new Set([...binding.members, member])].sort();
} else {
  bindings.push({ role, members: [member] });
}
bindings.sort((left, right) => left.role.localeCompare(right.role));

const updated = (await iam.post(`${resource}:setIamPolicy`, {
  policy: {
    ...policy,
    bindings,
  },
  updateMask: "bindings,etag",
})).body;
const verified = updated.bindings?.some(
  (candidate) => candidate.role === role && candidate.members?.includes(member),
) === true;
if (!verified) throw new Error("Token signing permission was not confirmed after the IAM update.");
process.stdout.write("TOKEN_SIGNING_CONFIGURED=true\n");
