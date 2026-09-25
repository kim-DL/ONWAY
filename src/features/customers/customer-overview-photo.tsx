"use client";

/* eslint-disable @next/next/no-img-element -- Authenticated, revocable blob URLs must not enter a shared image optimizer. */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";

import { Icon } from "@/components/ui/icon";
import { OnnuriLoader } from "@/components/ui/onnuri-loader";
import type { Customer } from "@/domain/customer";
import { useAuth } from "@/features/auth/auth-context";

import { CustomerStorefrontIcon } from "./customer-storefront-icon";
import { useCustomerPhoto } from "./use-customer-photo";
import styles from "./customer-overview-photo.module.css";

const CustomerPhotoViewer = dynamic(() => import("./customer-photo-viewer"));

interface CustomerOverviewPhotoProps {
  customer: Customer;
  variant?: "thumbnail" | "preview";
  className?: string;
  expandable?: boolean;
}

const getOnline = () => navigator.onLine;
const getServerOnline = () => false;
function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); };
}

export function CustomerOverviewPhoto({ customer, variant = "preview", className = "", expandable = false }: CustomerOverviewPhotoProps) {
  if (!customer.overviewPhoto) return variant === "thumbnail"
    ? <span className={`${styles.thumbnail} ${className}`} aria-hidden="true" data-customer-photo="placeholder"><span className={styles.placeholder}><CustomerStorefrontIcon /></span></span>
    : null;
  return <AuthenticatedPhoto key={`${customer.customerId}:${customer.overviewPhoto.photoId}:${variant}`} customer={customer} variant={variant} className={className} expandable={expandable} />;
}

function AuthenticatedPhoto({ customer, variant = "preview", className = "", expandable = false }: CustomerOverviewPhotoProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<{ url: string; origin: HTMLElement | null } | null>(null);
  const { state: auth } = useAuth();
  const online = useSyncExternalStore(subscribeOnline, getOnline, getServerOnline);
  const sessionKey = auth.status === "authenticated" ? `${auth.session.uid}:${auth.session.claims.sessionVersion}:${auth.session.claims.permissionsVersion}` : null;
  useEffect(() => {
    const target = hostRef.current;
    if (!target) return;
    if (typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setNearViewport(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: "160px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  const photo = useCustomerPhoto(customer.customerId, customer.overviewPhoto!.photoId, sessionKey, variant, online && nearViewport);
  const failed = photo.status === "error" || (photo.url !== null && failedImage === photo.url);
  const ready = photo.status === "ready" && !failed;
  return <span ref={hostRef} className={`${variant === "thumbnail" ? styles.thumbnail : styles.preview} ${className}`} data-customer-photo={ready ? "ready" : failed ? "error" : photo.status === "loading" ? "loading" : "placeholder"} aria-hidden={variant === "thumbnail" || undefined}>
    {ready ? <>
      <img src={photo.url!} width={customer.overviewPhoto!.width} height={customer.overviewPhoto!.height} alt={variant === "thumbnail" ? "" : `${customer.name} 전경 사진`} decoding="async" onError={() => setFailedImage(photo.url)} />
      {variant === "preview" && expandable ? <button type="button" className={styles.expandPhoto} aria-label={`${customer.name} 전경사진 크게 보기`} onClick={() => { if (photo.url) setExpanded({ url: photo.url, origin: hostRef.current }); }}><span><Icon name="zoom-in" size={17} />크게 보기</span></button> : null}
      {variant === "preview" && expandable && photo.url && expanded?.url === photo.url ? <CustomerPhotoViewer url={photo.url} name={customer.name} origin={expanded.origin} onClose={() => setExpanded(null)} onImageError={() => { setFailedImage(photo.url); setExpanded(null); }} /> : null}
    </> : <span className={styles.placeholder}>
      {photo.status === "loading" && online ? <OnnuriLoader size={variant === "thumbnail" ? "small" : "medium"} tone="customer" decorative /> : <CustomerStorefrontIcon />}
      {variant === "preview" ? <span role="status">{!online ? "사진은 온라인에서 확인할 수 있어요." : failed ? "사진을 불러오지 못했어요." : "사진을 불러오고 있어요."}</span> : null}
      {variant === "preview" && failed && online ? <button type="button" onClick={photo.retry}><Icon name="refresh" size={16} />다시 불러오기</button> : null}
    </span>}
  </span>;
}
