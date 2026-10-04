"use client";
/* eslint-disable @next/next/no-img-element -- Private blob URLs already resized by the existing optimizer; never send them to a public image proxy. */
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { InventoryProduct } from "@/domain/inventory";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { registerPrivateBlobUrl, forgetPrivateBlobUrl } from "@/features/auth/private-client-state";
import { inventoryRepository, inventoryErrorMessage } from "./inventory-repository";
import styles from "./inventory.module.css";

const InventoryPhotoViewer = dynamic(() => import("./inventory-photo-viewer").then((module) => module.InventoryPhotoViewer), { ssr: false });

export function InventoryPhoto({ product, expandable = false, showExpandHint = false }: { product: InventoryProduct; expandable?: boolean; showExpandHint?: boolean }) {
  const origin = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<{ url: string; origin: HTMLElement | null } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const photoId = product.photo?.photoId;
  useEffect(() => {
    if (!photoId) return;
    let cancelled = false;
    let ownedUrl: string | null = null;
    void inventoryRepository.photo(product.productId, photoId).then((photo) => {
      if (cancelled) return;
      const binary = atob(photo.fileBase64);
      if (binary.length !== photo.byteSize) throw new Error("Invalid inventory photo");
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      ownedUrl = URL.createObjectURL(new Blob([bytes], { type: photo.contentType }));
      registerPrivateBlobUrl(ownedUrl); setUrl(ownedUrl); setError("");
    }).catch((cause) => { if (!cancelled) setError(inventoryErrorMessage(cause)); });
    return () => { cancelled = true; if (ownedUrl) forgetPrivateBlobUrl(ownedUrl); };
  }, [product.productId, photoId, retry]);
  if (!photoId) return null;
  const failed = () => { setExpanded(null); setUrl(null); setError("사진을 표시하지 못했어요. 다시 불러와주세요."); };
  return <div ref={origin} className={styles.photo}>{url ? <>{expandable ? <button type="button" className={styles.photoOpen} onClick={() => setExpanded({ url, origin: origin.current })} aria-label={`${product.name} 제품 사진 크게 보기`}><img src={url} alt={`${product.name} 제품 사진`} onError={failed} />{showExpandHint ? <span className={styles.photoExpandHint}><Icon name="zoom-in" size={14} /></span> : null}</button> : <img src={url} alt={`${product.name} 제품 사진`} onError={failed} />}{expandable && expanded?.url === url ? <InventoryPhotoViewer url={url} name={product.name} origin={expanded.origin} onClose={() => setExpanded(null)} onImageError={failed} /> : null}</> : error ? <><p role="alert">{error}</p><GlassButton onClick={() => setRetry((value) => value + 1)}>사진 다시 보기</GlassButton></> : <p role="status">사진을 불러오고 있어요.</p>}</div>;
}
