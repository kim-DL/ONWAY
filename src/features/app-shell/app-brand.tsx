import { AppIconMark } from "@/components/ui/app-icon-mark";
import styles from "./app-brand.module.css";

export function AppBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "app-brand" : "app-brand app-brand--signature"}>
      <span className="app-brand__mark" aria-hidden="true">
        <AppIconMark variant={compact ? "icon" : "company"} />
      </span>
      <span className="app-brand__wordmark">
        <strong>{compact ? "급식길" : <span className={styles.companyName} data-company-wordmark><span className={styles.nameLead}>온누리</span><span className={styles.nameDescriptor}>종합식품</span></span>}</strong>
        {compact ? null : <small>급식길</small>}
      </span>
    </div>
  );
}
