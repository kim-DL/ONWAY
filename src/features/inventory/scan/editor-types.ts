import type { ReactNode } from "react";
import type { InventoryLocation, InventoryProductDetail, InventoryProductDraft, InventoryLotDraft } from "@/domain/inventory";
import type { ScanBarcodeLink } from "@/domain/inventory-scan";
import type { Suggestion } from "./review-model";

export type ScanEditor = {
  draft: InventoryProductDraft; lot: InventoryLotDraft; file: File | null; busy: boolean;
  links: ScanBarcodeLink[]; setLinks: (links: ScanBarcodeLink[]) => void;
  apply: (item: Suggestion, explicit: boolean) => void;
  setPhoto: (file: File | null) => void; blockSave: (blocked: boolean) => void;
};
export type ScanSlot = (editor: ScanEditor) => ReactNode;
export type ExistingReceipt = { detail: InventoryProductDetail; location: InventoryLocation; lot: InventoryLotDraft };
