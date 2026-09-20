"use client";

/* eslint-disable @next/next/no-img-element -- Private, server-resized thumbnails use revocable blob URLs, never a public image proxy. */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { InventoryProduct } from "@/domain/inventory";
import { useAuth } from "@/features/auth/auth-context";
import { forgetPrivateBlobUrl, registerPrivateBlobUrl } from "@/features/auth/private-client-state";
import { inventoryRepository } from "./inventory-repository";
import styles from "./inventory.module.css";

export function InventoryThumbnail({ product }: { product: InventoryProduct }) {
  const host = useRef<HTMLSpanElement>(null);
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const { state: auth } = useAuth();
  const sessionKey = auth.status === "authenticated" ? `${auth.session.uid}:${auth.session.claims.sessionVersion}:${auth.session.claims.permissionsVersion}` : null;
  const productId = product.productId;
  const photoId = product.photo?.photoId;
  const imageKey = sessionKey && photoId ? `${sessionKey}:${productId}:${photoId}` : null;

  useEffect(() => {
    const target = host.current;
    // Without observation support retain the safe placeholder instead of
    // downloading an entire offscreen catalog on older embedded browsers.
    if (!target || !imageKey || !photoId || typeof IntersectionObserver === "undefined") return;
    let disposed = false;
    let requested = false;
    let ownedUrl: string | null = null;
    const observer = new IntersectionObserver((entries) => {
      if (disposed || requested || !entries.some((entry) => entry.isIntersecting)) return;
      requested = true;
      observer.disconnect();
      void inventoryRepository.photo(productId, photoId, "thumbnail").then((photo) => {
        if (disposed) return;
        const binary = atob(photo.fileBase64);
        if (binary.length !== photo.byteSize) throw new Error("Invalid inventory thumbnail");
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        ownedUrl = registerPrivateBlobUrl(URL.createObjectURL(new Blob([bytes], { type: photo.contentType })));
        setImage({ key: imageKey, url: ownedUrl });
      }).catch(() => {
        // A missing or unauthorized photo must never block opening the item.
      });
    }, { rootMargin: "120px 0px", threshold: 0 });
    observer.observe(target);
    return () => {
      disposed = true;
      observer.disconnect();
      if (ownedUrl) forgetPrivateBlobUrl(ownedUrl);
    };
  }, [imageKey, photoId, productId]);

  const ready = image !== null && image.key === imageKey;
  return <span ref={host} className={styles.thumbnail} aria-hidden="true" data-inventory-photo={ready ? "ready" : "placeholder"}>
    {ready ? <img src={image.url} width={64} height={64} alt="" decoding="async" onError={() => { forgetPrivateBlobUrl(image.url); setImage(null); }} /> : <Icon name="camera" size={25} />}
  </span>;
}
