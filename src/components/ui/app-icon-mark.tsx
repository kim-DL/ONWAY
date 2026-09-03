import type { SVGProps } from "react";

export function AppIconMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-label="급식길" {...props}>
      <rect width="64" height="64" rx="18" fill="#153f35" />
      <rect x="15" y="18" width="34" height="6" rx="3" fill="#d8e563" />
      <rect x="15" y="29" width="21" height="6" rx="3" fill="#d8e563" />
      <rect x="15" y="40" width="34" height="6" rx="3" fill="#d8e563" />
      <circle cx="44" cy="34" r="6" fill="#e97132" />
    </svg>
  );
}
