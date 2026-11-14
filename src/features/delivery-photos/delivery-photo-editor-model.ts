import { uniqueKnownCustomerIds, type KnownCustomerIds } from "./delivery-photo-domain";

export function addDeliveryPhotoCustomer(
  customerIds: readonly string[],
  customerId: string,
  knownCustomerIds: KnownCustomerIds,
): string[] {
  return uniqueKnownCustomerIds([...customerIds, customerId], knownCustomerIds);
}

export function removeDeliveryPhotoCustomer(customerIds: readonly string[], customerId: string): string[] {
  return customerIds.filter((id) => id !== customerId);
}

export function moveDeliveryPhotoCustomer(
  customerIds: readonly string[],
  customerId: string,
  targetIndex: number,
  knownCustomerIds: KnownCustomerIds,
): string[] {
  const normalized = uniqueKnownCustomerIds(customerIds, knownCustomerIds);
  const sourceIndex = normalized.indexOf(customerId);
  if (sourceIndex < 0 || !Number.isInteger(targetIndex)) return normalized;
  const boundedTarget = Math.max(0, Math.min(targetIndex, normalized.length - 1));
  if (sourceIndex === boundedTarget) return normalized;
  const next = [...normalized];
  const [moved] = next.splice(sourceIndex, 1);
  if (moved) next.splice(boundedTarget, 0, moved);
  return next;
}
