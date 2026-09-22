export type DeliveryPhotoCompletionProjection = {
  remainingCustomerIds: readonly string[];
  completedCustomerIds: readonly string[];
};

function uniqueKnownCustomerIds(customerIds: readonly string[], knownCustomerIds: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  return customerIds.filter((customerId) => {
    if (!knownCustomerIds.has(customerId) || seen.has(customerId)) return false;
    seen.add(customerId);
    return true;
  });
}

export function resolveDeliveryPhotoDayCustomerIds(
  routeCustomerIds: readonly string[],
  dayOverrideCustomerIds: readonly string[] | null,
  knownCustomerIds: ReadonlySet<string>,
): string[] {
  return uniqueKnownCustomerIds(dayOverrideCustomerIds ?? routeCustomerIds, knownCustomerIds);
}

export function addDeliveryPhotoCustomer(
  customerIds: readonly string[],
  customerId: string,
  knownCustomerIds: ReadonlySet<string>,
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
  knownCustomerIds: ReadonlySet<string>,
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

export function projectDeliveryPhotoCompletion(
  customerIds: readonly string[],
  activePhotoCounts: ReadonlyMap<string, number>,
): DeliveryPhotoCompletionProjection {
  const remainingCustomerIds: string[] = [];
  const completedCustomerIds: string[] = [];
  for (const customerId of customerIds) {
    if ((activePhotoCounts.get(customerId) ?? 0) > 0) completedCustomerIds.push(customerId);
    else remainingCustomerIds.push(customerId);
  }
  return { remainingCustomerIds, completedCustomerIds };
}
