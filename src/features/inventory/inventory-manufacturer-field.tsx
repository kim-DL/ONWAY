"use client";

import { lazy, Suspense, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import type { InventoryProduct, SaveInventoryProductInput } from "@/domain/inventory";
import { useAuth } from "@/features/auth/auth-context";

const InventoryManufacturerPicker = lazy(() => import("./inventory-manufacturer-picker")
  .then((module) => ({ default: module.InventoryManufacturerPicker })));

export function InventoryManufacturerField({ name, manufacturerId, productId, allowCreate, canAdmin = false, disabled, onSelect, onClear }: {
  name: string;
  manufacturerId?: string | undefined;
  productId?: string | undefined;
  allowCreate: boolean;
  canAdmin?: boolean;
  disabled: boolean;
  onSelect: (manufacturer: { manufacturerId: string; name: string }, saveProduct: (input: SaveInventoryProductInput) => Promise<InventoryProduct>) => void;
  onClear: (saveProduct: (input: SaveInventoryProductInput) => Promise<InventoryProduct>) => void;
}) {
  const auth = useAuth();
  const sessionNamespace = auth.state.status === "authenticated"
    ? `${auth.state.session.uid}:${auth.state.session.claims.sessionVersion}:${auth.state.session.claims.permissionsVersion}` : "signed-out";
  const [open, setOpen] = useState(false);
  return <><GlassButton aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => setOpen(true)} style={{ justifyContent: "space-between", width: "100%" }}><span>{name || "제조사 선택"}</span><Icon name="chevron-right" size={16} /></GlassButton>
    {open ? <Suspense fallback={<BottomSheet open title="제조사 선택" onClose={() => setOpen(false)}><p role="status">선택 목록을 준비하고 있어요.</p></BottomSheet>}><InventoryManufacturerPicker current={{ name, ...(manufacturerId ? { manufacturerId } : {}) }} {...(productId ? { productId } : {})} sessionNamespace={sessionNamespace} allowCreate={allowCreate} canAdmin={canAdmin} onSelect={(manufacturer, saveProduct) => { onSelect(manufacturer, saveProduct); setOpen(false); }} onClear={(saveProduct) => { onClear(saveProduct); setOpen(false); }} onClose={() => setOpen(false)} /></Suspense> : null}
  </>;
}
