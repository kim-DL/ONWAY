"use client";

import { useId, useState } from "react";
import { INVENTORY_MAX_QUANTITY, inventoryQuantityFromPackages, type InventoryPackageQuantity, type InventoryProduct } from "@/domain/inventory";
import { inventoryUnitDisplayLabel } from "./inventory-model";
import styles from "./inventory.module.css";
import formStyles from "./inventory-form.module.css";

type Props = {
  product: Pick<InventoryProduct, "unitLabel" | "boxPackSize">;
  value: number;
  onChange: (value: number, packages?: InventoryPackageQuantity) => void;
  disabled: boolean;
  minimum?: number;
  label?: string;
};

export function QuantityFields({ product, value, onChange, disabled, minimum = 0, label = "수량" }: Props) {
  const id = useId();
  const unit = inventoryUnitDisplayLabel(product.unitLabel || "개");
  const [mode, setMode] = useState<"total" | "boxes">(product.boxPackSize ? "boxes" : "total");
  const [parts, setParts] = useState(() => ({
    boxes: product.boxPackSize && Number.isSafeInteger(value) ? String(Math.floor(value / product.boxPackSize)) : "",
    unitsPerBox: String(product.boxPackSize ?? ""),
    loose: product.boxPackSize && Number.isSafeInteger(value) ? String(value % product.boxPackSize) : "",
  }));
  const invalid = Number.isFinite(value) && (!Number.isSafeInteger(value) || value < minimum || value > INVENTORY_MAX_QUANTITY);
  function calculate(next: typeof parts) {
    setParts(next);
    const packages = { boxes: Number(next.boxes || 0), unitsPerBox: Number(next.unitsPerBox), loose: Number(next.loose || 0) };
    try {
      if (!next.boxes && !next.loose) throw new Error("empty quantity");
      onChange(inventoryQuantityFromPackages(packages.boxes, packages.loose, packages.unitsPerBox), packages);
    } catch { onChange(Number.NaN); }
  }
  function switchMode(next: "total" | "boxes") {
    if (mode === next) return;
    setMode(next);
    if (next === "total") { onChange(value); return; }
    const size = Number(parts.unitsPerBox);
    // Switching modes preserves a valid total, including an explicit zero.
    const known = Number.isSafeInteger(value) && value >= 0;
    calculate({ ...parts, boxes: known && size > 0 ? String(Math.floor(value / size)) : "",
      loose: known ? String(size > 0 ? value % size : value) : "" });
  }
  const error = value > INVENTORY_MAX_QUANTITY ? "입력 가능한 수량을 초과했어요." : minimum === 0 ? "0 이상의 정수를 입력해주세요." : "1 이상의 정수를 입력해주세요.";
  return <div className={formStyles.quantitySection}>
    <fieldset className={formStyles.expiryStatus} disabled={disabled}>
      <legend>{label} ({unit})</legend>
      <div>{(["total", "boxes"] as const).map((option) => <label key={option}>
        <input type="radio" name={`${id}-mode`} checked={mode === option} onChange={() => switchMode(option)} />
        {option === "total" ? "총수량 입력" : "박스로 계산"}
      </label>)}</div>
    </fieldset>
    {mode === "total" ? <label className={styles.field}><span className={formStyles.srOnly}>{label} ({unit})</span>
      <input type="number" inputMode="numeric" placeholder="예: 10" required min={minimum} max={INVENTORY_MAX_QUANTITY} step={1}
        value={Number.isFinite(value) ? value : ""} aria-label={`${label} (${unit})`} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.valueAsNumber)} disabled={disabled} />
    </label> : <>
      <div className={formStyles.packageGrid}>
        {([{ key: "boxes", title: "박스 수", suffix: "박스", max: INVENTORY_MAX_QUANTITY },
          { key: "unitsPerBox", title: "박스당 수량", suffix: `${unit}/박스`, max: 1_000_000 },
          { key: "loose", title: "낱개", suffix: unit, max: INVENTORY_MAX_QUANTITY }] as const).map(({ key, title, suffix, max }) =>
          <label key={key} className={styles.field}>{title}<div className={formStyles.packageInput}>
            <input aria-label={title} type="number" inputMode="numeric" min={key === "unitsPerBox" ? 1 : 0} max={max} step={1}
              required={key === "unitsPerBox"} placeholder={key === "unitsPerBox" ? "미등록" : "0"} value={parts[key]}
              onChange={(event) => calculate({ ...parts, [key]: event.target.value })} disabled={disabled} />
            <span>{suffix}</span>
          </div></label>)}
      </div>
      <p className={formStyles.packageHelp}>{product.boxPackSize
        ? `등록된 입수량은 ${product.boxPackSize}${unit}/박스입니다. 여기서 바꾸면 이번 계산에만 적용돼요.`
        : "박스 입수량이 미등록 상태예요. 이번 계산에 사용할 수량을 입력해주세요."}</p>
      <output className={formStyles.packageTotal} aria-live="polite" aria-atomic="true">
        {Number.isFinite(value) && !invalid ? <><span>{parts.boxes || "0"}박스 × {parts.unitsPerBox}{unit} + {parts.loose || "0"}{unit}</span><strong>총 {value.toLocaleString("ko-KR")} <small>{unit}</small></strong></>
          : <span>박스당 수량과 박스 수 또는 낱개를 확인해주세요.</span>}
      </output>
    </>}
    {invalid ? <span id={`${id}-error`} role="alert" className={styles.error}>{error}</span> : null}
  </div>;
}
