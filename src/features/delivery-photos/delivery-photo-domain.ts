export type DeliveryPhotoCompletionProjection = {
  remainingCustomerIds: readonly string[];
  completedCustomerIds: readonly string[];
};

export type KnownCustomerIds = Pick<ReadonlySet<string>, "has">;

export function uniqueKnownCustomerIds(customerIds: readonly string[], knownCustomerIds: KnownCustomerIds): string[] {
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
  knownCustomerIds: KnownCustomerIds,
): string[] {
  return uniqueKnownCustomerIds(dayOverrideCustomerIds ?? routeCustomerIds, knownCustomerIds);
}

export function projectDeliveryPhotoCompletion(
  customerIds: readonly string[],
  photoCount: (customerId: string) => number,
): DeliveryPhotoCompletionProjection {
  const remainingCustomerIds: string[] = [];
  const completedCustomerIds: string[] = [];
  for (const customerId of customerIds) {
    if (photoCount(customerId) > 0) completedCustomerIds.push(customerId);
    else remainingCustomerIds.push(customerId);
  }
  return { remainingCustomerIds, completedCustomerIds };
}
