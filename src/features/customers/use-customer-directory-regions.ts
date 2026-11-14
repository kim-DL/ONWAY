"use client";

import { useEffect, useState } from "react";
import type { Customer } from "@/domain/customer";
import { customerDirectoryEntry, UNKNOWN_CUSTOMER_DISTRICT, UNKNOWN_CUSTOMER_DONG } from "./customer-directory-filter";
import { customerDirectoryRegionSession, retryCustomerDirectoryRegions, subscribeCustomerDirectoryRegions, type DirectoryRegionCandidate } from "./customer-directory-region-cache";
import { customerRepository } from "./customer-repository";
import { isCustomerPoint } from "./customer-point";

function lookupKey(customer: Customer): string {
  return JSON.stringify([customer.customerId, customer.deliveryPoint?.latitude, customer.deliveryPoint?.longitude,
    customer.deliveryAddress, customer.officialAddress, customer.district, customer.administrativeDong]);
}

function needsLookup(customer: Customer): boolean {
  const point = customer.deliveryPoint;
  if (!isCustomerPoint(point)) return false;
  const region = customerDirectoryEntry(customer);
  return region.district === UNKNOWN_CUSTOMER_DISTRICT || region.dong === UNKNOWN_CUSTOMER_DONG;
}

/** Directory-only enrichment: no customer writes, persistence, or address replacement. */
export function useCustomerDirectoryRegions(namespace: string, customers: readonly Customer[], enabled: boolean) {
  const session = customerDirectoryRegionSession(namespace);
  const [, update] = useState(0);
  const candidates = customers.filter(needsLookup).map((customer): DirectoryRegionCandidate => ({ key: lookupKey(customer), point: customer.deliveryPoint! }));
  // Equal catalog snapshots must not cancel/restart the same in-flight lookups.
  const signature = JSON.stringify(candidates);

  useEffect(() => {
    if (!enabled) return;
    return subscribeCustomerDirectoryRegions(session, JSON.parse(signature) as DirectoryRegionCandidate[], customerRepository.reverseLocation, () => update((version) => version + 1));
  }, [enabled, signature, session]);

  const retry = () => retryCustomerDirectoryRegions(session);

  const decorated = customers.map((customer) => {
    if (!needsLookup(customer)) return customer;
    const region = session.results.get(lookupKey(customer))?.region;
    if (!region) return customer;
    return { ...customer, district: region.district || customer.district, administrativeDong: region.administrativeDong };
  });
  const pendingCount = enabled && !session.blocked ? candidates.filter(({ key }) => !session.results.has(key)).length : 0;
  const failedCount = enabled ? candidates.filter(({ key }) => session.blocked || session.results.get(key)?.failed).length : 0;
  return { customers: decorated, pendingCount, failedCount, retry };
}
