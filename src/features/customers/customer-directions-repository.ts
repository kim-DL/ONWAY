"use client";
import "client-only";
import { httpsCallable } from "firebase/functions";
import { z } from "zod";
import { customerLocationCandidateSchema, type CustomerPoint } from "@/domain/customer";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import { registerPrivateClientCleanup } from "@/features/auth/private-client-cleanup-registry";
import { renderDirectionsLoading } from "./customer-directions-loading";
import { deliverCustomerRoute } from "./customer-directions-navigation";

type Selection = { customerId: string; revision: number };
export async function navigateToCustomer(customer: Selection & { name: string }, address: string, popup: Window | null, mobile: boolean, current: () => boolean,
  resolve?: (address: string, popup: Window | null) => Promise<CustomerPoint | null>) {
  if (!resolve && popup && !popup.closed) renderDirectionsLoading(popup);
  const point = await (resolve ? resolve(address, popup) : resolveDirectionsPoint(address, customer));
  await deliverCustomerRoute(customer.name, point, popup, mobile, current);
}
type Lookup = { user: object; key: string; expires: number; point: Promise<CustomerPoint | null> };
let last: Lookup | undefined;
let generation = 0;
registerPrivateClientCleanup(() => { last = undefined; generation++; });

export async function resolveDirectionsPoint(query: string, selection?: Selection): Promise<CustomerPoint | null> {
  const services = getFirebaseClientServices(); const user = services?.auth.currentUser;
  if (!services || !user || !navigator.onLine) throw new Error("Directions unavailable");
  const epoch = generation;
  const identity = async () => {
    const { claims } = await user.getIdTokenResult();
    if (epoch !== generation || services.auth.currentUser !== user || !navigator.onLine) throw new Error("Directions session changed");
    return JSON.stringify([user.uid, claims.employeeId, claims.sessionVersion, claims.permissionsVersion, selection?.customerId, selection?.revision, query]);
  };
  const key = await identity();
  if (last?.user !== user || last.key !== key || last.expires <= Date.now()) {
    const point = httpsCallable<{ query: string; addressOnly: boolean }, unknown>(services.functions, "searchCustomerLocations", { timeout: 15_000 })({ query, addressOnly: true }).then((response) => {
      const candidates = z.array(customerLocationCandidateSchema).max(1).parse(response.data);
      return candidates[0]?.id === "address" ? candidates[0].point : null;
    });
    last = { user, key, expires: Infinity, point };
  }
  const lookup = last;
  try {
    const point = await lookup.point;
    if (await identity() !== key || last !== lookup) throw new Error("Directions session changed");
    if (!point) last = undefined;
    else if (lookup.expires === Infinity) lookup.expires = Date.now() + 60_000;
    return point;
  } catch (error) {
    if (last === lookup) last = undefined;
    throw error;
  }
}
