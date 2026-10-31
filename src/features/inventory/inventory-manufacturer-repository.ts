"use client";
import "client-only";

import type { z } from "zod";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import { httpsCallable } from "firebase/functions";
import { registerPrivateClientCleanup } from "@/features/auth/private-client-cleanup-registry";
import { RevalidationCoordinator } from "@/lib/revalidation-coordinator";
import { inventoryAccessGeneration, inventoryAuthenticationError, reportInventoryAccessFailure, subscribeInventoryAccessFailure } from "./inventory-access-boundary";
import {
  createInventoryManufacturerInputSchema, inventoryManufacturerListSchema, inventoryManufacturerSchema,
  inventoryProductDetailWithManufacturerSchema, inventoryProductSaveResultWithManufacturerSchema,
  getInventoryProductWithManufacturerInputSchema, listInventoryManufacturersInputSchema,
  saveInventoryProductWithManufacturerInputSchema, updateInventoryManufacturerInputSchema,
  type InventoryManufacturer, type UpdateInventoryManufacturerInput,
} from "@/domain/inventory-manufacturer";
import type { SaveInventoryProductInput } from "@/domain/inventory";


async function call<T>(name: string, input: unknown, schema: z.ZodType<T>): Promise<T> {
  const services = getFirebaseClientServices();
  const uid = services?.auth.currentUser?.uid;
  const generation = inventoryAccessGeneration();
  try {
    if (!services || !uid) throw inventoryAuthenticationError();
    const result = await httpsCallable<unknown, unknown>(services.functions, name)(input);
    if (services.auth.currentUser?.uid !== uid || inventoryAccessGeneration() !== generation) throw inventoryAuthenticationError();
    return schema.parse(result.data);
  } catch (cause) {
    // A superseded account/session request cannot clear the next session's UI.
    if (inventoryAccessGeneration() === generation && services?.auth.currentUser?.uid === uid) reportInventoryAccessFailure(cause, uid ?? null);
    throw cause;
  }
}

type ManufacturerListSession = {
  namespace: string;
  uid: string;
  generation: number;
  coordinator: RevalidationCoordinator;
  items: InventoryManufacturer[] | null;
};
let manufacturerListSession: ManufacturerListSession | null = null;

function clearManufacturerList() {
  manufacturerListSession?.coordinator.invalidate();
  manufacturerListSession = null;
}
registerPrivateClientCleanup(clearManufacturerList);
subscribeInventoryAccessFailure(clearManufacturerList);

function getManufacturerListSession(namespace: string) {
  const uid = getFirebaseClientServices()?.auth.currentUser?.uid;
  const generation = inventoryAccessGeneration();
  if (!uid || manufacturerListSession?.namespace !== namespace || manufacturerListSession.uid !== uid || manufacturerListSession.generation !== generation) {
    clearManufacturerList();
    if (!uid) return null;
    manufacturerListSession = { namespace, uid, generation, coordinator: new RevalidationCoordinator(namespace), items: null };
  }
  return manufacturerListSession;
}

function listManufacturers(namespace: string, options: { force?: boolean } = {}): Promise<InventoryManufacturer[]> {
  const session = getManufacturerListSession(namespace);
  if (!session) return Promise.reject(inventoryAuthenticationError());
  const isCurrent = session.coordinator.guardCurrentGeneration();
  const run = session.coordinator.run(async () => {
    const items = await call("listInventoryManufacturers", listInventoryManufacturersInputSchema.parse({}), inventoryManufacturerListSchema);
    if (manufacturerListSession !== session) throw inventoryAuthenticationError();
    // A confirmed mutation supersedes an earlier read, including one still in flight.
    if (!isCurrent()) return listManufacturers(namespace);
    session.items = items;
    return items;
  }, { ...options, hasData: session.items !== null });
  return run.promise ?? Promise.resolve(session.items!);
}

function commitManufacturer(session: ManufacturerListSession | null, manufacturer: InventoryManufacturer) {
  if (!session || manufacturerListSession !== session) return;
  session.coordinator.invalidate();
  if (session.items !== null) session.items = [...session.items.filter((item) => item.manufacturerId !== manufacturer.manufacturerId), manufacturer]
    .filter((item) => item.active)
    .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName, "ko-KR") || a.manufacturerId.localeCompare(b.manufacturerId));
}

export const inventoryManufacturerRepository = {
  cached: (namespace: string) => getManufacturerListSession(namespace)?.items ?? null,
  list: listManufacturers,
  create: async (input: { requestId: string; name: string }) => {
    const session = manufacturerListSession;
    const manufacturer = await call("createInventoryManufacturer", createInventoryManufacturerInputSchema.parse(input), inventoryManufacturerSchema);
    commitManufacturer(session, manufacturer);
    return manufacturer;
  },
  update: async (input: UpdateInventoryManufacturerInput) => {
    const session = manufacturerListSession;
    const manufacturer = await call("updateInventoryManufacturer", updateInventoryManufacturerInputSchema.parse(input), inventoryManufacturerSchema);
    commitManufacturer(session, manufacturer);
    return manufacturer;
  },
  reference: (productId: string) => call("getInventoryProduct", getInventoryProductWithManufacturerInputSchema.parse({ productId, includeManufacturerReference: true }), inventoryProductDetailWithManufacturerSchema),
  saveProduct: (input: SaveInventoryProductInput) => call("saveInventoryProduct", saveInventoryProductWithManufacturerInputSchema.parse({ ...input, includeSummary: true, includeManufacturerReference: true }), inventoryProductSaveResultWithManufacturerSchema),
};
