"use client";
/* eslint-disable @next/next/no-img-element -- Private blob URLs already resized by the existing optimizer; never send them to a public image proxy. */
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/features/auth/auth-context";
import { registerPrivateClientCleanup } from "@/features/auth/private-client-cleanup-registry";
import { inventoryAccessGeneration, subscribeInventoryAccessFailure } from "./inventory-access-boundary";
import type { InventoryProduct } from "@/domain/inventory";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { registerPrivateBlobUrl, forgetPrivateBlobUrl } from "@/features/auth/private-client-state";
import { inventoryRepository, inventoryErrorMessage } from "./inventory-repository";
import styles from "./inventory.module.css";

const InventoryPhotoViewer = dynamic(() => import("./inventory-photo-viewer").then((module) => module.InventoryPhotoViewer), { ssr: false });

export function InventoryPhoto({ product, expandable = false }: { product: InventoryProduct; expandable?: boolean }) {
  const origin = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<{ key: string | null; url?: string; error?: string } | null>(null);
  const [expanded, setExpanded] = useState<{ url: string; origin: HTMLElement | null } | null>(null);
  const [retry, setRetry] = useState(0);
  const photoId = product.photo?.photoId;
  const { state: auth } = useAuth();
  const sessionKey = auth.status === "authenticated" ? `${auth.session.uid}:${auth.session.claims.sessionVersion}:${auth.session.claims.permissionsVersion}` : null;
  const imageKey = sessionKey && photoId ? `${sessionKey}:${product.productId}:${photoId}` : null;
  const current = image?.key === imageKey ? image : null;
  const url = current?.url;
  const error = current?.error;
  useEffect(() => {
    if (!photoId || !imageKey) return;
    const generation = inventoryAccessGeneration();
    let cancelled = false;
    let ownedUrl: string | null = null;
    const clear = () => {
      cancelled = true;
      if (ownedUrl) { forgetPrivateBlobUrl(ownedUrl); ownedUrl = null; }
      setImage(null); setExpanded(null);
    };
    const unregister = registerPrivateClientCleanup(clear);
    const unsubscribe = subscribeInventoryAccessFailure(clear);
    void inventoryRepository.photo(product.productId, photoId).then((photo) => {
      if (cancelled || inventoryAccessGeneration() !== generation) return;
      const binary = atob(photo.fileBase64);
      if (binary.length !== photo.byteSize) throw new Error("Invalid inventory photo");
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      ownedUrl = URL.createObjectURL(new Blob([bytes], { type: photo.contentType }));
      registerPrivateBlobUrl(ownedUrl); setImage({ key: imageKey, url: ownedUrl });
    }).catch((cause) => { if (!cancelled) { setImage({ key: imageKey, error: inventoryErrorMessage(cause) }); setExpanded(null); } });
    return () => { cancelled = true; unregister(); unsubscribe(); if (ownedUrl) forgetPrivateBlobUrl(ownedUrl); };
  }, [product.productId, photoId, imageKey, retry]);
  if (!photoId) return null;
  const failed = () => { if (url) forgetPrivateBlobUrl(url); setExpanded(null); setImage({ key: imageKey, error: "사진을 표시하지 못했어요. 다시 불러와주세요." }); };
  return <div ref={origin} className={styles.photo}>{url ? <>{expandable ? <button type="button" className={styles.photoOpen} onClick={() => setExpanded({ url, origin: origin.current })} aria-label={`${product.name} 제품 사진 크게 보기`}><img src={url} alt={`${product.name} 제품 사진`} onError={failed} /><span className={styles.photoExpandHint}><Icon name="zoom-in" size={14} /></span></button> : <img src={url} alt={`${product.name} 제품 사진`} onError={failed} />}{expandable && expanded?.url === url ? <InventoryPhotoViewer url={url} name={product.name} origin={expanded.origin} onClose={() => setExpanded(null)} onImageError={failed} /> : null}</> : error ? <><p role="alert">{error}</p><GlassButton onClick={() => setRetry((value) => value + 1)}>사진 다시 보기</GlassButton></> : <p role="status">사진 불러오는 중</p>}</div>;
}
