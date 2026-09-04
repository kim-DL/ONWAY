import { AppIconMark } from "@/components/ui/app-icon-mark";

export function AppBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "app-brand" : "app-brand app-brand--signature"}>
      <span className="app-brand__mark" aria-hidden="true">
        <AppIconMark variant={compact ? "icon" : "company"} />
      </span>
      <span className="app-brand__wordmark">
        <strong>{compact ? "급식길" : "온누리종합식품"}</strong>
        {compact ? null : <small>급식길</small>}
      </span>
    </div>
  );
}
