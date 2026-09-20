import path from "node:path";
import { pathToFileURL } from "node:url";

// Reuse the already signed-in CLI account. Only GET these two known domains;
// never print credentials, arbitrary response bodies or account data.
const root = path.resolve(import.meta.dirname, "..");
const project = "onnuriway";
const domains = ["onnuriway.com", "www.onnuriway.com"];
const emit = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const load = async (file) => {
  const imported = await import(pathToFileURL(path.join(root, "node_modules/firebase-tools/lib", file)).href);
  return imported.default ?? imported;
};
const records = (sets) => (sets ?? []).flatMap((set) => (set.records ?? []).map(({ domainName, type, rdata, requiredAction }) => ({ domainName, type, rdata, requiredAction })));

try {
  if (process.argv.length > 2) throw new Error("Read only: no arguments accepted");
  (await load("logger.js")).logger.silent = true;
  const auth = await load("auth.js");
  const { requireAuth } = await load("requireAuth.js");
  const { Client } = await load("apiv2.js");
  const account = auth.getGlobalDefaultAccount();
  if (!account) throw new Error("CLI login unavailable");
  const options = { project };
  auth.setActiveAccount(options, account);
  await requireAuth(options);
  const client = new Client({ urlPrefix: "https://firebasehosting.googleapis.com", apiVersion: "v1beta1" });
  for (const domain of domains) {
    const result = await client.get(`/projects/${project}/sites/${project}/customDomains/${domain}`, {
      skipLog: { body: true, resBody: true, queryParams: true }, resolveOnHTTPError: true,
    });
    if (result.status !== 200) { emit({ domain, status: result.status }); continue; }
    const value = result.body;
    emit({ domain, status: result.status, hostState: value.hostState, ownershipState: value.ownershipState,
      certState: value.cert?.state, redirectTarget: value.redirectTarget ?? null,
      dnsCheckedAt: value.requiredDnsUpdates?.checkTime,
      discovered: records(value.requiredDnsUpdates?.discovered), desired: records(value.requiredDnsUpdates?.desired),
      certificateDns: records(value.cert?.verification?.dns?.desired),
      certificateDiscoveredDns: records(value.cert?.verification?.dns?.discovered),
      certificateDnsCheckedAt: value.cert?.verification?.dns?.checkTime,
      issueCodes: (value.issues ?? []).map((issue) => issue.code),
      certificateIssueCodes: (value.cert?.issues ?? []).map((issue) => issue.code),
      certificateIssues: (value.cert?.issues ?? []).map((issue) => issue.message),
    });
  }
} catch (error) {
  emit({ status: "HOSTING_READONLY_AUDIT_FAILED", code: Number.isInteger(error?.status) ? error.status : null });
  process.exitCode = 1;
}
