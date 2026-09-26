import { readFileSync } from "node:fs";

import { customerImportManifestSchema } from "../src/features/customers/customer-import-plan.ts";

const path = process.argv[2];
if (!path) throw new Error("Usage: tsx scripts/validate-customer-import-manifest.ts <manifest.json>");
const manifest = customerImportManifestSchema.parse(JSON.parse(readFileSync(path, "utf8")));
console.log(JSON.stringify({
  entries: manifest.entries.length,
  unknownWithoutPassword: manifest.entries.filter((entry) => entry.draft.accessPasswordState === "unknown" && !entry.draft.accessPassword).length,
  withContacts: manifest.entries.filter((entry) => entry.draft.contacts.length > 0).length,
}));
