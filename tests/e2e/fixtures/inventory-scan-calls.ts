// Manual entry records its outcome in the background. Scans use the authenticated emulator suite.
export async function callInventory(name: string) {
  if (name === "recordInventoryRegistrationOutcome") return { recorded: true };
  throw new Error(`Unexpected inventory callable in this fixture: ${name}`);
}
