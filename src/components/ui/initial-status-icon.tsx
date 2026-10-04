import type { SVGProps } from "react";

type InitialStatusIconName = "refresh" | "wifi-off";

interface InitialStatusIconProps extends SVGProps<SVGSVGElement> {
  name: InitialStatusIconName;
  size?: number;
}

const paths: Readonly<Record<InitialStatusIconName, React.ReactNode>> = {
  refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9a7 7 0 0 1 11.6-2.6L20 8M4 16l2.3 1.6A7 7 0 0 0 17.9 15" /></>,
  "wifi-off": <><path d="m3 3 18 18" /><path d="M8.5 8.5A10.8 10.8 0 0 1 21 9M3 9a15.8 15.8 0 0 1 2.8-1.6M6.5 13a8 8 0 0 1 6.7-2.1M18 13a8.3 8.3 0 0 1 1 .8M9 17a4.4 4.4 0 0 1 6 0M12 21h.01" /></>,
};

export function InitialStatusIcon({ name, size = 20, ...props }: InitialStatusIconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
