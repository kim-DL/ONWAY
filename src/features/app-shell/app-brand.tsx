import { AppIconMark } from "@/components/ui/app-icon-mark";
import styles from "./app-brand.module.css";

export function AppBrand({ compact = false, openInbox, unread = false }: { compact?: boolean; openInbox?: (() => void) | undefined; unread?: boolean }) {
  const Tag = openInbox ? "button" : "div";
  return (
    <Tag {...(openInbox && {type: "button" as const, onClick: openInbox, style: {position: "relative" as const, padding: 0, border: 0, background: "transparent", color: "inherit", cursor: "pointer", minHeight: 44}, "aria-label": unread ? "재고 알림함 · 미확인 알림 있음" : "재고 알림함", "aria-haspopup": "dialog" as const, "data-unread": unread})} className={compact ? "app-brand" : "app-brand app-brand--signature"}>
      {openInbox && unread && <span aria-hidden="true" style={{position: "absolute", top: 2, right: 1, width: 9, height: 9, borderRadius: "50%", background: "#b44432", border: "2px solid white"}} />}
      <span className="app-brand__mark" aria-hidden="true">
        <AppIconMark variant={compact ? "icon" : "company"} />
      </span>
      <span className="app-brand__wordmark">
        <strong>{compact ? "급식길" : <span className={styles.companyName} data-company-wordmark><span className={styles.nameLead}>온누리</span><span className={styles.nameDescriptor}>종합식품</span></span>}</strong>
        {compact ? null : <small>급식길</small>}
      </span>
    </Tag>
  );
}
