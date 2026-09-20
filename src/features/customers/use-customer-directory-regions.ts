"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Customer, CustomerPoint } from "@/domain/customer";
import { customerDirectoryEntry, UNKNOWN_CUSTOMER_DISTRICT, UNKNOWN_CUSTOMER_DONG } from "./customer-directory-filter";
import { customerRepository } from "./customer-repository";

type Region = Pick<Customer, "district" | "administrativeDong">;
type Result = { region: Region | null; failed: boolean };
type Candidate = { key: string; point: CustomerPoint };
const CONCURRENCY = 3;

function lookupKey(customer: Customer): string {
  return JSON.stringify([customer.customerId, customer.deliveryPoint?.latitude, customer.deliveryPoint?.longitude,
    customer.deliveryAddress, customer.officialAddress, customer.district, customer.administrativeDong]);
}

function needsLookup(customer: Customer): boolean {
  const point = customer.deliveryPoint;
  if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
    || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return false;
  const region = customerDirectoryEntry(customer);
  return region.district === UNKNOWN_CUSTOMER_DISTRICT || region.dong === UNKNOWN_CUSTOMER_DONG;
}

/** Directory-only enrichment: no customer writes, persistence, or address replacement. */
export function useCustomerDirectoryRegions(customers: readonly Customer[], enabled: boolean) {
  const [results, setResults] = useState<Map<string, Result>>(() => new Map());
  const runtime = useRef({ cache: new Map<string, Result>(), inFlight: new Map<string, symbol>(), pump: null as (() => void) | null });
  const candidates = customers.filter(needsLookup).map((customer): Candidate => ({ key: lookupKey(customer), point: customer.deliveryPoint! }));
  // Equal catalog snapshots must not cancel/restart the same in-flight lookups.
  const signature = JSON.stringify(candidates);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const queue = JSON.parse(signature) as Candidate[];
    const engine = runtime.current;
    const publish = (key: string, result: Result) => {
      if (!active) return;
      engine.cache.set(key, result);
      setResults(new Map(engine.cache));
    };
    const pump = () => {
      if (!active) return;
      for (const candidate of queue) {
        if (engine.inFlight.size >= CONCURRENCY) break;
        if (engine.cache.has(candidate.key) || engine.inFlight.has(candidate.key)) continue;
        const request = Symbol(candidate.key);
        engine.inFlight.set(candidate.key, request);
        void Promise.resolve().then(() => {
          if (!active) return null;
          return customerRepository.reverseLocation(candidate.point);
        }).then((response) => {
          if (!active || !response) return;
          const region = { district: response.district.trim(), administrativeDong: response.administrativeDong.trim() };
          // A successful address-only response is not an administrative match.
          // Keep partial region data useful but explicitly retryable.
          publish(candidate.key, { region: region.district || region.administrativeDong ? region : null, failed: !region.administrativeDong });
        }).catch(() => {
          publish(candidate.key, { region: null, failed: true });
        }).finally(() => {
          if (engine.inFlight.get(candidate.key) === request) engine.inFlight.delete(candidate.key);
          // Older, canceled requests still occupy a real network slot. Release
          // it before pumping the current generation, never exceed three calls.
          engine.pump?.();
        });
      }
    };
    engine.pump = pump;
    pump();
    return () => {
      active = false;
      if (engine.pump === pump) engine.pump = null;
    };
  }, [enabled, signature]);

  const retry = useCallback(() => {
    const cache = runtime.current.cache;
    for (const [key, result] of cache) if (result.failed) cache.delete(key);
    setResults(new Map(cache));
    runtime.current.pump?.();
  }, []);

  const decorated = customers.map((customer) => {
    if (!needsLookup(customer)) return customer;
    const region = results.get(lookupKey(customer))?.region;
    if (!region) return customer;
    return { ...customer, district: region.district || customer.district, administrativeDong: region.administrativeDong };
  });
  const pendingCount = enabled ? candidates.filter(({ key }) => !results.has(key)).length : 0;
  const failedCount = enabled ? candidates.filter(({ key }) => results.get(key)?.failed).length : 0;
  return { customers: decorated, pendingCount, failedCount, retry };
}
