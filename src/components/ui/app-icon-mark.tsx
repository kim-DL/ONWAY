import type { SVGProps } from "react";

export function AppIconMark({
  className,
  variant = "icon",
  ...props
}: SVGProps<SVGSVGElement> & { variant?: "icon" | "company" }) {
  const company = variant === "company";
  return (
    <svg className={className} viewBox={company ? "0 0 1200 446" : "0 0 64 64"} role="img" aria-label="온누리종합식품" {...props}>
      <image
        href={company ? "/brand/onnuri-food-logo.png" : "/icons/onnuriway-company-icon-192-v4.png"}
        width={company ? "1200" : "64"}
        height={company ? "446" : "64"}
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
}
