"use client";

import { useId } from "react";

export function DeliveryPhotoActionIcon({ variant, size = 40 }: { variant: "history" | "camera"; size?: number }) {
  const id = useId();
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-body`} x1="10" y1="7" x2="29" y2="35" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fff" /><stop offset=".52" stopColor="#f0f4f8" /><stop offset="1" stopColor="#c8d3e0" />
      </linearGradient>
      <linearGradient id={`${id}-lens`} x1="16" y1="14" x2="26" y2="29" gradientUnits="userSpaceOnUse">
        <stop stopColor="#7896b5" /><stop offset=".48" stopColor="#314f73" /><stop offset="1" stopColor="#182e4c" />
      </linearGradient>
    </defs>
    {variant === "camera" ? <>
      <path d="M12 10.5 14 7h12l2 3.5" fill={`url(#${id}-body)`} stroke="#8194aa" strokeLinejoin="round" />
      <rect x="3.5" y="10.5" width="33" height="24" rx="6" fill={`url(#${id}-body)`} stroke="#8e9fb3" />
      <path d="M9 13h21" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="20" cy="22.5" r="9" fill="#a9b9c9" stroke="#677e98" />
      <circle cx="20" cy="22.5" r="6.5" fill={`url(#${id}-lens)`} stroke="#314b69" />
      <path d="M16.5 20a4.5 4.5 0 0 1 5-1.5" stroke="#dce9f5" strokeWidth="1.5" strokeLinecap="round" opacity=".8" />
      <rect x="29.5" y="14" width="3.5" height="3" rx="1" fill="#fff" stroke="#9cacc0" />
      <path d="M8 32h24" stroke="#a8b6c7" strokeLinecap="round" opacity=".7" />
    </> : <>
      <rect x="8" y="5" width="25" height="25" rx="4" transform="rotate(8 8 5)" fill="#dce5ef" stroke="#91a4bb" />
      <rect x="4" y="8.5" width="28" height="25" rx="4.5" fill={`url(#${id}-body)`} stroke="#8e9fb3" />
      <rect x="7.5" y="12" width="21" height="16" rx="2" fill="#e6eef7" stroke="#b0c0d2" />
      <circle cx="23" cy="16.5" r="2.2" fill="#9eb6cd" />
      <path d="m8 26 6-7 4 4 3-3 7 7" fill="#98adc3" stroke="#7c95b0" strokeLinejoin="round" />
      <circle cx="30.5" cy="29.5" r="7.5" fill="#f7faff" stroke="#4a6c9b" strokeWidth="1.5" />
      <path d="M30.5 25.5V30l3 1.5" stroke="#345b91" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10.5h18" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </>}
  </svg>;
}
