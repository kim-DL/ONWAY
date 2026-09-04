import type { SVGProps } from "react";

export function AppIconMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-label="온누리종합식품" {...props}>
      <image
        href="/icons/onnuriway-company-icon-192-v3.png"
        width="64"
        height="64"
        preserveAspectRatio="xMidYMid slice"
      />
    </svg>
  );
}
