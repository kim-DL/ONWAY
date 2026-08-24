import { Timestamp, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import {
  decodeFirestoreData,
  encodeFirestoreData,
  schoolConverter,
} from "@/lib/firebase/firestore-converters";
import { firestorePaths, photoStoragePath } from "@/lib/firebase/firestore-paths";
import { createPhase1Seed } from "@/seed/phase1";

describe("Firestore contract boundary", () => {
  it("builds canonical document and Storage paths", () => {
    expect(firestorePaths.school("SCH-NEIS-G100000001")).toBe("schools/SCH-NEIS-G100000001");
    expect(firestorePaths.schoolPhoto("SCH-NEIS-G100000001", "02")).toBe(
      "schools/SCH-NEIS-G100000001/photos/02",
    );
    expect(firestorePaths.salesAssignment("2026-08", "SCH-NEIS-G100000001")).toBe(
      "salesCycles/2026-08/assignments/SCH-NEIS-G100000001",
    );
    expect(photoStoragePath("SCH-NEIS-G100000001", "03", "v003", "preview.webp")).toBe(
      "schools/SCH-NEIS-G100000001/photos/03/v003/preview.webp",
    );
  });

  it("rejects malformed IDs, cycle IDs, and photo slots before creating paths", () => {
    expect(() => firestorePaths.school("bad/id")).toThrow();
    expect(() => firestorePaths.salesCycle("2026-13")).toThrow();
    expect(() => firestorePaths.schoolPhoto("SCH-001", "04")).toThrow();
  });

  it("recursively converts domain Date values to and from Firestore Timestamp values", () => {
    const instant = new Date("2026-08-20T04:30:00.000Z");
    const encoded = encodeFirestoreData({ instant, nested: { dates: [instant] } });

    expect(encoded.instant).toBeInstanceOf(Timestamp);
    expect((encoded.nested as { dates: unknown[] }).dates[0]).toBeInstanceOf(Timestamp);

    const decoded = decodeFirestoreData(encoded);
    expect(decoded).toEqual({ instant, nested: { dates: [instant] } });
  });

  it("validates snapshots and enforces the stored ID against the document path", () => {
    const school = createPhase1Seed().schools[0];
    expect(school).toBeDefined();
    if (school === undefined) return;
    const encoded = encodeFirestoreData(school);

    const validSnapshot = {
      id: school.schoolId,
      data: () => encoded,
    } as unknown as QueryDocumentSnapshot<DocumentData, DocumentData>;
    expect(schoolConverter.fromFirestore(validSnapshot)).toEqual(school);

    const mismatchedSnapshot = {
      id: "SCH-NEIS-OTHER",
      data: () => encoded,
    } as unknown as QueryDocumentSnapshot<DocumentData, DocumentData>;
    expect(() => schoolConverter.fromFirestore(mismatchedSnapshot)).toThrow(
      /Firestore document ID mismatch/,
    );
  });
});
