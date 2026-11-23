"use client";

import { memo, useState, type ReactNode } from "react";
import styles from "./photo.module.css";

type DayListProps = {
  remaining: readonly string[]; completed: readonly string[]; show: (id: string) => boolean;
  hasToday: boolean; searching: boolean; renderRow: (id: string, directions: boolean) => ReactNode;
};

type CompletedProps = Pick<DayListProps, "completed" | "show" | "renderRow">;

const CompletedRows = memo(function CompletedRows({ completed, show, renderRow }: CompletedProps & { open: boolean }) {
  const ids = completed.filter(show);
  return ids.length ? <ul className={styles.list}>{ids.map((id) => renderRow(id, false))}</ul>
    : <p className={styles.empty}>{completed.length ? "기록한 거래처는 촬영 카드에 표시되어 있어요." : "아직 기록된 납품사진이 없습니다."}</p>;
// Refresh changed catalog/completion membership even while collapsed. Other
// row updates can wait until the browser exposes these controls again.
}, (previous, next) => previous.completed === next.completed
  && (!next.open || (previous.show === next.show && previous.renderRow === next.renderRow)));

function CompletedList({ searching, ...rows }: CompletedProps & { searching: boolean }) {
  const [view, setView] = useState<"new" | "open" | "closed">("new");
  return <details className={styles.completed} hidden={searching} data-photo-list="completed"
    onToggle={(event) => setView(event.currentTarget.open ? "open" : "closed")}>
    <summary onClick={(event) => setView(event.currentTarget.parentElement?.hasAttribute("open") ? "closed" : "open")}>
      기록완료 {rows.completed.length}곳
    </summary>
    {view !== "new" && !searching && <CompletedRows {...rows} open={view === "open"} />}
  </details>;
}

export default function DeliveryPhotoDayLists({ remaining, completed, show, hasToday, searching, renderRow }: DayListProps) {
  const remainingIds = searching ? [] : remaining.filter(show);
  const remainingMessage = remaining.length ? "남은 거래처는 촬영 카드에 표시되어 있어요."
    : hasToday ? "오늘 목록의 모든 거래처에 사진 기록이 있습니다." : "오늘 납품처가 비어 있어요.";
  return <>
    <section className={styles.section} hidden={searching} data-photo-list="remaining" aria-labelledby="delivery-photo-remaining-heading">
      <h2 id="delivery-photo-remaining-heading" tabIndex={-1}>오늘 남은 납품처</h2>
      {!searching && (remainingIds.length ? <ul className={styles.list}>{remainingIds.map((id) => renderRow(id, true))}</ul>
        : <p className={styles.empty}>{remainingMessage}</p>)}
    </section>
    <CompletedList completed={completed} searching={searching} show={show} renderRow={renderRow} />
  </>;
}
