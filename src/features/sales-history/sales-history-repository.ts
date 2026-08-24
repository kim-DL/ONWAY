"use client";

import "client-only";

import {
  collection,
  documentId as documentIdField,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { documentIdSchema } from "@/domain/common";
import type { SalesVisit } from "@/domain/sales";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import { salesVisitConverter } from "@/lib/firebase/firestore-converters";
import { recordFirestoreReads } from "@/lib/performance/performance-monitor";
import {
  salesHistoryCursorSchema,
  updateSalesProfileInputSchema,
  updateSalesProfileResultSchema,
  type SalesHistoryCursor,
  type UpdateSalesProfileInput,
  type UpdateSalesProfileResult,
} from "./sales-history-contract";

const INITIAL_PAGE_SIZE = 3;
const NEXT_PAGE_SIZE = 5;

export type SalesHistoryPage = {
  visits: SalesVisit[];
  cursor: SalesHistoryCursor | null;
  hasMore: boolean;
};

export class SalesHistoryRepository {
  async loadPage(
    schoolId: string,
    cursor: SalesHistoryCursor | null = null,
    pageSize = cursor ? NEXT_PAGE_SIZE : INITIAL_PAGE_SIZE,
  ): Promise<SalesHistoryPage> {
    const services = getFirebaseClientServices();
    if (!services) throw new Error("Firebase is not configured.");
    const validSchoolId = documentIdSchema.parse(schoolId);
    const validCursor = cursor ? salesHistoryCursorSchema.parse(cursor) : null;
    const collectionReference = collection(services.firestore, "salesVisits").withConverter(salesVisitConverter);
    const historyQuery = validCursor
      ? query(
          collectionReference,
          where("schoolId", "==", validSchoolId),
          where("deleted", "==", false),
          orderBy("visitedAt", "desc"),
          orderBy(documentIdField(), "desc"),
          startAfter(new Date(validCursor.visitedAt), validCursor.visitId),
          limit(pageSize + 1),
        )
      : query(
          collectionReference,
          where("schoolId", "==", validSchoolId),
          where("deleted", "==", false),
          orderBy("visitedAt", "desc"),
          orderBy(documentIdField(), "desc"),
          limit(pageSize + 1),
        );
    const snapshot = await getDocs(historyQuery);
    recordFirestoreReads("history", snapshot.size);
    const hasMore = snapshot.docs.length > pageSize;
    const visibleSnapshots = snapshot.docs.slice(0, pageSize);
    const lastSnapshot = visibleSnapshots.at(-1);
    return {
      visits: visibleSnapshots.map((document) => document.data()),
      cursor: hasMore && lastSnapshot
        ? { visitedAt: lastSnapshot.data().visitedAt.toISOString(), visitId: lastSnapshot.id }
        : null,
      hasMore,
    };
  }

  async updateProfile(input: UpdateSalesProfileInput) {
    const services = getFirebaseClientServices();
    if (!services) throw new Error("Firebase is not configured.");
    const callable = httpsCallable<UpdateSalesProfileInput, UpdateSalesProfileResult>(
      services.functions,
      "updateSalesProfile",
    );
    const response = await callable(updateSalesProfileInputSchema.parse(input));
    return updateSalesProfileResultSchema.parse(response.data);
  }
}

export const salesHistoryRepository = new SalesHistoryRepository();
