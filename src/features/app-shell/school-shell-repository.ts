"use client";

import "client-only";

import { collection, documentId, getDocs, limit, onSnapshot, orderBy, query, where, type Unsubscribe } from "firebase/firestore";

import type { School, SchoolFieldProfile } from "@/domain/school";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import { schoolConverter, schoolFieldProfileConverter } from "@/lib/firebase/firestore-converters";
import { recordFirestoreReads } from "@/lib/performance/performance-monitor";

export function subscribeToShellSchools(
  onData: (schools: School[], profileBySchoolId: Record<string, SchoolFieldProfile | null>) => void,
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

  let closed = false;
  let generation = 0;
  const unsubscribe = onSnapshot(
    schoolQuery,
    async (snapshot) => {
      const currentGeneration = generation + 1;
      generation = currentGeneration;
      recordFirestoreReads("shell", snapshot.docChanges().length);
      const schools = snapshot.docs.map((document) => document.data());
      onData(schools, {});
      try {
        if (schools.length === 0) {
          return;
        }
        const profileSnapshots = await getDocs(query(
          collection(services.firestore, "schoolFieldProfiles").withConverter(schoolFieldProfileConverter),
          where(documentId(), "in", schools.map((school) => school.schoolId)),
        ));
        if (closed || generation !== currentGeneration) return;
        recordFirestoreReads("shell", profileSnapshots.size);
        const profiles = new Map(profileSnapshots.docs.map((profileSnapshot) => [profileSnapshot.id, profileSnapshot.data()]));
        onData(schools, Object.fromEntries(schools.map((school) => [school.schoolId, profiles.get(school.schoolId) ?? null])));
      } catch {
        // Base school cards remain usable if the optional shared-field summary cannot refresh.
      }
    },
    (error) => onError(error),
  );
  return () => {
    closed = true;
    generation += 1;
    unsubscribe();
  };
}
