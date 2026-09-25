"use client";

import dynamic from "next/dynamic";

import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

import type { DeliveryPhotoDeleteUpdate } from "./delivery-photo-delete-model";
import type { DeliveryPhotoHistoryResult } from "./delivery-photo-history-repository";

type HistoryProps = {
  customer: Pick<Customer, "customerId" | "name">;
  session: AuthenticatedSession;
  onClose: () => void;
  sync: (update: DeliveryPhotoDeleteUpdate) => void;
  initialResult?: DeliveryPhotoHistoryResult | undefined;
  onResult?: ((result: DeliveryPhotoHistoryResult) => void) | undefined;
};

export const DeliveryPhotoHistoryLoader = dynamic<HistoryProps>(
  () => import("./delivery-photo-history"), { ssr: false },
);
