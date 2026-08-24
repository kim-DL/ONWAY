"use client";

import "client-only";

import { collection, limit, onSnapshot, orderBy, query, type Unsubscribe } from "firebase/firestore";

import type { School } from "@/domain/school";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import { schoolConverter } from "@/lib/firebase/firestore-converters";
import { recordFirestoreReads } from "@/lib/performance/performance-monitor";

export function subscribeToShellSchools(
  onData: (schools: School[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const services = getFirebaseClientServices();
  if (!services) {
    onError(new Error("Firebase is not configured."));
    return () => undefined;
  }

  const schoolQuery = query(
    collection(services.firestore, "schools").withConverter(schoolConverter),
    orderBy("name", "asc"),
    limit(8),
  );

  return onSnapshot(
    schoolQuery,
    (snapshot) => {
      recordFirestoreReads("shell", snapshot.docChanges().length);
      onData(snapshot.docs.map((document) => document.data()));
    },
    (error) => onError(error),
  );
}
