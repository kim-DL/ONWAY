import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { locationAssignmentsSchema } from "./inventory-location-contract.js";
import { INVENTORY_LOCATIONS } from "./inventory-labels.js";

export const locationAssignmentsPath = "companies/onnuri/inventorySettings/locationOwners";
export function locationAssignments(data?: DocumentData) {
  return data ? locationAssignmentsSchema.parse({ revision: data.revision, owners: data.owners })
    : { revision: 0, owners: { refrigerated: null, freezer1: null, freezer2: null, sample: null } };
}
export function eligibleLocationEmployee(id: string, data?: DocumentData) {
  return data?.employeeId === id && data.status === "active" && typeof data.displayName === "string" && data.displayName.trim()
    && Array.isArray(data.roleScopes) && data.roleScopes.some(role => ["delivery", "sales", "admin"].includes(role));
}
export async function personalLocations(db: Firestore, employeeId: string) {
  const { owners } = locationAssignments((await db.doc(locationAssignmentsPath).get()).data());
  return INVENTORY_LOCATIONS.filter(location => owners[location] === employeeId);
}
export async function locationRoster(db: Firestore) {
  const [saved, employees] = await Promise.all([db.doc(locationAssignmentsPath).get(),
    db.collection("employees").where("status", "==", "active").select("employeeId", "displayName", "roleScopes", "status").get()]);
  const staff = employees.docs.flatMap(doc => {
    const data = doc.data();
    return eligibleLocationEmployee(doc.id, data) ? [{ employeeId: doc.id, displayName: String(data.displayName) }] : [];
  }).sort((a, b) => a.displayName.localeCompare(b.displayName, "ko") || a.employeeId.localeCompare(b.employeeId));
  return { ...locationAssignments(saved.data()), staff };
}
